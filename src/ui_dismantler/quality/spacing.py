"""Conservative sibling-spacing analysis over bounded flex geometry."""
from __future__ import annotations
from typing import Any


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value or "0").strip().removesuffix("px"))
    except ValueError:
        return None


def analyze_sibling_spacing(
    context: Any,
    *,
    tolerance_css_px: float = 1.0,
    minimum_siblings: int = 3,
) -> tuple[dict[str, Any] | None, str | None]:
    """Return actual flex gaps and whether they are inconsistent, or a skip reason."""
    if not isinstance(context, dict):
        return None, "missing-spacing-context"
    if context.get("display") not in {"flex", "inline-flex"}:
        return None, "unsupported-spacing-layout"
    direction = str(context.get("flexDirection") or "").lower()
    if direction not in {"row", "row-reverse", "column", "column-reverse"}:
        return None, "unsupported-flex-direction"
    if str(context.get("flexWrap") or "nowrap").lower() != "nowrap":
        return None, "wrapped-spacing-layout"
    if context.get("childrenTruncated"):
        return None, "spacing-children-truncated"
    children = context.get("children")
    if not isinstance(children, list) or len(children) < minimum_siblings:
        return None, "insufficient-spacing-siblings"
    if any(not isinstance(item, dict) for item in children):
        return None, "invalid-spacing-children"
    if any(str(item.get("position") or "static").lower() not in {"static", "relative"} for item in children):
        return None, "out-of-flow-spacing-child"
    if any(str(item.get("transform") or "none").lower() != "none" for item in children):
        return None, "transformed-spacing-child"
    signatures = {(str(item.get("tag") or ""), str(item.get("role") or "")) for item in children}
    if len(signatures) != 1:
        return None, "heterogeneous-spacing-siblings"

    horizontal = direction.startswith("row")
    normalized: list[dict[str, Any]] = []
    for item in children:
        bounds = item.get("bounds")
        if not isinstance(bounds, dict):
            return None, "invalid-spacing-bounds"
        start = _number(bounds.get("x" if horizontal else "y"))
        size = _number(bounds.get("width" if horizontal else "height"))
        if start is None or size is None or size <= 0:
            return None, "invalid-spacing-bounds"
        margin_before = _number(item.get("marginLeft" if horizontal else "marginTop"))
        margin_after = _number(item.get("marginRight" if horizontal else "marginBottom"))
        if margin_before is None or margin_after is None:
            return None, "unparsed-spacing-margin"
        normalized.append({
            "index": item.get("index"), "start": start, "end": start + size,
            "marginBefore": margin_before, "marginAfter": margin_after,
        })
    normalized.sort(key=lambda item: item["start"])
    gaps = [normalized[index + 1]["start"] - normalized[index]["end"] for index in range(len(normalized) - 1)]
    if any(gap < -tolerance_css_px for gap in gaps):
        return None, "overlapping-spacing-siblings"
    spread = max(gaps) - min(gaps)
    evidence = {
        "axis": "horizontal" if horizontal else "vertical",
        "gapsCssPx": [round(gap, 3) for gap in gaps],
        "minimumCssPx": round(min(gaps), 3),
        "maximumCssPx": round(max(gaps), 3),
        "spreadCssPx": round(spread, 3),
        "toleranceCssPx": tolerance_css_px,
        "siblingCount": len(normalized),
        "marginPairsCssPx": [[item["marginBefore"], item["marginAfter"]] for item in normalized],
        "inconsistent": spread > tolerance_css_px,
    }
    return evidence, None
