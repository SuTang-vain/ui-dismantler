"""Trusted Playwright action execution for runtime observation.

Executes constrained click/fill/press/focus/check/uncheck/select actions
against the headless browser, with input-value redaction in error messages
to avoid leaking secrets into the UI-IR evidence.
"""

from __future__ import annotations

import re
from typing import Any


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


