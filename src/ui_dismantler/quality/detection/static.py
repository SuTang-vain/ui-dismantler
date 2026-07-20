"""Inspect-only deterministic rules over canonical UI-IR facts."""
from __future__ import annotations
from hashlib import sha1
from typing import Any, Callable
from ..schema import QUALITY_IR_FORMAT, QUALITY_SCHEMA_VERSION, validate_quality_ir
from ...uiir.schema import NODE_TYPES, expand_uiir_evidence
from ...uiir.validation import validate_uiir

Detector = Callable[[list[Any], str, dict[str, Any], dict[int, list[Any]], list[list[Any]]], dict[str, Any] | None]

def _value(props: dict[str, Any], *names: str) -> Any:
    for name in names:
        if name in props:
            return props[name]
    attrs = props.get("attributes") if isinstance(props.get("attributes"), dict) else {}
    for name in names:
        if name in attrs:
            return attrs[name]
    return None

def _accessible_name(props: dict[str, Any]) -> bool:
    return any(str(_value(props, name) or "").strip() for name in ("accessibleName", "ariaLabel", "aria-label", "ariaLabelledby", "aria-labelledby", "label", "text", "title"))

def icon_button_name(node, node_type, props, nodes, edges):
    role = str(_value(props, "role") or "").lower()
    kind = str(_value(props, "componentType", "kind") or "").lower()
    icon = bool(_value(props, "iconOnly", "isIconOnly")) or role == "icon-button" or kind == "icon-button"
    if icon and not _accessible_name(props):
        return {"message": "Icon button has no accessible name", "observed": {"role": role, "componentType": kind}}
    return None

def input_label(node, node_type, props, nodes, edges):
    role = str(_value(props, "role") or "").lower()
    tag = str(_value(props, "tag") or "").lower()
    if (tag in {"input", "select", "textarea"} or role in {"textbox", "combobox", "searchbox"}) and not _accessible_name(props):
        return {"message": "Form control has no associated label", "observed": {"tag": tag, "role": role}}
    return None

def aria_reference(node, node_type, props, nodes, edges):
    target = _value(props, "ariaControls", "aria-controls", "ariaLabelledby", "aria-labelledby", "ariaDescribedby", "aria-describedby")
    if not target:
        return None
    targets = {str(item[3].get("id", "")) for item in nodes.values()} | {str(item[3].get("key", "")) for item in nodes.values()}
    missing = [item for item in str(target).split() if item not in targets]
    if missing:
        return {"message": "ARIA reference points to a missing target", "observed": {"reference": str(target), "missing": missing}}
    return None

def tab_panel_reference(node, node_type, props, nodes, edges):
    if str(_value(props, "role") or "").lower() != "tab":
        return None
    target = _value(props, "ariaControls", "aria-controls")
    if not target:
        return {"message": "Tab does not reference a tabpanel", "observed": {"ariaControls": None}}
    matching = [item for item in nodes.values() if str(item[3].get("id", "")) == str(target)]
    if not matching or str(_value(matching[0][3], "role") or "").lower() != "tabpanel":
        return {"message": "Tab references a missing or non-tabpanel target", "observed": {"ariaControls": target}}
    return None

def image_alt(node, node_type, props, nodes, edges):
    if str(_value(props, "tag") or "").lower() == "img" and _value(props, "alt") is None:
        return {"message": "Image has no alt attribute", "observed": {"src": _value(props, "src")}}
    return None

DETECTORS: dict[str, Detector] = {
    "icon-button-accessible-name": icon_button_name,
    "form-control-label": input_label,
    "aria-reference-target-exists": aria_reference,
    "tab-controls-tabpanel": tab_panel_reference,
    "image-alt-present": image_alt,
}

def inspect_uiir(document: dict[str, Any], effective_profile: dict[str, Any]) -> dict[str, Any]:
    errors = validate_uiir(document)
    if errors:
        raise ValueError("invalid UI-IR: " + "; ".join(errors))
    nodes = {node[0]: node for node in document["nodes"]}
    evidence = expand_uiir_evidence(document)
    findings: list[dict[str, Any]] = []
    for guideline in effective_profile["guidelines"]:
        detector_name = guideline["detector"]["name"]
        detector = DETECTORS.get(detector_name)
        if detector is None:
            continue
        applies = guideline.get("appliesWhen") or {}
        allowed_types = set(applies.get("nodeTypes") or NODE_TYPES)
        for node in document["nodes"]:
            node_type = NODE_TYPES[node[1]]
            if node_type not in allowed_types:
                continue
            props = node[3]
            result = detector(node, node_type, props, nodes, document["edges"])
            if result is None:
                continue
            target_key = props["key"]
            digest = sha1(f"{guideline['id']}\0{target_key}".encode()).hexdigest()[:12]
            finding_evidence = [{"method": "deterministic", "detector": detector_name, **result}]
            if str(node[0]) in evidence:
                finding_evidence.append({"method": "ui-ir-evidence", "record": evidence[str(node[0])]})
            findings.append({"id": f"finding:{digest}", "guidelineId": guideline["id"], "targetKey": target_key, "constraint": guideline["constraint"], "severity": guideline["severity"], "confidence": 1.0, "evidence": finding_evidence, "repairProposals": [], "status": "open"})
    findings.sort(key=lambda item: (item["guidelineId"], item["targetKey"]))
    report = {"schemaVersion": QUALITY_SCHEMA_VERSION, "format": QUALITY_IR_FORMAT, "sourceFormat": "ui-ir", "sourceSchemaVersion": document["schemaVersion"], "profile": {key: effective_profile[key] for key in ("id", "version", "lineage", "guidelineIds")}, "findings": findings, "summary": {"total": len(findings), "hard": sum(item["constraint"] == "hard" for item in findings), "soft": sum(item["constraint"] == "soft" for item in findings)}}
    quality_errors = validate_quality_ir(report)
    if quality_errors:
        raise ValueError("generated invalid Quality IR: " + "; ".join(quality_errors))
    return report
