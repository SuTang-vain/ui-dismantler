"""Conservative analysis of bounded ARIA state and controlled-target evidence."""
from __future__ import annotations
from typing import Any

_STATE_VALUES = {
    "ariaExpanded": ("aria-expanded", {"true", "false", "undefined"}),
    "ariaSelected": ("aria-selected", {"true", "false", "undefined"}),
    "ariaPressed": ("aria-pressed", {"true", "false", "mixed", "undefined"}),
}


def invalid_aria_states(context: Any) -> list[dict[str, str]]:
    """Return present ARIA state attributes whose tokens are not valid."""
    if not isinstance(context, dict):
        return []
    invalid: list[dict[str, str]] = []
    for field, (attribute, accepted) in _STATE_VALUES.items():
        value = context.get(field)
        if value is None:
            continue
        token = str(value).strip().lower()
        if token not in accepted:
            invalid.append({"attribute": attribute, "value": str(value)})
    return invalid


def controlled_visibility_consistency(
    context: Any,
    role: str,
) -> tuple[dict[str, Any] | None, str | None]:
    """Compare expanded/selected state with bounded controlled-target visibility.

    The result is conclusive only when every referenced target was observed and
    the controls list was not truncated. It intentionally avoids inferring
    activation behavior or applying a repair.
    """
    if not isinstance(context, dict):
        return None, None

    expanded = context.get("ariaExpanded")
    expanded_token = expanded.strip().lower() if isinstance(expanded, str) else ""
    selected = context.get("ariaSelected")
    selected_token = selected.strip().lower() if isinstance(selected, str) else ""
    tab_state_relevant = role.strip().lower() == "tab" and selected_token in {"true", "false"}
    expanded_state_relevant = expanded_token in {"true", "false"}
    if not expanded_state_relevant and not tab_state_relevant:
        return None, None

    controlled = context.get("controlledTargets")
    if not isinstance(controlled, list) or not controlled:
        return None, None
    if context.get("controlsTruncated"):
        return None, "controlled-targets-truncated"
    if any(not isinstance(item, dict) or not item.get("found") for item in controlled):
        return None, "controlled-target-not-observed"

    visible_ids = [str(item.get("id") or "") for item in controlled if item.get("visible")]
    hidden_ids = [str(item.get("id") or "") for item in controlled if not item.get("visible")]
    mismatches: list[dict[str, Any]] = []

    if expanded_state_relevant:
        if expanded_token == "true" and not visible_ids:
            mismatches.append({"attribute": "aria-expanded", "value": expanded, "expected": "controlled target visible"})
        elif expanded_token == "false" and visible_ids:
            mismatches.append({"attribute": "aria-expanded", "value": expanded, "expected": "controlled target hidden"})

    if tab_state_relevant:
        if selected_token == "true" and not visible_ids:
            mismatches.append({"attribute": "aria-selected", "value": selected, "expected": "controlled tabpanel visible"})
        elif selected_token == "false" and visible_ids:
            mismatches.append({"attribute": "aria-selected", "value": selected, "expected": "controlled tabpanel hidden"})

    if not mismatches:
        return None, None
    return {
        "mismatches": mismatches,
        "visibleControlledIds": visible_ids,
        "hiddenControlledIds": hidden_ids,
    }, None
