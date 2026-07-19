"""Condition/assertion rule evaluation for runtime observation.

Evaluates DOM condition rules (exists/missing/visible/hidden/enabled/disabled/
checked/unchecked/text/attribute/count) against the headless browser without
copying expected values or page text into the evidence (no secret leakage).
"""

from __future__ import annotations

from typing import Any


def _bounded_error(exc: Exception | str) -> str:
    if isinstance(exc, Exception):
        return f"{type(exc).__name__}: {exc}"[:600]
    return str(exc)[:600]


def _rule_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


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

