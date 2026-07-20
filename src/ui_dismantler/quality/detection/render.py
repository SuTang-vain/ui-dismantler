"""Deterministic quality findings derived from bounded Render Observation."""
from __future__ import annotations
from hashlib import sha1
from typing import Any
from ..colors import resolved_text_contrast
from ..focus import analyze_focus_indicator
from ..states import controlled_visibility_consistency, invalid_aria_states, state_transition_consistency
from ..schema import validate_render_observation, validate_state_transition

TRANSITION_DETECTORS = {"render-aria-state-token", "render-controlled-state-transition"}
RENDER_DETECTORS = {"render-click-target-minimum", "render-viewport-clipping", "render-text-contrast", "render-focus-visible", "render-keyboard-reachable", "render-positive-tabindex", "render-reflow-horizontal-overflow", "render-aria-state-token", "render-controlled-visibility"}


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


def _transition_finding(guideline: dict[str, Any], transition: dict[str, Any], message: str, observed: dict[str, Any]) -> dict[str, Any]:
    target_key = transition["targetKey"]
    viewport_key = str(transition.get("viewportKey") or "viewport")
    scenario_id = transition["scenarioId"]
    action_index = transition["actionIndex"]
    digest = sha1(f"{guideline['id']}\0{target_key}\0{viewport_key}\0{scenario_id}\0{action_index}".encode()).hexdigest()[:12]
    return {
        "id": f"finding:{digest}", "guidelineId": guideline["id"], "targetKey": target_key,
        "viewportKey": viewport_key, "constraint": guideline["constraint"], "severity": guideline["severity"],
        "confidence": 1.0, "evidence": [{
            "method":"trusted-scenario", "detector":guideline["detector"]["name"],
            "message":message, "selector":transition.get("selector"), "viewport":transition.get("viewport"),
            "scenarioId":scenario_id, "actionIndex":action_index, "observed":observed,
        }], "repairProposals": [], "status":"open",
    }


def inspect_render_findings(
    render_document: dict[str, Any],
    effective_profile: dict[str, Any],
    diagnostics: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Run enabled render detectors without changing either input document."""
    if not isinstance(render_document, dict) or render_document.get("format") != "render-observation":
        raise ValueError("render_document must use format render-observation")
    observations = render_document.get("observations")
    if not isinstance(observations, list):
        raise ValueError("render_document.observations must be an array")
    transitions = render_document.get("stateTransitions", [])
    if not isinstance(transitions, list):
        raise ValueError("render_document.stateTransitions must be an array")
    findings: list[dict[str, Any]] = []
    skipped = diagnostics if diagnostics is not None else []
    for index, observation in enumerate(observations):
        errors = validate_render_observation(observation)
        if errors:
            raise ValueError(f"invalid render observation[{index}]: {'; '.join(errors)}")
    for index, transition in enumerate(transitions):
        errors = validate_state_transition(transition)
        if errors:
            raise ValueError(f"invalid state transition[{index}]: {'; '.join(errors)}")
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
            elif detector == "render-focus-visible":
                if not observation.get("interactive") or observation.get("disabled"):
                    continue
                focus, uncertainty = analyze_focus_indicator(observation.get("focusContext"))
                if focus is None:
                    if uncertainty != "not-focusable":
                        skipped.append({
                            "guidelineId": guideline["id"],
                            "targetKey": observation["targetKey"],
                            "viewportKey": observation.get("viewportKey"),
                            "reason": uncertainty or "unresolved-focus-indicator",
                        })
                    continue
                if not focus["indicatorDetected"]:
                    findings.append(_finding(
                        guideline, observation,
                        "Focus-visible target has no observable visual indicator",
                        focus,
                    ))
            elif detector == "render-keyboard-reachable":
                if not observation.get("interactive") or observation.get("disabled"):
                    continue
                keyboard = observation.get("keyboardContext")
                # Older/synthetic render fixtures may predate this optional evidence.
                # Do not infer a keyboard violation without the bounded browser probe.
                if not isinstance(keyboard, dict) or "sequentiallyFocusable" not in keyboard:
                    continue
                if keyboard.get("sequentiallyFocusable"):
                    continue
                if keyboard.get("managedComposite"):
                    skipped.append({
                        "guidelineId": guideline["id"],
                        "targetKey": observation["targetKey"],
                        "viewportKey": observation.get("viewportKey"),
                        "reason": "managed-composite-focus",
                    })
                    continue
                findings.append(_finding(
                    guideline, observation,
                    "Interactive target is not reachable in the sequential keyboard focus order",
                    {
                        "tabIndex": keyboard.get("tabIndex"),
                        "managedComposite": False,
                        "compositeRole": keyboard.get("compositeRole"),
                    },
                ))
            elif detector == "render-positive-tabindex":
                if observation.get("disabled"):
                    continue
                keyboard = observation.get("keyboardContext")
                if not isinstance(keyboard, dict):
                    continue
                tab_index = keyboard.get("tabIndex")
                if isinstance(tab_index, int) and not isinstance(tab_index, bool) and tab_index > 0:
                    findings.append(_finding(
                        guideline, observation,
                        "Positive tabindex overrides the document's natural sequential focus order",
                        {"tabIndex": tab_index},
                    ))
            elif detector == "render-aria-state-token":
                invalid = invalid_aria_states(observation.get("stateContext"))
                if invalid:
                    findings.append(_finding(
                        guideline, observation,
                        "ARIA state attribute uses an invalid token",
                        {"invalidStates": invalid},
                    ))
            elif detector == "render-controlled-visibility":
                mismatch, uncertainty = controlled_visibility_consistency(
                    observation.get("stateContext"), str(observation.get("role") or ""),
                )
                if uncertainty:
                    skipped.append({
                        "guidelineId": guideline["id"],
                        "targetKey": observation["targetKey"],
                        "viewportKey": observation.get("viewportKey"),
                        "reason": uncertainty,
                    })
                    continue
                if mismatch:
                    findings.append(_finding(
                        guideline, observation,
                        "ARIA state does not match controlled-target visibility",
                        mismatch,
                    ))
            elif detector == "render-reflow-horizontal-overflow":
                viewport = observation.get("viewport") or {}
                max_width = options.get("maxViewportWidth", 320)
                if not isinstance(viewport.get("width"), (int, float)) or viewport["width"] > max_width:
                    continue
                layout = observation.get("layoutContext")
                if not isinstance(layout, dict):
                    continue
                if not layout.get("pageHorizontalOverflow") or not layout.get("targetContributesToPageOverflow"):
                    continue
                exception = str(layout.get("exceptionKind") or "").strip()
                if exception:
                    skipped.append({
                        "guidelineId": guideline["id"],
                        "targetKey": observation["targetKey"],
                        "viewportKey": observation.get("viewportKey"),
                        "reason": f"reflow-exception:{exception}",
                    })
                    continue
                container = layout.get("horizontalScrollContainer")
                if isinstance(container, dict):
                    skipped.append({
                        "guidelineId": guideline["id"],
                        "targetKey": observation["targetKey"],
                        "viewportKey": observation.get("viewportKey"),
                        "reason": "bounded-horizontal-scroll",
                    })
                    continue
                findings.append(_finding(
                    guideline, observation,
                    "Target contributes to page-level horizontal overflow at the reflow viewport",
                    {
                        "documentClientWidth": layout.get("documentClientWidth"),
                        "documentScrollWidth": layout.get("documentScrollWidth"),
                        "bounds": bounds,
                    },
                ))
            elif detector == "render-text-contrast":
                if not str(observation.get("textContent") or "").strip():
                    continue
                contrast, uncertainty = resolved_text_contrast(observation)
                if contrast is None:
                    skipped.append({
                        "guidelineId": guideline["id"],
                        "targetKey": observation["targetKey"],
                        "viewportKey": observation.get("viewportKey"),
                        "reason": uncertainty or "unresolved-contrast",
                    })
                    continue
                style = observation.get("computedStyle") or {}
                try:
                    font_size = float(str(style.get("fontSize", "")).removesuffix("px"))
                    font_weight = int(float(str(style.get("fontWeight", "400"))))
                except ValueError:
                    skipped.append({
                        "guidelineId": guideline["id"],
                        "targetKey": observation["targetKey"],
                        "viewportKey": observation.get("viewportKey"),
                        "reason": "unparsed-font-metrics",
                    })
                    continue
                large_text = font_size >= 24 or (font_size >= 18.66 and font_weight >= 700)
                threshold = options.get("largeTextRatio", 3.0) if large_text else options.get("normalTextRatio", 4.5)
                if contrast["ratio"] + 1e-9 < threshold:
                    findings.append(_finding(
                        guideline, observation,
                        f"Text contrast is below the {threshold}:1 threshold",
                        {**contrast, "threshold": threshold, "fontSizePx": font_size, "fontWeight": font_weight, "largeText": large_text},
                    ))
    for guideline in effective_profile["guidelines"]:
        detector = guideline["detector"]["name"]
        if detector not in TRANSITION_DETECTORS:
            continue
        for transition in transitions:
            if transition.get("status") != "completed":
                if detector == "render-controlled-state-transition":
                    skipped.append({
                        "guidelineId": guideline["id"], "targetKey": transition["targetKey"],
                        "viewportKey": transition.get("viewportKey"), "reason": "scenario-action-not-completed",
                    })
                continue
            if detector == "render-aria-state-token":
                invalid = invalid_aria_states(transition.get("after"))
                if invalid:
                    findings.append(_transition_finding(
                        guideline, transition, "Trusted action produced an invalid ARIA state token",
                        {"invalidStates":invalid, "before":transition.get("before"), "after":transition.get("after")},
                    ))
            elif detector == "render-controlled-state-transition":
                mismatch, uncertainty = state_transition_consistency(
                    transition.get("before"), transition.get("after"), str(transition.get("role") or ""),
                )
                if uncertainty:
                    skipped.append({
                        "guidelineId": guideline["id"], "targetKey": transition["targetKey"],
                        "viewportKey": transition.get("viewportKey"), "reason": uncertainty,
                    })
                    continue
                if mismatch:
                    findings.append(_transition_finding(
                        guideline, transition, "Trusted click did not produce a coherent ARIA state transition", mismatch,
                    ))
    return findings
