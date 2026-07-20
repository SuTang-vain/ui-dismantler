"""Deterministic quality findings derived from bounded Render Observation."""
from __future__ import annotations
from hashlib import sha1
from typing import Any

RENDER_DETECTORS = {"render-click-target-minimum", "render-viewport-clipping"}


def _finding(guideline: dict[str, Any], observation: dict[str, Any], message: str, observed: dict[str, Any]) -> dict[str, Any]:
    target_key = observation["targetKey"]
    viewport_key = str(observation.get("viewportKey") or "viewport")
    digest = sha1(f"{guideline['id']}\0{target_key}\0{viewport_key}".encode()).hexdigest()[:12]
    return {
        "id": f"finding:{digest}",
        "guidelineId": guideline["id"],
        "targetKey": target_key,
        "viewportKey": viewport_key,
        "constraint": guideline["constraint"],
        "severity": guideline["severity"],
        "confidence": 1.0,
        "evidence": [{
            "method": "render-observation",
            "detector": guideline["detector"]["name"],
            "message": message,
            "selector": observation.get("selector"),
            "viewport": observation.get("viewport"),
            "observed": observed,
        }],
        "repairProposals": [],
        "status": "open",
    }


def inspect_render_findings(render_document: dict[str, Any], effective_profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Run enabled render detectors without changing either input document."""
    if not isinstance(render_document, dict) or render_document.get("format") != "render-observation":
        raise ValueError("render_document must use format render-observation")
    observations = render_document.get("observations")
    if not isinstance(observations, list):
        raise ValueError("render_document.observations must be an array")
    findings: list[dict[str, Any]] = []
    for guideline in effective_profile["guidelines"]:
        detector = guideline["detector"]["name"]
        if detector not in RENDER_DETECTORS:
            continue
        options = guideline.get("detector", {}).get("options") or {}
        for observation in observations:
            if not isinstance(observation, dict) or not observation.get("visible"):
                continue
            bounds = observation.get("bounds") or {}
            if detector == "render-click-target-minimum":
                if not observation.get("interactive") or observation.get("disabled"):
                    continue
                minimum = options.get("minimumCssPx", 24)
                width, height = bounds.get("width"), bounds.get("height")
                if not isinstance(width, (int, float)) or not isinstance(height, (int, float)):
                    continue
                if width < minimum or height < minimum:
                    findings.append(_finding(
                        guideline, observation,
                        f"Interactive target is smaller than {minimum}x{minimum} CSS pixels",
                        {"width": width, "height": height, "minimumCssPx": minimum},
                    ))
            elif detector == "render-viewport-clipping" and observation.get("clipped"):
                viewport = observation.get("viewport") or {}
                findings.append(_finding(
                    guideline, observation,
                    "Visible target extends outside the viewport",
                    {"bounds": bounds, "viewport": viewport},
                ))
    return findings
