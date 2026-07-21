"""Capability registry and conservative automatic-repair acceptance gate."""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any
from .knowledge.loader import load_guidelines, load_profiles
from .knowledge.profiles import compose_profile

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


def assess_acceptance_gate(
    registry: dict[str, Any],
    guidelines_root: str | Path,
    *,
    profile_id: str | None = None,
) -> dict[str, Any]:
    """Assess inspect readiness for one Profile and the separate repair gate."""
    root = Path(guidelines_root)
    guidelines = load_guidelines(root / "components")
    guidelines.update(load_guidelines(root / "systems"))
    effective_profile = None
    if profile_id is not None:
        effective_profile = compose_profile(profile_id, load_profiles(root / "profiles"), guidelines)
        scoped_ids = set(effective_profile["guidelineIds"])
    else:
        scoped_ids = set(guidelines)

    from .detection.static import DETECTORS
    from .detection.render import RENDER_DETECTORS, TRANSITION_DETECTORS
    implemented_detectors = set(DETECTORS) | set(RENDER_DETECTORS) | set(TRANSITION_DETECTORS)
    by_id = {item["guidelineId"]: item for item in registry["capabilities"]}
    guideline_ids = set(guidelines)
    capability_ids = set(by_id)
    blockers: list[dict[str, str]] = []

    def block(code: str, guideline_id: str, message: str, phase: str) -> None:
        blockers.append({"code":code, "guidelineId":guideline_id, "message":message, "phase":phase})

    # Registry integrity remains global even when readiness is Profile-scoped.
    for guideline_id in sorted(guideline_ids - capability_ids):
        block("missing-capability", guideline_id, "guideline has no capability record", "inspect")
    for guideline_id in sorted(capability_ids - guideline_ids):
        block("unknown-capability", guideline_id, "capability references an unknown guideline", "inspect")
    for guideline_id in sorted(guideline_ids & capability_ids):
        guideline, capability = guidelines[guideline_id], by_id[guideline_id]
        if guideline.get("protected") and capability["repairEligibility"] == "eligible":
            block("protected-auto-repair", guideline_id, "protected guideline cannot be repair-eligible in the prototype", "repair")

    # Detector and browser readiness are evaluated only for the selected Profile.
    for guideline_id in sorted(scoped_ids & guideline_ids & capability_ids):
        guideline, capability = guidelines[guideline_id], by_id[guideline_id]
        detector_name = guideline["detector"]["name"]
        if capability["implementation"] != "implemented":
            block("implementation-incomplete", guideline_id, "detector is not implemented", "inspect")
        elif detector_name not in implemented_detectors:
            block("detector-missing", guideline_id, f"implemented capability has no registered detector: {detector_name}", "inspect")
        if guideline["constraint"] == "hard" and capability["browserCoverage"] not in {"verified", "not-required"}:
            block("hard-rule-unverified", guideline_id, "hard runtime rule lacks verified browser coverage", "inspect")

    scoped_capabilities = [by_id[item] for item in sorted(scoped_ids) if item in by_id]
    needs_browser = any(item["browserCoverage"] != "not-required" for item in scoped_capabilities)
    if needs_browser and registry["browserValidationStatus"] != "verified":
        block("browser-suite-unverified", "", registry["browserValidationEvidence"], "inspect")
    eligible = [item["guidelineId"] for item in scoped_capabilities if item["repairEligibility"] == "eligible"]
    if not eligible:
        block("no-repair-eligible-capabilities", "", "no enabled capability is explicitly eligible for automatic repair", "repair")
    if registry["repairGate"]["status"] != "eligible":
        block("registry-gate-blocked", "", registry["repairGate"]["reason"], "repair")

    inspect_blockers = [item for item in blockers if item["phase"] == "inspect"]
    repair_blockers = [item for item in blockers if item["phase"] == "repair"]
    return {
        "schemaVersion": CAPABILITY_SCHEMA_VERSION,
        "scope": "profile" if effective_profile else "repository",
        "profile": ({
            "id": effective_profile["id"], "version": effective_profile["version"],
            "lineage": effective_profile["lineage"],
        } if effective_profile else None),
        "inspectStatus": "ready" if not inspect_blockers else "blocked",
        "status": "eligible" if not blockers else "blocked",
        "guidelineCount": len(guidelines),
        "enabledGuidelineCount": len(scoped_ids),
        "capabilityCount": len(registry["capabilities"]),
        "implementedCount": sum(item["implementation"] == "implemented" for item in scoped_capabilities),
        "browserVerifiedCount": sum(item["browserCoverage"] in {"verified", "not-required"} for item in scoped_capabilities),
        "repairEligibleCount": len(eligible),
        "inspectBlockerCount": len(inspect_blockers),
        "repairBlockerCount": len(repair_blockers),
        "blockers": blockers,
    }
