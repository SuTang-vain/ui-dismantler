"""Dependency-free validation for guideline, profile, and Quality IR contracts."""
from __future__ import annotations
from typing import Any

QUALITY_SCHEMA_VERSION = "1.0"
QUALITY_IR_FORMAT = "quality-ir"
GUIDELINE_SCOPES = ("element", "component", "group", "region", "page")
CONSTRAINT_LEVELS = ("hard", "soft")
SEVERITIES = ("info", "warning", "error")
DETECTOR_TYPES = ("deterministic", "semantic", "hybrid")
FINDING_STATUSES = ("open", "accepted", "dismissed", "resolved")


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _string_list(value: Any, field: str, *, required: bool = False) -> list[str]:
    if not isinstance(value, list):
        return [f"{field} must be an array"]
    errors = [f"{field} must not be empty"] if required and not value else []
    seen: set[str] = set()
    for index, item in enumerate(value):
        if not _text(item):
            errors.append(f"{field}[{index}] must be a non-empty string")
        elif item in seen:
            errors.append(f"{field}[{index}] duplicates {item}")
        else:
            seen.add(item)
    return errors


def validate_guideline(value: Any) -> list[str]:
    if not isinstance(value, dict):
        return ["guideline must be an object"]
    errors: list[str] = []
    for field in ("id", "version", "category", "repairStrategy"):
        if not _text(value.get(field)):
            errors.append(f"{field} must be a non-empty string")
    if value.get("scope") not in GUIDELINE_SCOPES:
        errors.append("scope is invalid")
    if value.get("constraint") not in CONSTRAINT_LEVELS:
        errors.append("constraint is invalid")
    if value.get("severity") not in SEVERITIES:
        errors.append("severity is invalid")
    errors.extend(_string_list(value.get("states", []), "states"))
    errors.extend(_string_list(value.get("viewports", []), "viewports"))
    errors.extend(_string_list(value.get("evidenceRequired", []), "evidenceRequired", required=True))
    detector = value.get("detector")
    if not isinstance(detector, dict):
        errors.append("detector must be an object")
    else:
        if detector.get("type") not in DETECTOR_TYPES:
            errors.append("detector.type is invalid")
        if not _text(detector.get("name")):
            errors.append("detector.name must be a non-empty string")
    source = value.get("source")
    if not isinstance(source, dict):
        errors.append("source must be an object")
    else:
        for field in ("profile", "reference"):
            if not _text(source.get(field)):
                errors.append(f"source.{field} must be a non-empty string")
    if not isinstance(value.get("appliesWhen", {}), dict):
        errors.append("appliesWhen must be an object")
    if not isinstance(value.get("protected", value.get("constraint") == "hard"), bool):
        errors.append("protected must be a boolean")
    return errors


def validate_profile(value: Any) -> list[str]:
    if not isinstance(value, dict):
        return ["profile must be an object"]
    errors: list[str] = []
    for field in ("id", "version"):
        if not _text(value.get(field)):
            errors.append(f"{field} must be a non-empty string")
    for field in ("extends", "enable", "disable"):
        errors.extend(_string_list(value.get(field, []), field))
    overrides = value.get("overrides", {})
    if not isinstance(overrides, dict):
        errors.append("overrides must be an object")
    else:
        allowed = {"severity", "autoRepair", "priority"}
        for rule_id, override in overrides.items():
            if not _text(rule_id) or not isinstance(override, dict):
                errors.append("override entries must map guideline IDs to objects")
                continue
            unknown = sorted(set(override) - allowed)
            if unknown:
                errors.append(f"overrides.{rule_id} has unsupported fields: {', '.join(unknown)}")
            if "severity" in override and override["severity"] not in SEVERITIES:
                errors.append(f"overrides.{rule_id}.severity is invalid")
            if "autoRepair" in override and not isinstance(override["autoRepair"], bool):
                errors.append(f"overrides.{rule_id}.autoRepair must be boolean")
            priority = override.get("priority")
            if priority is not None and (isinstance(priority, bool) or not isinstance(priority, int) or priority < 0):
                errors.append(f"overrides.{rule_id}.priority must be a non-negative integer")
    return errors


def validate_quality_ir(value: Any) -> list[str]:
    if not isinstance(value, dict):
        return ["Quality IR root must be an object"]
    errors: list[str] = []
    if value.get("schemaVersion") != QUALITY_SCHEMA_VERSION:
        errors.append(f"schemaVersion must be {QUALITY_SCHEMA_VERSION}")
    if value.get("format") != QUALITY_IR_FORMAT:
        errors.append(f"format must be {QUALITY_IR_FORMAT}")
    if value.get("sourceFormat") != "ui-ir":
        errors.append("sourceFormat must be ui-ir")
    profile = value.get("profile")
    if not isinstance(profile, dict):
        errors.append("profile must be an object")
    else:
        if not _text(profile.get("id")) or not _text(profile.get("version")):
            errors.append("profile id/version must be non-empty strings")
        errors.extend(_string_list(profile.get("guidelineIds", []), "profile.guidelineIds"))
    findings = value.get("findings")
    if not isinstance(findings, list):
        errors.append("findings must be an array")
        findings = []
    ids: set[str] = set()
    for index, finding in enumerate(findings):
        field = f"findings[{index}]"
        if not isinstance(finding, dict):
            errors.append(f"{field} must be an object")
            continue
        for name in ("id", "guidelineId", "targetKey"):
            if not _text(finding.get(name)):
                errors.append(f"{field}.{name} must be a non-empty string")
        if "viewportKey" in finding and not _text(finding.get("viewportKey")):
            errors.append(f"{field}.viewportKey must be a non-empty string")
        if finding.get("constraint") not in CONSTRAINT_LEVELS:
            errors.append(f"{field}.constraint is invalid")
        if finding.get("severity") not in SEVERITIES:
            errors.append(f"{field}.severity is invalid")
        if finding.get("status") not in FINDING_STATUSES:
            errors.append(f"{field}.status is invalid")
        confidence = finding.get("confidence")
        if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
            errors.append(f"{field}.confidence must be between 0 and 1")
        evidence = finding.get("evidence")
        if not isinstance(evidence, list) or not evidence or any(not isinstance(item, dict) or not item for item in evidence):
            errors.append(f"{field}.evidence must contain non-empty objects")
        if not isinstance(finding.get("repairProposals", []), list):
            errors.append(f"{field}.repairProposals must be an array")
        finding_id = finding.get("id")
        if _text(finding_id):
            if finding_id in ids:
                errors.append(f"{field}.id is duplicated")
            ids.add(finding_id)
    summary = value.get("summary")
    if not isinstance(summary, dict) or summary.get("total") != len(findings):
        errors.append("summary.total must equal findings length")
    diagnostics = value.get("diagnostics")
    if diagnostics is not None:
        if not isinstance(diagnostics, dict):
            errors.append("diagnostics must be an object")
        else:
            skipped = diagnostics.get("renderSkipped", [])
            if not isinstance(skipped, list):
                errors.append("diagnostics.renderSkipped must be an array")
            else:
                for index, item in enumerate(skipped):
                    if not isinstance(item, dict):
                        errors.append(f"diagnostics.renderSkipped[{index}] must be an object")
                        continue
                    for field in ("guidelineId", "targetKey", "reason"):
                        if not _text(item.get(field)):
                            errors.append(f"diagnostics.renderSkipped[{index}].{field} must be a non-empty string")
                    if "viewportKey" in item and item["viewportKey"] is not None and not _text(item["viewportKey"]):
                        errors.append(f"diagnostics.renderSkipped[{index}].viewportKey must be a non-empty string or null")
    return errors


def validate_render_observation(value: Any) -> list[str]:
    """Validate the future runtime geometry/style observation boundary."""
    if not isinstance(value, dict):
        return ["RenderObservation must be an object"]
    errors: list[str] = []
    if not _text(value.get("targetKey")):
        errors.append("targetKey must be a non-empty string")
    if "targetType" in value and value["targetType"] not in {"", "element", "component", "region"}:
        errors.append("targetType must be element, component, region, or empty")
    viewport = value.get("viewport")
    if not isinstance(viewport, dict):
        errors.append("viewport must be an object")
    else:
        for field in ("width", "height"):
            item = viewport.get(field)
            if isinstance(item, bool) or not isinstance(item, (int, float)) or item <= 0:
                errors.append(f"viewport.{field} must be positive")
    bounds = value.get("bounds")
    if bounds is not None:
        if not isinstance(bounds, dict):
            errors.append("bounds must be an object or null")
        else:
            for field in ("x", "y", "width", "height"):
                item = bounds.get(field)
                if isinstance(item, bool) or not isinstance(item, (int, float)):
                    errors.append(f"bounds.{field} must be numeric")
    if not isinstance(value.get("computedStyle", {}), dict):
        errors.append("computedStyle must be an object")
    if "textContent" in value and not isinstance(value["textContent"], str):
        errors.append("textContent must be a string")
    if "colorContext" in value:
        context = value["colorContext"]
        if not isinstance(context, dict):
            errors.append("colorContext must be an object")
        else:
            if not isinstance(context.get("foreground", ""), str):
                errors.append("colorContext.foreground must be a string")
            layers = context.get("backgroundLayers")
            if not isinstance(layers, list) or any(not isinstance(item, dict) for item in layers):
                errors.append("colorContext.backgroundLayers must be an array of objects")
    if "stateContext" in value:
        state = value["stateContext"]
        if not isinstance(state, dict):
            errors.append("stateContext must be an object")
        else:
            for field in ("ariaExpanded", "ariaSelected", "ariaPressed"):
                if field in state and state[field] is not None and not isinstance(state[field], str):
                    errors.append(f"stateContext.{field} must be a string or null")
            controls = state.get("ariaControls", [])
            if not isinstance(controls, list) or any(not isinstance(item, str) for item in controls):
                errors.append("stateContext.ariaControls must be an array of strings")
            if "controlsTruncated" in state and not isinstance(state["controlsTruncated"], bool):
                errors.append("stateContext.controlsTruncated must be boolean")
            targets = state.get("controlledTargets", [])
            if not isinstance(targets, list) or any(not isinstance(item, dict) for item in targets):
                errors.append("stateContext.controlledTargets must be an array of objects")
            else:
                for index, target in enumerate(targets):
                    if not _text(target.get("id")):
                        errors.append(f"stateContext.controlledTargets[{index}].id must be a non-empty string")
                    for field in ("found", "visible", "hiddenAttribute"):
                        if field in target and not isinstance(target[field], bool):
                            errors.append(f"stateContext.controlledTargets[{index}].{field} must be boolean")
                    for field in ("ariaHidden", "role"):
                        if field in target and not isinstance(target[field], str):
                            errors.append(f"stateContext.controlledTargets[{index}].{field} must be a string")
    if "layoutContext" in value:
        layout = value["layoutContext"]
        if not isinstance(layout, dict):
            errors.append("layoutContext must be an object")
        else:
            for field in ("documentClientWidth", "documentScrollWidth"):
                if field in layout:
                    item = layout[field]
                    if isinstance(item, bool) or not isinstance(item, (int, float)) or item < 0:
                        errors.append(f"layoutContext.{field} must be non-negative numeric")
            for field in ("pageHorizontalOverflow", "targetContributesToPageOverflow"):
                if field in layout and not isinstance(layout[field], bool):
                    errors.append(f"layoutContext.{field} must be boolean")
            if "exceptionKind" in layout and not isinstance(layout["exceptionKind"], str):
                errors.append("layoutContext.exceptionKind must be a string")
            container = layout.get("horizontalScrollContainer")
            if container is not None:
                if not isinstance(container, dict):
                    errors.append("layoutContext.horizontalScrollContainer must be an object or null")
                else:
                    for field in ("scope", "tag", "role", "overflowX"):
                        if field in container and not isinstance(container[field], str):
                            errors.append(f"layoutContext.horizontalScrollContainer.{field} must be a string")
                    for field in ("clientWidth", "scrollWidth"):
                        if field in container:
                            item = container[field]
                            if isinstance(item, bool) or not isinstance(item, (int, float)) or item < 0:
                                errors.append(f"layoutContext.horizontalScrollContainer.{field} must be non-negative numeric")
    if "spacingContext" in value:
        spacing = value["spacingContext"]
        if not isinstance(spacing, dict):
            errors.append("spacingContext must be an object")
        else:
            for field in ("display", "flexDirection", "flexWrap", "rowGap", "columnGap"):
                if field in spacing and not isinstance(spacing[field], str):
                    errors.append(f"spacingContext.{field} must be a string")
            if "childrenTruncated" in spacing and not isinstance(spacing["childrenTruncated"], bool):
                errors.append("spacingContext.childrenTruncated must be boolean")
            children = spacing.get("children", [])
            if not isinstance(children, list) or any(not isinstance(item, dict) for item in children):
                errors.append("spacingContext.children must be an array of objects")
            else:
                for index, child in enumerate(children):
                    if isinstance(child.get("index"), bool) or not isinstance(child.get("index"), int) or child["index"] < 0:
                        errors.append(f"spacingContext.children[{index}].index must be a non-negative integer")
                    for field in ("tag", "role", "position", "transform", "marginTop", "marginRight", "marginBottom", "marginLeft"):
                        if field in child and not isinstance(child[field], str):
                            errors.append(f"spacingContext.children[{index}].{field} must be a string")
                    bounds = child.get("bounds")
                    if not isinstance(bounds, dict):
                        errors.append(f"spacingContext.children[{index}].bounds must be an object")
                    else:
                        for field in ("x", "y", "width", "height"):
                            item = bounds.get(field)
                            if isinstance(item, bool) or not isinstance(item, (int, float)):
                                errors.append(f"spacingContext.children[{index}].bounds.{field} must be numeric")
    if "keyboardContext" in value:
        keyboard = value["keyboardContext"]
        if not isinstance(keyboard, dict):
            errors.append("keyboardContext must be an object")
        else:
            for field in ("sequentiallyFocusable", "managedComposite"):
                if field in keyboard and not isinstance(keyboard[field], bool):
                    errors.append(f"keyboardContext.{field} must be boolean")
            if "tabIndex" in keyboard:
                item = keyboard["tabIndex"]
                if isinstance(item, bool) or not isinstance(item, int):
                    errors.append("keyboardContext.tabIndex must be an integer")
            if "compositeRole" in keyboard and keyboard["compositeRole"] is not None and not isinstance(keyboard["compositeRole"], str):
                errors.append("keyboardContext.compositeRole must be a string or null")
    if "focusContext" in value:
        focus = value["focusContext"]
        if not isinstance(focus, dict):
            errors.append("focusContext must be an object")
        else:
            for field in ("focusable", "focused", "focusVisible"):
                if field in focus and not isinstance(focus[field], bool):
                    errors.append(f"focusContext.{field} must be boolean")
            for field in ("before", "after"):
                records = focus.get(field, [])
                if not isinstance(records, list) or any(
                    not isinstance(record, dict)
                    or not _text(record.get("scope"))
                    or not isinstance(record.get("style"), dict)
                    for record in records
                ):
                    errors.append(f"focusContext.{field} must contain scope/style objects")
    if "viewportKey" in value and not _text(value.get("viewportKey")):
        errors.append("viewportKey must be a non-empty string")
    for field in ("visible", "clipped", "interactive", "disabled"):
        if field in value and not isinstance(value[field], bool):
            errors.append(f"{field} must be boolean")
    return errors


def validate_state_transition(value: Any) -> list[str]:
    """Validate one trusted-scenario before/after ARIA state transition."""
    if not isinstance(value, dict):
        return ["StateTransition must be an object"]
    errors: list[str] = []
    for field in ("scenarioId", "targetKey", "selector", "action", "viewportKey", "status"):
        if not _text(value.get(field)):
            errors.append(f"{field} must be a non-empty string")
    if value.get("action") not in (None, "click"):
        errors.append("action must be click")
    if value.get("status") not in (None, "completed", "failed", "skipped"):
        errors.append("status must be completed, failed, or skipped")
    action_index = value.get("actionIndex")
    if isinstance(action_index, bool) or not isinstance(action_index, int) or action_index < 0:
        errors.append("actionIndex must be a non-negative integer")
    if "stateObservable" in value and not isinstance(value["stateObservable"], bool):
        errors.append("stateObservable must be boolean")
    if "role" in value and not isinstance(value["role"], str):
        errors.append("role must be a string")
    viewport = value.get("viewport")
    if not isinstance(viewport, dict):
        errors.append("viewport must be an object")
    else:
        for field in ("width", "height"):
            item = viewport.get(field)
            if isinstance(item, bool) or not isinstance(item, (int, float)) or item <= 0:
                errors.append(f"viewport.{field} must be positive")
    for field in ("before", "after"):
        context = value.get(field)
        if not isinstance(context, dict):
            errors.append(f"{field} must be an object")
            continue
        synthetic = {
            "targetKey": str(value.get("targetKey") or "transition"),
            "viewport": viewport if isinstance(viewport, dict) else {"width":1,"height":1},
            "computedStyle": {}, "stateContext": context,
        }
        for error in validate_render_observation(synthetic):
            if error.startswith("stateContext"):
                errors.append(field + error[len("stateContext"):])
    if "error" in value and not isinstance(value["error"], str):
        errors.append("error must be a string")
    return errors


def validate_repair_proposal(value: Any) -> list[str]:
    """Validate a proposal without applying a patch."""
    if not isinstance(value, dict):
        return ["RepairProposal must be an object"]
    errors: list[str] = []
    for field in ("id", "targetKey", "strategy", "risk", "rollback"):
        if not _text(value.get(field)):
            errors.append(f"{field} must be a non-empty string")
    errors.extend(_string_list(value.get("findingIds", []), "findingIds", required=True))
    errors.extend(_string_list(value.get("verificationChecks", []), "verificationChecks", required=True))
    changes = value.get("changes")
    if not isinstance(changes, list) or not changes or any(not isinstance(item, dict) or not item for item in changes):
        errors.append("changes must contain non-empty objects")
    return errors


def validate_verification_result(value: Any) -> list[str]:
    """Validate independent post-patch verification output."""
    if not isinstance(value, dict):
        return ["VerificationResult must be an object"]
    errors: list[str] = []
    if not _text(value.get("proposalId")):
        errors.append("proposalId must be a non-empty string")
    if value.get("status") not in ("accepted", "rejected", "rolled-back"):
        errors.append("status is invalid")
    for field in ("originalIssuesResolved", "contentPreserved", "behaviorPreserved", "newIssues"):
        item = value.get(field)
        if field == "newIssues":
            if not isinstance(item, list):
                errors.append("newIssues must be an array")
        elif not isinstance(item, bool):
            errors.append(f"{field} must be boolean")
    checks = value.get("checks")
    if not isinstance(checks, list) or not checks or any(not isinstance(item, dict) or not item for item in checks):
        errors.append("checks must contain non-empty objects")
    return errors
