"""Compose inherited profiles without weakening protected hard constraints."""
from __future__ import annotations
from copy import deepcopy
from fnmatch import fnmatchcase
from typing import Any

class ProfileCompositionError(ValueError):
    pass

def compose_profile(profile_id: str, profiles: dict[str, dict[str, Any]], guidelines: dict[str, dict[str, Any]]) -> dict[str, Any]:
    if profile_id not in profiles:
        raise ProfileCompositionError(f"unknown profile: {profile_id}")
    ordered: list[dict[str, Any]] = []
    visiting: list[str] = []
    visited: set[str] = set()
    def visit(current: str) -> None:
        if current in visiting:
            raise ProfileCompositionError("profile inheritance cycle: " + " -> ".join(visiting + [current]))
        if current in visited:
            return
        profile = profiles.get(current)
        if profile is None:
            raise ProfileCompositionError(f"unknown extended profile: {current}")
        visiting.append(current)
        for parent in profile.get("extends", []):
            visit(parent)
        visiting.pop(); visited.add(current); ordered.append(profile)
    visit(profile_id)
    enabled: set[str] = set()
    effective: dict[str, dict[str, Any]] = {}
    provenance: dict[str, list[str]] = {}
    for profile in ordered:
        for pattern in profile.get("enable", []):
            matches = sorted(rule_id for rule_id in guidelines if fnmatchcase(rule_id, pattern))
            if not matches:
                raise ProfileCompositionError(f"{profile['id']} enable matches no guideline: {pattern}")
            enabled.update(matches)
            for rule_id in matches:
                provenance.setdefault(rule_id, []).append(profile["id"])
        for pattern in profile.get("disable", []):
            matches = sorted(rule_id for rule_id in guidelines if fnmatchcase(rule_id, pattern))
            if not matches:
                raise ProfileCompositionError(f"{profile['id']} disable matches no guideline: {pattern}")
            protected = [rule_id for rule_id in matches if guidelines[rule_id].get("protected", guidelines[rule_id]["constraint"] == "hard")]
            if protected:
                raise ProfileCompositionError(f"{profile['id']} cannot disable protected guidelines: {', '.join(protected)}")
            enabled.difference_update(matches)
        for rule_id, override in profile.get("overrides", {}).items():
            if rule_id not in guidelines:
                raise ProfileCompositionError(f"{profile['id']} overrides unknown guideline: {rule_id}")
            if rule_id not in enabled:
                raise ProfileCompositionError(f"{profile['id']} overrides disabled guideline: {rule_id}")
            rule = deepcopy(effective.get(rule_id, guidelines[rule_id]))
            if rule.get("protected", rule["constraint"] == "hard") and override.get("severity") in ("info", "warning"):
                raise ProfileCompositionError(f"{profile['id']} cannot weaken protected guideline: {rule_id}")
            rule.update(deepcopy(override)); effective[rule_id] = rule
    for rule_id in sorted(enabled):
        effective.setdefault(rule_id, deepcopy(guidelines[rule_id]))
    selected = [effective[rule_id] for rule_id in sorted(enabled)]
    profile = profiles[profile_id]
    return {"id": profile["id"], "version": profile["version"], "lineage": [item["id"] for item in ordered], "guidelineIds": [item["id"] for item in selected], "guidelines": selected, "provenance": {key: provenance.get(key, []) for key in sorted(enabled)}}
