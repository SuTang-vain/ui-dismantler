"""Conservative focus-indicator analysis over before/after style snapshots."""
from __future__ import annotations
from typing import Any
from .colors import parse_css_color

_BORDER_WIDTH_FIELDS = ("borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth")
_BORDER_COLOR_FIELDS = ("borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor")


def _px(value: Any) -> float:
    try:
        return float(str(value or "0").strip().removesuffix("px"))
    except ValueError:
        return 0.0


def _visible_color(value: Any) -> bool:
    parsed = parse_css_color(value)
    return parsed is not None and parsed[3] > 0.01


def _records(value: Any) -> dict[str, dict[str, Any]] | None:
    if not isinstance(value, list):
        return None
    output: dict[str, dict[str, Any]] = {}
    for item in value:
        if not isinstance(item, dict) or not isinstance(item.get("scope"), str) or not isinstance(item.get("style"), dict):
            return None
        output[item["scope"]] = item["style"]
    return output


def analyze_focus_indicator(context: Any) -> tuple[dict[str, Any] | None, str | None]:
    """Return visual indicator evidence, or a stable uncertainty reason.

    A missing indicator is conclusive only when the target is focused and the
    browser reports that ``:focus-visible`` matches. Otherwise the probe is
    explicitly uncertain and must not produce a violation.
    """
    if not isinstance(context, dict):
        return None, "missing-focus-context"
    if not context.get("focusable"):
        return None, "not-focusable"
    if not context.get("focused"):
        return None, "focus-not-observed"
    before = _records(context.get("before"))
    after = _records(context.get("after"))
    if before is None or after is None:
        return None, "invalid-focus-style-snapshots"
    changes: list[dict[str, Any]] = []
    indicator = False
    for scope in sorted(set(before) | set(after)):
        old, new = before.get(scope, {}), after.get(scope, {})
        changed = sorted(field for field in set(old) | set(new) if old.get(field) != new.get(field))
        if not changed:
            continue
        changes.append({"scope": scope, "properties": changed})
        outline_visible = (
            new.get("outlineStyle") not in (None, "", "none", "hidden")
            and _px(new.get("outlineWidth")) > 0
            and _visible_color(new.get("outlineColor"))
        )
        shadow_visible = "boxShadow" in changed and str(new.get("boxShadow") or "none").strip().lower() != "none"
        border_visible = any(
            width in changed or color in changed
            for width, color in zip(_BORDER_WIDTH_FIELDS, _BORDER_COLOR_FIELDS)
            if _px(new.get(width)) > 0 and _visible_color(new.get(color))
        )
        paint_change = any(field in changed for field in (
            "backgroundColor", "color", "textDecorationLine", "textDecorationColor",
            "textDecorationThickness", "transform", "filter", "opacity",
        ))
        pseudo_content = scope.endswith("::before") or scope.endswith("::after")
        content_visible = pseudo_content and "content" in changed and str(new.get("content") or "").strip().lower() not in ("", "none", "normal", '""')
        indicator = indicator or outline_visible or shadow_visible or border_visible or paint_change or content_visible
    evidence = {
        "focusVisible": bool(context.get("focusVisible")),
        "indicatorDetected": indicator,
        "changes": changes,
    }
    if indicator:
        return evidence, None
    if not context.get("focusVisible"):
        return None, "focus-visible-not-observed"
    return evidence, None
