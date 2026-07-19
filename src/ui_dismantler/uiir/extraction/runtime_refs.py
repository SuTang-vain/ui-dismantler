"""可选的浏览器运行时 DOM/事件观察。

通过 Playwright 在隔离的无头浏览器中打开本地 HTML，记录：
- EventTarget.addEventListener 的真实注册；
- 页面加载完成后仍存在的 on* property handler；
- 可选的、受限的合成事件调用次数。

该模块是增强项：Playwright、浏览器或页面运行失败时只返回 warnings，
不会阻断 manifest → UI-IR 的静态转换。
"""

from __future__ import annotations

from pathlib import Path
import hashlib
import json
import re
from typing import Any
from urllib.parse import unquote, urlparse

from .local_refs import resolve_local_reference


_INIT_SCRIPT = r"""
(() => {
  const records = [];
  const errors = [];
  const propertyKeys = new Set();
  let nextId = 1;
  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;
  const listenerMaps = new WeakMap();

  function stackLocation() {
    const stack = String(new Error().stack || '').split('\n');
    for (const line of stack) {
      if (line.includes('__uiirRuntime') || line.includes('stackLocation')) continue;
      const match = line.match(/((?:file|https?):\/\/[^\s)]+):(\d+):(\d+)/);
      if (match) return {url: match[1], line: Number(match[2]), column: Number(match[3])};
    }
    return null;
  }

  function selectorFor(target) {
    if (target === window) return 'window';
    if (target === document) return 'document';
    if (!(target instanceof Element)) return target && target.constructor ? target.constructor.name : 'unknown';
    if (target.id) return '#' + CSS.escape(target.id);
    for (const name of ['data-testid', 'data-key', 'data-p', 'data-id']) {
      const value = target.getAttribute(name);
      if (value) return '[' + name + '="' + String(value).replace(/"/g, '\\"') + '"]';
    }
    const classes = Array.from(target.classList || []).filter(Boolean).slice(0, 3);
    let selector = target.tagName.toLowerCase() + classes.map(value => '.' + CSS.escape(value)).join('');
    if (target.parentElement) {
      const peers = Array.from(target.parentElement.children).filter(node => node.tagName === target.tagName);
      if (peers.length > 1) selector += ':nth-of-type(' + (peers.indexOf(target) + 1) + ')';
    }
    return selector;
  }

  function optionView(options) {
    if (typeof options === 'boolean') return {capture: options};
    if (!options || typeof options !== 'object') return {};
    return {capture: !!options.capture, once: !!options.once, passive: !!options.passive};
  }

  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (!listener) return originalAdd.call(this, type, listener, options);
    const record = {
      id: nextId++, target: this, event: String(type), api: 'addEventListener',
      options: optionView(options), location: stackLocation(), invocationCount: 0
    };
    records.push(record);
    let wrapped = listener;
    if (typeof listener === 'function') {
      wrapped = function(...args) {
        record.invocationCount += 1;
        return listener.apply(this, args);
      };
    } else if (listener && typeof listener.handleEvent === 'function') {
      wrapped = {handleEvent(...args) {
        record.invocationCount += 1;
        return listener.handleEvent.apply(listener, args);
      }};
    }
    let entries = listenerMaps.get(this);
    if (!entries) { entries = []; listenerMaps.set(this, entries); }
    entries.push({type: String(type), listener, wrapped, capture: !!(typeof options === 'boolean' ? options : options && options.capture)});
    return originalAdd.call(this, type, wrapped, options);
  };

  EventTarget.prototype.removeEventListener = function(type, listener, options) {
    const capture = !!(typeof options === 'boolean' ? options : options && options.capture);
    const entries = listenerMaps.get(this) || [];
    const found = entries.find(entry => entry.type === String(type) && entry.listener === listener && entry.capture === capture);
    return originalRemove.call(this, type, found ? found.wrapped : listener, options);
  };

  originalAdd.call(window, 'error', event => {
    errors.push(String(event.error && event.error.message || event.message || event));
  });
  originalAdd.call(window, 'unhandledrejection', event => {
    errors.push(String(event.reason && event.reason.message || event.reason || event));
  });

  function refreshPropertyRecords() {
    const roots = [window, document, ...document.querySelectorAll('*')];
    for (const target of roots) {
      const names = [];
      if (target instanceof Element) {
        for (const attr of target.getAttributeNames()) if (attr.startsWith('on')) names.push(attr);
      }
      for (const event of ['click','change','input','submit','focus','blur','keydown','keyup','touchstart','touchend']) {
        const name = 'on' + event;
        try { if (typeof target[name] === 'function') names.push(name); } catch (_) {}
      }
      for (const name of new Set(names)) {
        const event = name.slice(2);
        const selector = selectorFor(target);
        const key = selector + '\u0000' + event + '\u0000property-handler';
        if (propertyKeys.has(key)) continue;
        propertyKeys.add(key);
        records.push({
          id: nextId++, target, event, api: 'property-handler', options: {},
          location: null, invocationCount: 0, propertyName: name, wrappedProperty: null
        });
      }
    }
  }

  function preparePropertyTracking() {
    refreshPropertyRecords();
    for (const record of records) {
      if (record.api !== 'property-handler' || !record.propertyName) continue;
      let current;
      try { current = record.target[record.propertyName]; } catch (_) { continue; }
      if (current === record.wrappedProperty || typeof current !== 'function') continue;
      const original = current;
      const wrapped = function(...args) {
        record.invocationCount += 1;
        return original.apply(this, args);
      };
      try {
        record.target[record.propertyName] = wrapped;
        if (record.target[record.propertyName] === wrapped) record.wrappedProperty = wrapped;
      } catch (_) {}
    }
  }

  function isVisible(target) {
    if (!(target instanceof Element) || !target.isConnected || target.hidden) return false;
    const style = getComputedStyle(target);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = target.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function collectCandidates(limit) {
    refreshPropertyRecords();
    const targets = new Set(document.querySelectorAll(
      'button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="checkbox"],[onclick]'
    ));
    for (const record of records) {
      if (record.target instanceof Element && record.target.isConnected) targets.add(record.target);
    }
    const output = [];
    for (const target of targets) {
      if (output.length >= limit) break;
      const tag = target.tagName.toLowerCase();
      const type = String(target.getAttribute('type') || '').toLowerCase();
      const role = String(target.getAttribute('role') || '').toLowerCase();
      let action = 'click';
      if (tag === 'select') action = 'select';
      else if (tag === 'textarea' || (tag === 'input' && !['button','submit','reset','checkbox','radio','file','image'].includes(type))) action = 'fill';
      else if (tag === 'input' && ['checkbox','radio'].includes(type)) action = 'check';
      const events = Array.from(new Set(records.filter(record => record.target === target).map(record => record.event))).sort();
      const navigationRisk = tag === 'a' || type === 'submit' || !!target.closest('form') && action === 'click';
      output.push({
        selector: selectorFor(target), action, tag, type, role,
        visible: isVisible(target),
        disabled: !!target.disabled || target.getAttribute('aria-disabled') === 'true',
        requiresInput: action === 'fill' || action === 'select',
        sensitiveInput: type === 'password',
        navigationRisk,
        events,
        inlineHandler: target.hasAttribute('onclick') || target.hasAttribute('onchange') || target.hasAttribute('oninput')
      });
    }
    return output;
  }

  function runtimeState(limit) {
    const candidates = collectCandidates(limit);
    const elements = new Map(candidates.map(item => [item.selector, document.querySelector(item.selector)]));
    const selected = predicate => candidates.filter(item => {
      const target = elements.get(item.selector);
      return target && predicate(target, item);
    }).map(item => item.selector).sort();
    return {
      locationHash: location.hash || '',
      active: document.activeElement instanceof Element ? selectorFor(document.activeElement) : '',
      visible: candidates.filter(item => item.visible).map(item => item.selector).sort(),
      checked: selected(target => !!target.checked),
      disabled: candidates.filter(item => item.disabled).map(item => item.selector).sort(),
      expanded: selected(target => target.getAttribute('aria-expanded') === 'true')
    };
  }

  window.__uiirRuntime = {
    records, errors, selectorFor,
    prepare() { preparePropertyTracking(); return records.length; },
    candidates(limit) { return collectCandidates(Math.max(0, Number(limit) || 0)); },
    state(limit) { return runtimeState(Math.max(0, Number(limit) || 0)); },
    snapshot(limit) {
      refreshPropertyRecords();
      const output = records.map(record => ({
        id: record.id,
        selector: selectorFor(record.target),
        event: record.event,
        api: record.api,
        options: record.options,
        location: record.location,
        invocationCount: record.invocationCount
      }));
      const boundedLimit = Math.max(0, Number(limit) || 0);
      return {
        registrations: output,
        candidates: collectCandidates(boundedLimit),
        state: runtimeState(boundedLimit),
        errors: [...errors],
        domCount: document.querySelectorAll('*').length
      };
    },
    exercise(limit) {
      preparePropertyTracking();
      const allowed = new Set(['click','change','input','focus','blur','keydown','keyup','touchstart','touchend']);
      let count = 0;
      const exercised = new Set();
      for (const record of records) {
        if (count >= limit || !allowed.has(record.event)) continue;
        if (!(record.target instanceof Element) || !record.target.isConnected) continue;
        if (record.target.matches('a[href], form, input[type="submit"], button[type="submit"], :disabled, [aria-disabled="true"], [hidden], [inert]')) continue;
        const key = selectorFor(record.target) + '\u0000' + record.event;
        if (exercised.has(key)) continue;
        exercised.add(key);
        let event;
        if (record.event === 'click') event = new MouseEvent('click', {bubbles: true, cancelable: true});
        else if (record.event.startsWith('key')) event = new KeyboardEvent(record.event, {bubbles: true, cancelable: true, key: 'Enter'});
        else event = new Event(record.event, {bubbles: true, cancelable: true});
        try { record.target.dispatchEvent(event); count += 1; }
        catch (error) { errors.push(String(error && error.message || error)); }
      }
      return count;
    }
  };
})();
"""


def _line_span(path: Path, line: int) -> list[int] | None:
    if line < 1 or not path.is_file():
        return None
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    starts = [0]
    starts.extend(match.end() for match in re.finditer(r"\n", text))
    if line > len(starts):
        return None
    start = starts[line - 1]
    end = starts[line] if line < len(starts) else len(text)
    return [start, end]


def _normalize_location(location: Any, fallback_source: Path) -> dict[str, Any]:
    if not isinstance(location, dict):
        return {}
    url = str(location.get("url") or "")
    line = location.get("line")
    column = location.get("column")
    path = fallback_source
    if url:
        parsed = urlparse(url)
        if parsed.scheme == "file":
            path = Path(unquote(parsed.path))
            if not path.is_file():
                resolved = resolve_local_reference(fallback_source, parsed.path)
                if resolved is not None and resolved.is_file():
                    path = resolved
        elif parsed.scheme in {"http", "https"}:
            return {"source": url, "runtimeLine": line, "runtimeColumn": column}
    result: dict[str, Any] = {
        "source": str(path),
        "runtimeLine": line,
        "runtimeColumn": column,
    }
    if isinstance(line, int):
        span = _line_span(path, line)
        if span is not None:
            result["sourceSpan"] = span
    return {key: value for key, value in result.items() if value is not None}


def _empty(source: Path) -> dict[str, Any]:
    return {
        "source": str(source),
        "browser": None,
        "domCount": 0,
        "registrations": [],
        "errors": [],
        "exercised": 0,
        "actions": [],
        "scenarios": [],
        "trustedActions": 0,
        "failedActions": 0,
        "skippedActions": 0,
        "passedAssertions": 0,
        "failedAssertions": 0,
        "failureReplay": [],
        "candidates": [],
        "stateGraph": {"nodes": [], "edges": []},
        "coverage": {
            "scenarios": {"total": 0, "completed": 0, "failed": 0, "skipped": 0},
            "actions": {"total": 0, "completed": 0, "failed": 0, "skipped": 0},
            "assertions": {"total": 0, "passed": 0, "failed": 0},
            "conditions": {"total": 0, "passed": 0, "failed": 0},
            "registrations": {"registered": 0, "invoked": 0, "ratio": 0.0},
            "candidates": {"discovered": 0, "visible": 0, "actionable": 0, "requiresInput": 0, "navigationRisk": 0},
        },
    }


def _bounded_error(exc: Exception | str) -> str:
    if isinstance(exc, Exception):
        return f"{type(exc).__name__}: {exc}"[:600]
    return str(exc)[:600]


def _action_error(exc: Exception, raw: dict[str, Any]) -> str:
    """截断 Playwright 错误，并移除 fill/select 的原始输入值。"""
    message = f"{type(exc).__name__}: {exc}"
    value = raw.get("value")
    secrets = [value] if isinstance(value, str) else value if isinstance(value, list) else []
    for secret in secrets:
        if isinstance(secret, str) and secret:
            escaped = (
                secret.replace("\\", "\\\\")
                .replace('"', '\\"')
                .replace("\r", "\\r")
                .replace("\n", "\\n")
                .replace("\t", "\\t")
            )
            for variant in {secret, escaped}:
                message = message.replace(variant, "[REDACTED]")
    if str(raw.get("action") or "").strip().lower() in {"fill", "select"}:
        message = re.sub(
            r'(?m)\b(fill|select_option)\([^\n]*\)',
            lambda match: f'{match.group(1)}("[REDACTED]")',
            message,
        )
    return message[:600]


def _rule_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _normalize_runtime_state(raw: Any) -> dict[str, Any] | None:
    """规范化无文本、无输入值的轻量 DOM 状态，用于确定性状态图。"""
    if not isinstance(raw, dict):
        return None
    normalized: dict[str, Any] = {
        "locationHash": str(raw.get("locationHash") or "")[:256],
        "active": str(raw.get("active") or "")[:512],
    }
    for field in ("visible", "checked", "disabled", "expanded"):
        values = raw.get(field)
        if not isinstance(values, list):
            values = []
        normalized[field] = sorted({
            str(value)[:512] for value in values
            if isinstance(value, str) and value
        })
    return normalized


def _runtime_state_id(state: dict[str, Any]) -> str:
    payload = json.dumps(state, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return "state:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]


def _evaluate_rule(
    page: Any,
    raw: Any,
    index: int,
    timeout_ms: int,
    *,
    kind: str,
) -> dict[str, Any]:
    """执行无脚本 DOM 条件/断言；结果不复制预期值或页面文本。"""
    result: dict[str, Any] = {"index": index, "status": "failed"}
    field = "condition" if kind == "condition" else "assertion"
    if not isinstance(raw, dict):
        result["reason"] = "invalid"
        result["error"] = f"{field} 必须是 object"
        return result
    rule = str(raw.get(field) or raw.get("type") or "").strip().lower()
    selector = str(raw.get("selector") or "").strip()
    result.update({field: rule, "selector": selector})
    allowed = {
        "exists", "missing", "visible", "hidden", "enabled", "disabled",
        "checked", "unchecked", "text", "attribute", "count",
    }
    if rule not in allowed:
        result["reason"] = "invalid"
        result["error"] = f"不支持的 {field}：{rule or '<empty>'}"
        return result
    if not selector:
        result["reason"] = "invalid"
        result["error"] = "selector 不能为空"
        return result
    target_index = raw.get("index", 0)
    if isinstance(target_index, bool) or not isinstance(target_index, int) or target_index < 0:
        result["reason"] = "invalid"
        result["error"] = "index 必须是非负整数"
        return result
    probe_timeout = raw.get("timeoutMs", min(timeout_ms, 1000))
    if (
        isinstance(probe_timeout, bool)
        or not isinstance(probe_timeout, int)
        or probe_timeout < 100
    ):
        result["reason"] = "invalid"
        result["error"] = "timeoutMs 必须是不小于 100 的整数"
        return result
    probe_timeout = min(probe_timeout, timeout_ms)
    try:
        locator = page.locator(selector)
        matched = locator.count()
        result["matched"] = matched
        passed = False
        if rule == "exists":
            passed = matched > target_index
        elif rule == "missing":
            passed = matched <= target_index
        elif rule == "count":
            equals = raw.get("equals")
            minimum = raw.get("min")
            maximum = raw.get("max")
            values = (equals, minimum, maximum)
            if not any(value is not None for value in values):
                result["reason"] = "invalid"
                result["error"] = "count 必须提供 equals、min 或 max"
                return result
            if any(
                value is not None
                and (isinstance(value, bool) or not isinstance(value, int) or value < 0)
                for value in values
            ):
                result["reason"] = "invalid"
                result["error"] = "count 的 equals/min/max 必须是非负整数"
                return result
            passed = (
                (equals is None or matched == equals)
                and (minimum is None or matched >= minimum)
                and (maximum is None or matched <= maximum)
            )
        elif matched <= target_index:
            passed = rule == "hidden"
        else:
            target = locator.nth(target_index)
            if rule == "visible":
                passed = target.is_visible()
            elif rule == "hidden":
                passed = not target.is_visible()
            elif rule == "enabled":
                passed = target.is_enabled()
            elif rule == "disabled":
                passed = target.is_disabled()
            elif rule == "checked":
                passed = target.is_checked()
            elif rule == "unchecked":
                passed = not target.is_checked()
            elif rule == "text":
                equals = raw.get("equals")
                contains = raw.get("contains")
                if not isinstance(equals, str) and not isinstance(contains, str):
                    result["reason"] = "invalid"
                    result["error"] = "text 必须提供字符串 equals 或 contains"
                    return result
                actual = target.text_content(timeout=probe_timeout) or ""
                passed = (
                    (not isinstance(equals, str) or actual == equals)
                    and (not isinstance(contains, str) or contains in actual)
                )
            elif rule == "attribute":
                name = raw.get("name")
                equals = raw.get("equals")
                contains = raw.get("contains")
                if not isinstance(name, str) or not name:
                    result["reason"] = "invalid"
                    result["error"] = "attribute 必须提供非空 name"
                    return result
                if not isinstance(equals, str) and not isinstance(contains, str):
                    result["reason"] = "invalid"
                    result["error"] = "attribute 必须提供字符串 equals 或 contains"
                    return result
                result["attribute"] = name
                actual = target.get_attribute(name, timeout=probe_timeout)
                passed = actual is not None and (
                    (not isinstance(equals, str) or actual == equals)
                    and (not isinstance(contains, str) or contains in actual)
                )
        result["status"] = "passed" if passed else "failed"
        if not passed:
            result["reason"] = "unmet"
            result["error"] = f"{field} 未满足"
    except Exception as exc:
        result["reason"] = "evaluation-error"
        result["error"] = _bounded_error(exc)
    return result


def _perform_trusted_action(page: Any, raw: Any, index: int, timeout_ms: int) -> dict[str, Any]:
    result: dict[str, Any] = {"index": index, "status": "failed"}
    if not isinstance(raw, dict):
        result["error"] = "action 必须是 object"
        return result
    action = str(raw.get("action") or "").strip().lower()
    selector = str(raw.get("selector") or "").strip()
    result.update({"action": action, "selector": selector})
    allowed = {"click", "fill", "press", "focus", "check", "uncheck", "select"}
    if action not in allowed:
        result["error"] = f"不支持的 action：{action or '<empty>'}"
        return result
    if not selector:
        result["error"] = "selector 不能为空"
        return result
    target_index = raw.get("index", 0)
    if isinstance(target_index, bool) or not isinstance(target_index, int) or target_index < 0:
        result["error"] = "index 必须是非负整数"
        return result
    action_timeout = raw.get("timeoutMs", min(timeout_ms, 1500))
    if (
        isinstance(action_timeout, bool)
        or not isinstance(action_timeout, int)
        or action_timeout < 100
    ):
        result["error"] = "timeoutMs 必须是不小于 100 的整数"
        return result
    action_timeout = min(action_timeout, timeout_ms)
    after_ms = raw.get("afterMs", 25)
    if isinstance(after_ms, bool) or not isinstance(after_ms, int) or not 0 <= after_ms <= 2000:
        result["error"] = "afterMs 必须是 0 到 2000 的整数"
        return result
    try:
        locator = page.locator(selector)
        matched = locator.count()
        result["matched"] = matched
        if matched <= target_index:
            result["error"] = f"selector 仅命中 {matched} 个元素，无法选择 index={target_index}"
            return result
        target = locator.nth(target_index)
        if action == "click":
            target.click(timeout=action_timeout)
        elif action == "fill":
            value = raw.get("value")
            if not isinstance(value, str):
                result["error"] = "fill action 的 value 必须是字符串"
                return result
            target.fill(value, timeout=action_timeout)
        elif action == "press":
            key = raw.get("key")
            if not isinstance(key, str) or not key:
                result["error"] = "press action 的 key 必须是非空字符串"
                return result
            target.press(key, timeout=action_timeout)
        elif action == "focus":
            target.focus(timeout=action_timeout)
        elif action == "check":
            target.check(timeout=action_timeout)
        elif action == "uncheck":
            target.uncheck(timeout=action_timeout)
        elif action == "select":
            value = raw.get("value")
            if isinstance(value, str):
                target.select_option(value=value, timeout=action_timeout)
            elif isinstance(value, list) and all(isinstance(item, str) for item in value):
                target.select_option(value=value, timeout=action_timeout)
            else:
                result["error"] = "select action 的 value 必须是字符串或字符串数组"
                return result
        if after_ms:
            page.wait_for_timeout(after_ms)
        result["status"] = "completed"
    except Exception as exc:
        result["error"] = _action_error(exc, raw)
    return result


def _registration_key(item: dict[str, Any]) -> tuple[Any, ...]:
    options = item.get("options") if isinstance(item.get("options"), dict) else {}
    return (
        item.get("selector", ""), item.get("event", ""), item.get("api", ""),
        item.get("source", ""), item.get("runtimeLine") or 0,
        item.get("runtimeColumn") or 0,
        tuple(sorted((str(key), repr(value)) for key, value in options.items())),
    )


def _runtime_mode(trusted: bool, exercise: bool) -> str:
    if trusted and exercise:
        return "trusted-and-synthetic"
    if trusted:
        return "trusted-replay"
    if exercise:
        return "synthetic-exercise"
    return "passive-observation"


def _failure_pointer(
    scenario_id: str,
    *,
    kind: str,
    index: int | None = None,
    action_index: int | None = None,
    action: str | None = None,
    assertion: str | None = None,
    selector: str | None = None,
) -> dict[str, Any]:
    pointer: dict[str, Any] = {
        "scenarioId": scenario_id,
        "kind": kind,
        "requiresOriginalInput": True,
    }
    for key, value in (
        ("index", index), ("actionIndex", action_index), ("action", action),
        ("assertion", assertion), ("selector", selector),
    ):
        if value not in (None, ""):
            pointer[key] = value
    pointer["replayThroughAction"] = action_index if action_index is not None else index
    return pointer


def observe_runtime_references(
    source_path: str | Path,
    *,
    exercise: bool = False,
    timeout_ms: int = 5000,
    settle_ms: int = 150,
    max_exercises: int = 32,
    actions: list[dict[str, Any]] | None = None,
    scenarios: list[dict[str, Any]] | None = None,
    max_actions: int = 64,
    max_scenarios: int = 16,
    max_assertions: int = 128,
    max_candidates: int = 64,
) -> tuple[dict[str, Any], list[str]]:
    """在独立浏览器上下文中观察场景、事件注册和 listener 调用。"""
    source = Path(source_path).expanduser().resolve()
    result = _empty(source)
    if not source.is_file():
        return result, [f"运行时观察来源文件不存在：{source}"]
    if source.suffix.lower() not in {".html", ".htm"}:
        return result, []
    if timeout_ms < 100:
        return result, ["运行时观察 timeout_ms 必须不少于 100"]
    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        return result, [f"Playwright 不可用，已跳过运行时观察：{exc}"]

    scenario_inputs: list[Any] = []
    if actions is not None:
        scenario_inputs.append({"id": "default", "actions": actions})
    if scenarios is not None:
        scenario_inputs.extend(scenarios)
    if not scenario_inputs:
        scenario_inputs = [{"id": "observation", "actions": []}]
    warnings: list[str] = []
    if len(scenario_inputs) > max_scenarios:
        warnings.append(
            f"运行时场景共 {len(scenario_inputs)} 条，仅执行前 {max_scenarios} 条"
        )
        scenario_inputs = scenario_inputs[:max(0, max_scenarios)]

    browser = None
    registrations_by_key: dict[tuple[Any, ...], dict[str, Any]] = {}
    candidates_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    state_nodes_by_id: dict[str, dict[str, Any]] = {}
    state_edges: list[dict[str, Any]] = []
    remaining_actions = max(0, max_actions)
    remaining_assertions = max(0, max_assertions)
    candidate_limit = max(0, max_candidates)

    def record_state(page: Any, scenario_id: str) -> str | None:
        raw_state = page.evaluate(
            "limit => window.__uiirRuntime ? window.__uiirRuntime.state(limit) : null",
            candidate_limit,
        )
        state = _normalize_runtime_state(raw_state)
        if state is None:
            return None
        state_id = _runtime_state_id(state)
        node = state_nodes_by_id.get(state_id)
        if node is None:
            node = {
                "id": state_id,
                "activeSelector": state["active"],
                "locationHash": state["locationHash"],
                "visibleCandidates": len(state["visible"]),
                "checkedCandidates": len(state["checked"]),
                "disabledCandidates": len(state["disabled"]),
                "expandedCandidates": len(state["expanded"]),
                "scenarioIds": [scenario_id],
                "observations": 1,
            }
            state_nodes_by_id[state_id] = node
        else:
            node["observations"] += 1
            node["scenarioIds"] = sorted(set(node["scenarioIds"] + [scenario_id]))
        return state_id

    try:
        with sync_playwright() as playwright:
            launch_errors: list[str] = []
            browser_name = None
            for name in ("chromium", "webkit", "firefox"):
                try:
                    browser = getattr(playwright, name).launch(headless=True)
                    browser_name = name
                    break
                except Exception as exc:
                    launch_errors.append(f"{name}: {exc}")
            if browser is None:
                return result, ["无法启动 Playwright 浏览器：" + " | ".join(launch_errors)]
            result["browser"] = browser_name
            seen_scenario_ids: set[str] = set()

            for scenario_index, raw_scenario in enumerate(scenario_inputs):
                fallback_id = f"scenario-{scenario_index + 1}"
                scenario_id = fallback_id
                scenario_result: dict[str, Any] = {
                    "id": scenario_id,
                    "status": "failed",
                    "conditions": [],
                    "actions": [],
                    "assertions": [],
                    "trustedActions": 0,
                    "failedActions": 0,
                    "skippedActions": 0,
                    "passedAssertions": 0,
                    "failedAssertions": 0,
                    "registrations": 0,
                    "invokedRegistrations": 0,
                    "errors": [],
                }
                if not isinstance(raw_scenario, dict):
                    scenario_result["error"] = "scenario 必须是 object"
                    result["scenarios"].append(scenario_result)
                    result["failureReplay"].append(
                        _failure_pointer(scenario_id, kind="scenario", index=scenario_index)
                    )
                    continue
                raw_id = raw_scenario.get("id", fallback_id)
                if isinstance(raw_id, str) and raw_id.strip():
                    scenario_id = raw_id.strip()[:128]
                    scenario_result["id"] = scenario_id
                else:
                    scenario_result["error"] = "scenario id 必须是非空字符串"
                    result["scenarios"].append(scenario_result)
                    result["failureReplay"].append(
                        _failure_pointer(scenario_id, kind="scenario", index=scenario_index)
                    )
                    continue
                if scenario_id in seen_scenario_ids:
                    scenario_result["error"] = f"scenario id 重复：{scenario_id}"
                    result["scenarios"].append(scenario_result)
                    result["failureReplay"].append(
                        _failure_pointer(scenario_id, kind="scenario", index=scenario_index)
                    )
                    continue
                seen_scenario_ids.add(scenario_id)
                if isinstance(raw_scenario.get("name"), str) and raw_scenario["name"].strip():
                    scenario_result["name"] = raw_scenario["name"].strip()[:200]
                raw_actions = raw_scenario.get("actions", [])
                if not isinstance(raw_actions, list):
                    scenario_result["error"] = "scenario actions 必须是 array"
                    result["scenarios"].append(scenario_result)
                    result["failureReplay"].append(
                        _failure_pointer(scenario_id, kind="scenario", index=scenario_index)
                    )
                    continue
                stop_on_failure = raw_scenario.get("stopOnFailure", False)
                if not isinstance(stop_on_failure, bool):
                    scenario_result["error"] = "stopOnFailure 必须是 boolean"
                    result["scenarios"].append(scenario_result)
                    result["failureReplay"].append(
                        _failure_pointer(scenario_id, kind="scenario", index=scenario_index)
                    )
                    continue

                context = browser.new_context(service_workers="block")
                page = context.new_page()
                page.add_init_script(_INIT_SCRIPT)

                def route_request(route: Any) -> None:
                    parsed = urlparse(route.request.url)
                    if parsed.scheme in {"http", "https"}:
                        route.abort()
                        return
                    if parsed.scheme == "file":
                        requested = Path(unquote(parsed.path))
                        if not requested.is_file():
                            local_resource = resolve_local_reference(source, parsed.path)
                            if local_resource is not None and local_resource.is_file():
                                route.fulfill(path=str(local_resource))
                                return
                    route.continue_()

                page.route("**/*", route_request)
                try:
                    page.goto(source.as_uri(), wait_until="domcontentloaded", timeout=timeout_ms)
                    page.wait_for_timeout(max(0, settle_ms))
                    current_state_id = record_state(page, scenario_id)
                    if current_state_id is not None:
                        scenario_result["initialState"] = current_state_id
                    requested_conditions = _rule_list(raw_scenario.get("when"))
                    condition_limit_hit = len(requested_conditions) > remaining_assertions
                    if condition_limit_hit:
                        warnings.append(
                            f"场景 {scenario_id} 的条件受总上限限制，仅执行前 {remaining_assertions} 条"
                        )
                    condition_items = requested_conditions[:remaining_assertions]
                    remaining_assertions -= len(condition_items)
                    for condition_index, condition in enumerate(condition_items):
                        scenario_result["conditions"].append(_evaluate_rule(
                            page, condition, condition_index, timeout_ms, kind="condition"
                        ))
                    if condition_limit_hit:
                        scenario_result["conditions"].append({
                            "index": len(condition_items),
                            "status": "failed",
                            "condition": "limit",
                            "selector": "",
                            "error": "条件总上限已耗尽，场景未执行",
                        })
                        scenario_result["status"] = "failed"
                        result["failureReplay"].append(
                            _failure_pointer(scenario_id, kind="condition-limit")
                        )
                    elif any(
                        item.get("status") != "passed"
                        and item.get("reason") != "unmet"
                        for item in scenario_result["conditions"]
                    ):
                        scenario_result["status"] = "failed"
                        for condition_result in scenario_result["conditions"]:
                            if (
                                condition_result.get("status") != "passed"
                                and condition_result.get("reason") != "unmet"
                            ):
                                result["failureReplay"].append(_failure_pointer(
                                    scenario_id,
                                    kind="condition",
                                    index=condition_result.get("index"),
                                    selector=condition_result.get("selector"),
                                ))
                    elif any(
                        item.get("status") != "passed"
                        for item in scenario_result["conditions"]
                    ):
                        scenario_result["status"] = "skipped"
                    else:
                        action_limit_hit = len(raw_actions) > remaining_actions
                        if action_limit_hit:
                            warnings.append(
                                f"场景 {scenario_id} 的动作受总上限限制，仅执行前 {remaining_actions} 条"
                            )
                            scenario_result["truncatedActions"] = len(raw_actions) - remaining_actions
                            result["failureReplay"].append(
                                _failure_pointer(scenario_id, kind="action-limit")
                            )
                        selected_actions = raw_actions[:remaining_actions]
                        remaining_actions -= len(selected_actions)
                        failed_path = action_limit_hit
                        for action_index, action in enumerate(selected_actions):
                            action_failure_recorded = False
                            requested_action_conditions = _rule_list(
                                action.get("when") if isinstance(action, dict) else None
                            )
                            action_condition_limit_hit = (
                                len(requested_action_conditions) > remaining_assertions
                            )
                            if action_condition_limit_hit:
                                warnings.append(
                                    f"场景 {scenario_id} 动作 {action_index} 的条件受总上限限制"
                                )
                            action_conditions = requested_action_conditions[:remaining_assertions]
                            remaining_assertions -= len(action_conditions)
                            evaluated_conditions = [
                                _evaluate_rule(
                                    page, condition, index, timeout_ms, kind="condition"
                                )
                                for index, condition in enumerate(action_conditions)
                            ]
                            if action_condition_limit_hit:
                                evaluated_conditions.append({
                                    "index": len(action_conditions),
                                    "status": "failed",
                                    "condition": "limit",
                                    "selector": "",
                                    "error": "条件总上限已耗尽，动作未执行",
                                })
                                action_result: dict[str, Any] = {
                                    "index": action_index,
                                    "status": "failed",
                                    "action": str(action.get("action") or "") if isinstance(action, dict) else "",
                                    "selector": str(action.get("selector") or "") if isinstance(action, dict) else "",
                                    "conditions": evaluated_conditions,
                                    "error": "动作条件未完整评估",
                                }
                                failed_path = True
                                result["failureReplay"].append(_failure_pointer(
                                    scenario_id,
                                    kind="action-condition-limit",
                                    index=action_index,
                                    action_index=action_index,
                                    action=action_result.get("action"),
                                    selector=action_result.get("selector"),
                                ))
                                action_failure_recorded = True
                            elif any(
                                item.get("status") != "passed"
                                and item.get("reason") != "unmet"
                                for item in evaluated_conditions
                            ):
                                action_result = {
                                    "index": action_index,
                                    "status": "failed",
                                    "action": str(action.get("action") or "") if isinstance(action, dict) else "",
                                    "selector": str(action.get("selector") or "") if isinstance(action, dict) else "",
                                    "conditions": evaluated_conditions,
                                    "error": "动作条件无效或无法评估",
                                }
                                failed_path = True
                                result["failureReplay"].append(_failure_pointer(
                                    scenario_id,
                                    kind="action-condition",
                                    index=action_index,
                                    action_index=action_index,
                                    action=action_result.get("action"),
                                    selector=action_result.get("selector"),
                                ))
                                action_failure_recorded = True
                            elif any(
                                item.get("status") != "passed"
                                for item in evaluated_conditions
                            ):
                                action_result = {
                                    "index": action_index,
                                    "status": "skipped",
                                    "action": str(action.get("action") or "") if isinstance(action, dict) else "",
                                    "selector": str(action.get("selector") or "") if isinstance(action, dict) else "",
                                    "conditions": evaluated_conditions,
                                }
                            else:
                                page.evaluate(
                                    "() => window.__uiirRuntime ? window.__uiirRuntime.prepare() : 0"
                                )
                                action_result = _perform_trusted_action(
                                    page, action, action_index, timeout_ms
                                )
                                if evaluated_conditions:
                                    action_result["conditions"] = evaluated_conditions
                                requested_inline_assertions = _rule_list(
                                    action.get("assertions") if isinstance(action, dict) else None
                                )
                                inline_limit_hit = (
                                    len(requested_inline_assertions) > remaining_assertions
                                )
                                if inline_limit_hit:
                                    warnings.append(
                                        f"场景 {scenario_id} 动作 {action_index} 的断言受总上限限制"
                                    )
                                inline_assertions = requested_inline_assertions[:remaining_assertions]
                                remaining_assertions -= len(inline_assertions)
                                if action_result.get("status") == "completed":
                                    action_result["assertions"] = [
                                        _evaluate_rule(
                                            page, assertion, index, timeout_ms, kind="assertion"
                                        )
                                        for index, assertion in enumerate(inline_assertions)
                                    ]
                                    if inline_limit_hit:
                                        action_result["assertions"].append({
                                            "index": len(inline_assertions),
                                            "status": "failed",
                                            "assertion": "limit",
                                            "selector": "",
                                            "error": "断言总上限已耗尽",
                                        })
                                if action_result.get("status") == "failed":
                                    failed_path = True
                                    if not action_failure_recorded:
                                        result["failureReplay"].append(_failure_pointer(
                                            scenario_id,
                                            kind="action",
                                            index=action_index,
                                            action_index=action_index,
                                            action=action_result.get("action"),
                                            selector=action_result.get("selector"),
                                        ))
                                for assertion_result in action_result.get("assertions") or []:
                                    if assertion_result.get("status") != "passed":
                                        failed_path = True
                                        result["failureReplay"].append(_failure_pointer(
                                            scenario_id,
                                            kind="action-assertion",
                                            index=assertion_result.get("index"),
                                            action_index=action_index,
                                            assertion=assertion_result.get("assertion"),
                                            selector=assertion_result.get("selector"),
                                        ))
                            next_state_id = record_state(page, scenario_id)
                            if current_state_id is not None:
                                action_result["fromState"] = current_state_id
                            if next_state_id is not None:
                                action_result["toState"] = next_state_id
                            if current_state_id is not None and next_state_id is not None:
                                action_result["stateChanged"] = current_state_id != next_state_id
                                state_edges.append({
                                    "scenarioId": scenario_id,
                                    "actionIndex": action_index,
                                    "action": action_result.get("action", ""),
                                    "selector": action_result.get("selector", ""),
                                    "status": action_result.get("status", "failed"),
                                    "fromState": current_state_id,
                                    "toState": next_state_id,
                                })
                                current_state_id = next_state_id
                            scenario_result["actions"].append(action_result)
                            if stop_on_failure and failed_path:
                                scenario_result["stoppedAfterAction"] = action_index
                                break

                        requested_final_assertions = _rule_list(raw_scenario.get("assertions"))
                        final_limit_hit = len(requested_final_assertions) > remaining_assertions
                        if final_limit_hit:
                            warnings.append(
                                f"场景 {scenario_id} 的最终断言受总上限限制，仅执行前 {remaining_assertions} 条"
                            )
                        final_assertions = requested_final_assertions[:remaining_assertions]
                        remaining_assertions -= len(final_assertions)
                        scenario_result["assertions"] = [
                            _evaluate_rule(
                                page, assertion, index, timeout_ms, kind="assertion"
                            )
                            for index, assertion in enumerate(final_assertions)
                        ]
                        if final_limit_hit:
                            scenario_result["assertions"].append({
                                "index": len(final_assertions),
                                "status": "failed",
                                "assertion": "limit",
                                "selector": "",
                                "error": "断言总上限已耗尽",
                            })
                        for assertion_result in scenario_result["assertions"]:
                            if assertion_result.get("status") != "passed":
                                failed_path = True
                                result["failureReplay"].append(_failure_pointer(
                                    scenario_id,
                                    kind="assertion",
                                    index=assertion_result.get("index"),
                                    action_index=(
                                        len(scenario_result["actions"]) - 1
                                        if scenario_result["actions"] else None
                                    ),
                                    assertion=assertion_result.get("assertion"),
                                    selector=assertion_result.get("selector"),
                                ))
                        if exercise:
                            result["exercised"] += int(page.evaluate(
                                "limit => window.__uiirRuntime ? window.__uiirRuntime.exercise(limit) : 0",
                                max(0, max_exercises),
                            ))
                            page.wait_for_timeout(25)
                        scenario_result["status"] = "failed" if failed_path else "completed"

                    final_state_id = record_state(page, scenario_id)
                    if final_state_id is not None:
                        scenario_result["finalState"] = final_state_id
                    snapshot = page.evaluate(
                        "limit => window.__uiirRuntime ? window.__uiirRuntime.snapshot(limit) : null",
                        candidate_limit,
                    )
                    if not isinstance(snapshot, dict):
                        warnings.append(f"场景 {scenario_id} 未返回运行时观察快照")
                    else:
                        result["domCount"] = max(
                            result["domCount"], int(snapshot.get("domCount") or 0)
                        )
                        page_errors = [str(value) for value in snapshot.get("errors") or []]
                        scenario_result["errors"] = page_errors
                        result["errors"].extend(
                            f"{scenario_id}: {error}" for error in page_errors
                        )
                        if page_errors and scenario_result.get("status") == "completed":
                            scenario_result["status"] = "failed"
                            result["failureReplay"].append(
                                _failure_pointer(
                                    scenario_id,
                                    kind="page-error",
                                    action_index=(
                                        len(scenario_result["actions"]) - 1
                                        if scenario_result["actions"] else None
                                    ),
                                )
                            )
                        for raw_candidate in snapshot.get("candidates") or []:
                            if not isinstance(raw_candidate, dict):
                                continue
                            selector = str(raw_candidate.get("selector") or "")[:512]
                            action = str(raw_candidate.get("action") or "")[:32]
                            if not selector or not action:
                                continue
                            candidate = {
                                "selector": selector,
                                "action": action,
                                "tag": str(raw_candidate.get("tag") or "")[:32],
                                "type": str(raw_candidate.get("type") or "")[:64],
                                "role": str(raw_candidate.get("role") or "")[:64],
                                "visible": bool(raw_candidate.get("visible")),
                                "disabled": bool(raw_candidate.get("disabled")),
                                "requiresInput": bool(raw_candidate.get("requiresInput")),
                                "sensitiveInput": bool(raw_candidate.get("sensitiveInput")),
                                "navigationRisk": bool(raw_candidate.get("navigationRisk")),
                                "inlineHandler": bool(raw_candidate.get("inlineHandler")),
                                "events": sorted({
                                    str(value)[:64] for value in raw_candidate.get("events") or []
                                    if isinstance(value, str) and value
                                }),
                                "scenarioIds": [scenario_id],
                            }
                            key = (selector, action)
                            existing_candidate = candidates_by_key.get(key)
                            if existing_candidate is None:
                                candidates_by_key[key] = candidate
                            else:
                                existing_candidate["visible"] = existing_candidate["visible"] or candidate["visible"]
                                existing_candidate["disabled"] = existing_candidate["disabled"] and candidate["disabled"]
                                for field in ("requiresInput", "sensitiveInput", "navigationRisk", "inlineHandler"):
                                    existing_candidate[field] = existing_candidate[field] or candidate[field]
                                existing_candidate["events"] = sorted(set(existing_candidate["events"] + candidate["events"]))
                                existing_candidate["scenarioIds"] = sorted(set(existing_candidate["scenarioIds"] + [scenario_id]))

                        scenario_registrations: list[dict[str, Any]] = []
                        trusted = any(
                            item.get("status") == "completed"
                            for item in scenario_result["actions"]
                        )
                        mode = _runtime_mode(trusted, exercise)
                        for item in snapshot.get("registrations") or []:
                            if not isinstance(item, dict):
                                continue
                            selector = str(item.get("selector") or "")
                            event = str(item.get("event") or "")
                            if not selector or not event:
                                continue
                            location = _normalize_location(item.get("location"), source)
                            registration = {
                                "selector": selector,
                                "event": event,
                                "api": str(item.get("api") or "runtime"),
                                "options": item.get("options") if isinstance(item.get("options"), dict) else {},
                                "invocationCount": max(0, int(item.get("invocationCount") or 0)),
                                "runtimeMode": mode,
                                "scenarioIds": [scenario_id],
                                "invokedScenarioIds": (
                                    [scenario_id] if int(item.get("invocationCount") or 0) > 0 else []
                                ),
                                **location,
                            }
                            scenario_registrations.append(registration)
                            key = _registration_key(registration)
                            existing = registrations_by_key.get(key)
                            if existing is None:
                                registrations_by_key[key] = registration
                            else:
                                existing["invocationCount"] += registration["invocationCount"]
                                for field in ("scenarioIds", "invokedScenarioIds"):
                                    existing[field] = sorted(set(existing[field] + registration[field]))
                                modes = {existing.get("runtimeMode"), registration.get("runtimeMode")}
                                if "trusted-and-synthetic" in modes or (
                                    "trusted-replay" in modes and "synthetic-exercise" in modes
                                ):
                                    existing["runtimeMode"] = "trusted-and-synthetic"
                                elif "trusted-replay" in modes:
                                    existing["runtimeMode"] = "trusted-replay"
                                elif "synthetic-exercise" in modes:
                                    existing["runtimeMode"] = "synthetic-exercise"
                        scenario_result["registrations"] = len(scenario_registrations)
                        scenario_result["invokedRegistrations"] = sum(
                            1 for item in scenario_registrations
                            if item.get("invocationCount", 0) > 0
                        )
                except Exception as exc:
                    scenario_result["status"] = "failed"
                    scenario_result["error"] = _bounded_error(exc)
                    result["failureReplay"].append(
                        _failure_pointer(scenario_id, kind="scenario", index=scenario_index)
                    )
                finally:
                    context.close()

                for action_result in scenario_result["actions"]:
                    action_result["scenarioId"] = scenario_id
                    result["actions"].append(action_result)
                    status = action_result.get("status")
                    if status == "completed":
                        scenario_result["trustedActions"] += 1
                        result["trustedActions"] += 1
                    elif status == "skipped":
                        scenario_result["skippedActions"] += 1
                        result["skippedActions"] += 1
                    else:
                        scenario_result["failedActions"] += 1
                        result["failedActions"] += 1
                    for assertion_result in action_result.get("assertions") or []:
                        if assertion_result.get("status") == "passed":
                            scenario_result["passedAssertions"] += 1
                            result["passedAssertions"] += 1
                        else:
                            scenario_result["failedAssertions"] += 1
                            result["failedAssertions"] += 1
                for assertion_result in scenario_result["assertions"]:
                    if assertion_result.get("status") == "passed":
                        scenario_result["passedAssertions"] += 1
                        result["passedAssertions"] += 1
                    else:
                        scenario_result["failedAssertions"] += 1
                        result["failedAssertions"] += 1
                result["scenarios"].append(scenario_result)

            result["registrations"] = sorted(
                registrations_by_key.values(), key=_registration_key
            )
            result["candidates"] = sorted(
                candidates_by_key.values(), key=lambda item: (item["selector"], item["action"])
            )
            result["stateGraph"] = {
                "nodes": sorted(state_nodes_by_id.values(), key=lambda item: item["id"]),
                "edges": state_edges,
            }
            browser.close()
            browser = None
    except Exception as exc:
        warnings.append(f"运行时观察失败：{type(exc).__name__}: {exc}")
        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass

    scenario_counts = {"total": len(result["scenarios"]), "completed": 0, "failed": 0, "skipped": 0}
    for scenario in result["scenarios"]:
        status = scenario.get("status")
        if status in scenario_counts:
            scenario_counts[status] += 1
    action_counts = {
        "total": len(result["actions"]),
        "completed": result["trustedActions"],
        "failed": result["failedActions"],
        "skipped": result["skippedActions"],
    }
    all_conditions = [
        condition
        for scenario in result["scenarios"]
        for condition in scenario.get("conditions") or []
    ] + [
        condition
        for action in result["actions"]
        for condition in action.get("conditions") or []
    ]
    condition_counts = {
        "total": len(all_conditions),
        "passed": sum(item.get("status") == "passed" for item in all_conditions),
        "failed": sum(item.get("status") != "passed" for item in all_conditions),
    }
    assertion_counts = {
        "total": result["passedAssertions"] + result["failedAssertions"],
        "passed": result["passedAssertions"],
        "failed": result["failedAssertions"],
    }
    registered = len(result["registrations"])
    invoked = sum(
        1 for item in result["registrations"]
        if int(item.get("invocationCount") or 0) > 0
    )
    result["coverage"] = {
        "scenarios": scenario_counts,
        "actions": action_counts,
        "assertions": assertion_counts,
        "conditions": condition_counts,
        "registrations": {
            "registered": registered,
            "invoked": invoked,
            "ratio": round(invoked / registered, 4) if registered else 0.0,
        },
        "candidates": {
            "discovered": len(result["candidates"]),
            "visible": sum(bool(item.get("visible")) for item in result["candidates"]),
            "actionable": sum(
                bool(item.get("visible")) and not bool(item.get("disabled"))
                for item in result["candidates"]
            ),
            "requiresInput": sum(bool(item.get("requiresInput")) for item in result["candidates"]),
            "navigationRisk": sum(bool(item.get("navigationRisk")) for item in result["candidates"]),
        },
    }
    return result, warnings
