"""Capability registry and conservative automatic-repair acceptance gate."""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any
from .knowledge.loader import load_guidelines

CAPABILITY_SCHEMA_VERSION = "1.0"
_IMPLEMENTATION = {"implemented", "declared-only"}
_BROWSER_COVERAGE = {"not-required", "synthetic-only", "verified", "not-validated"}
_REPAIR_ELIGIBILITY = {"prohibited", "manual-only", "eligible"}


def validate_capability_registry(value: Any) -> list[str]:
    if not isinstance(value, dict):
        return ["capability registry must be an object"]
    errors: list[str] = []
    if value.get("schemaVersion") != CAPABILITY_SCHEMA_VERSION:
        errors.append(f"schemaVersion must be {CAPABILITY_SCHEMA_VERSION}")
    if value.get("browserValidationStatus") not in {"verified", "blocked-missing-playwright", "not-validated"}:
        errors.append("browserValidationStatus is invalid")
    if not isinstance(value.get("browserValidationEvidence"), str) or not value["browserValidationEvidence"].strip():
        errors.append("browserValidationEvidence must be a non-empty string")
    gate = value.get("repairGate")
    if not isinstance(gate, dict) or gate.get("status") not in {"blocked", "eligible"} or not isinstance(gate.get("reason"), str) or not gate["reason"].strip():
        errors.append("repairGate must contain status and reason")
    capabilities = value.get("capabilities")
    if not isinstance(capabilities, list):
        return errors + ["capabilities must be an array"]
    ids: set[str] = set()
    for index, item in enumerate(capabilities):
        field = f"capabilities[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{field} must be an object"); continue
        guideline_id = item.get("guidelineId")
        if not isinstance(guideline_id, str) or not guideline_id.strip():
            errors.append(f"{field}.guidelineId must be a non-empty string")
        elif guideline_id in ids:
            errors.append(f"{field}.guidelineId duplicates {guideline_id}")
        else:
            ids.add(guideline_id)
        if item.get("implementation") not in _IMPLEMENTATION:
            errors.append(f"{field}.implementation is invalid")
        if item.get("browserCoverage") not in _BROWSER_COVERAGE:
            errors.append(f"{field}.browserCoverage is invalid")
        if item.get("repairEligibility") not in _REPAIR_ELIGIBILITY:
            errors.append(f"{field}.repairEligibility is invalid")
        for name in ("evidence", "falsePositiveBoundary"):
            if not isinstance(item.get(name), str) or not item[name].strip():
                errors.append(f"{field}.{name} must be a non-empty string")
    return errors


def load_capability_registry(path: str | Path) -> dict[str, Any]:
    source = Path(path)
    try:
        value = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot load capability registry {source}: {exc}") from exc
    errors = validate_capability_registry(value)
    if errors:
        raise ValueError("invalid capability registry: " + "; ".join(errors))
    return value


def assess_acceptance_gate(registry: dict[str, Any], guidelines_root: str | Path) -> dict[str, Any]:
    """Assess registry completeness and whether automatic repair may be enabled."""
    root = Path(guidelines_root)
    guidelines = load_guidelines(root / "components")
    guidelines.update(load_guidelines(root / "systems"))
    from .detection.static import DETECTORS
    from .detection.render import RENDER_DETECTORS, TRANSITION_DETECTORS
    implemented_detectors = set(DETECTORS) | set(RENDER_DETECTORS) | set(TRANSITION_DETECTORS)
    by_id = {item["guidelineId"]: item for item in registry["capabilities"]}
    guideline_ids = set(guidelines)
    capability_ids = set(by_id)
    blockers: list[dict[str, str]] = []
    for guideline_id in sorted(guideline_ids - capability_ids):
        blockers.append({"code":"missing-capability", "guidelineId":guideline_id, "message":"guideline has no capability record"})
    for guideline_id in sorted(capability_ids - guideline_ids):
        blockers.append({"code":"unknown-capability", "guidelineId":guideline_id, "message":"capability references an unknown guideline"})
    for guideline_id in sorted(guideline_ids & capability_ids):
        guideline, capability = guidelines[guideline_id], by_id[guideline_id]
        if guideline.get("protected") and capability["repairEligibility"] == "eligible":
            blockers.append({"code":"protected-auto-repair", "guidelineId":guideline_id, "message":"protected guideline cannot be repair-eligible in the prototype"})
        detector_name = guideline["detector"]["name"]
        if capability["implementation"] != "implemented":
            blockers.append({"code":"implementation-incomplete", "guidelineId":guideline_id, "message":"detector is not implemented"})
        elif detector_name not in implemented_detectors:
            blockers.append({"code":"detector-missing", "guidelineId":guideline_id, "message":f"implemented capability has no registered detector: {detector_name}"})
        if guideline["constraint"] == "hard" and capability["browserCoverage"] not in {"verified", "not-required"}:
            blockers.append({"code":"hard-rule-unverified", "guidelineId":guideline_id, "message":"hard runtime rule lacks verified browser coverage"})
    if registry["browserValidationStatus"] != "verified":
        blockers.append({"code":"browser-suite-unverified", "guidelineId":"", "message":registry["browserValidationEvidence"]})
    eligible = [item["guidelineId"] for item in registry["capabilities"] if item["repairEligibility"] == "eligible"]
    if not eligible:
        blockers.append({"code":"no-repair-eligible-capabilities", "guidelineId":"", "message":"no capability is explicitly eligible for automatic repair"})
    if registry["repairGate"]["status"] != "eligible":
        blockers.append({"code":"registry-gate-blocked", "guidelineId":"", "message":registry["repairGate"]["reason"]})
    return {
        "schemaVersion": CAPABILITY_SCHEMA_VERSION,
        "status": "eligible" if not blockers else "blocked",
        "guidelineCount": len(guidelines),
        "capabilityCount": len(registry["capabilities"]),
        "implementedCount": sum(item["implementation"] == "implemented" for item in registry["capabilities"]),
        "browserVerifiedCount": sum(item["browserCoverage"] in {"verified", "not-required"} for item in registry["capabilities"]),
        "repairEligibleCount": len(eligible),
        "blockers": blockers,
    }
