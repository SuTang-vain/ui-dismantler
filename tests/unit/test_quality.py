"""Quality schema, profile composition, and inspect-only detector tests."""
from copy import deepcopy
import json
from pathlib import Path
import unittest
from ui_dismantler.quality import inspect_uiir, validate_quality_ir
from ui_dismantler.quality.knowledge import compose_profile, load_guidelines, load_profiles
from ui_dismantler.quality.knowledge.profiles import ProfileCompositionError
from ui_dismantler.quality.observation import observe_render, targets_from_uiir
from ui_dismantler.quality.schema import (
    validate_guideline, validate_profile, validate_render_observation,
    validate_repair_proposal, validate_verification_result,
)
from ui_dismantler.uiir.conversion.manifest_to_uiir import UIIRBuilder

ROOT = Path(__file__).resolve().parents[2]
GUIDELINES = ROOT / "src" / "skill" / "references" / "guidelines"
FIXTURES = ROOT / "tests" / "fixtures" / "quality"

def fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))

def knowledge():
    rules = load_guidelines(GUIDELINES / "components")
    rules.update(load_guidelines(GUIDELINES / "systems"))
    return rules, load_profiles(GUIDELINES / "profiles")

def document(elements):
    builder = UIIRBuilder()
    page = builder.add_node("page", "page:test", None, {"title": "Quality fixture"})
    for key, props in elements:
        builder.add_node("element", key, page, props, {"source": "fixture.html", "observations": [{"sourceSpan": [0, 1], "method": "fixture", "confidence": 1.0}]})
    return builder.build()

class TestQualitySchema(unittest.TestCase):
    def test_repository_knowledge_is_valid(self):
        rules, profiles = knowledge()
        self.assertGreaterEqual(len(rules), 6)
        self.assertEqual(set(profiles), {"web-base", "material-accessible"})
        self.assertTrue(all(not validate_guideline(rule) for rule in rules.values()))
        self.assertTrue(all(not validate_profile(profile) for profile in profiles.values()))

    def test_invalid_contracts_report_errors(self):
        self.assertTrue(validate_guideline({"id": "x"}))
        self.assertTrue(validate_profile({"id": "x", "version": "1", "overrides": {"a": {"unknown": 1}}}))

    def test_future_phase_contract_boundaries_are_explicit(self):
        observation = {"targetKey": "element:x", "viewport": {"width": 390, "height": 844}, "bounds": {"x": 0, "y": 0, "width": 44, "height": 44}, "computedStyle": {}, "visible": True, "clipped": False}
        proposal = {"id": "proposal:1", "findingIds": ["finding:1"], "targetKey": "element:x", "strategy": "local-attribute", "risk": "low", "changes": [{"attribute": "aria-label", "after": "Search"}], "verificationChecks": ["quality-rescan"], "rollback": "restore source span"}
        verification = {"proposalId": "proposal:1", "status": "accepted", "originalIssuesResolved": True, "contentPreserved": True, "behaviorPreserved": True, "newIssues": [], "checks": [{"name": "quality-rescan", "passed": True}]}
        self.assertEqual(validate_render_observation(observation), [])
        self.assertEqual(validate_repair_proposal(proposal), [])
        self.assertEqual(validate_verification_result(verification), [])

class TestProfileComposition(unittest.TestCase):
    def test_inheritance_selects_component_and_system_rules(self):
        rules, profiles = knowledge()
        profile = compose_profile("material-accessible", profiles, rules)
        self.assertEqual(profile["lineage"], ["web-base", "material-accessible"])
        self.assertIn("component.image.alt", profile["guidelineIds"])
        spacing = next(item for item in profile["guidelines"] if item["id"] == "system.spacing.sibling-consistency")
        self.assertEqual(spacing["severity"], "info")
        self.assertFalse(spacing["autoRepair"])

    def test_profile_cycle_is_rejected(self):
        rules, profiles = knowledge()
        profiles = deepcopy(profiles)
        profiles["web-base"]["extends"] = ["material-accessible"]
        with self.assertRaisesRegex(ProfileCompositionError, "cycle"):
            compose_profile("web-base", profiles, rules)

    def test_protected_hard_rule_cannot_be_disabled_or_weakened(self):
        rules, profiles = knowledge()
        profiles = deepcopy(profiles)
        profiles["unsafe"] = {"id": "unsafe", "version": "1", "extends": ["web-base"], "enable": [], "disable": ["component.image.alt"], "overrides": {}}
        with self.assertRaisesRegex(ProfileCompositionError, "cannot disable"):
            compose_profile("unsafe", profiles, rules)
        profiles["unsafe"]["disable"] = []
        profiles["unsafe"]["overrides"] = {"component.image.alt": {"severity": "warning"}}
        with self.assertRaisesRegex(ProfileCompositionError, "cannot weaken"):
            compose_profile("unsafe", profiles, rules)

class TestStaticInspection(unittest.TestCase):
    def setUp(self):
        rules, profiles = knowledge()
        self.profile = compose_profile("web-base", profiles, rules)

    def test_clean_uiir_has_no_findings(self):
        uiir = document(fixture("clean-elements.json"))
        original = deepcopy(uiir)
        report = inspect_uiir(uiir, self.profile)
        self.assertEqual(report["findings"], [])
        self.assertEqual(uiir, original, "inspection must not mutate canonical UI-IR")
        self.assertEqual(validate_quality_ir(report), [])

    def test_five_injected_defects_are_reported_with_stable_targets(self):
        uiir = document(fixture("injected-elements.json"))
        report = inspect_uiir(uiir, self.profile)
        guideline_ids = [item["guidelineId"] for item in report["findings"]]
        self.assertEqual(report["summary"], {"total": 5, "hard": 5, "soft": 0})
        self.assertEqual(guideline_ids.count("component.aria.reference-target"), 1)
        self.assertEqual(guideline_ids.count("component.tab.controls-tabpanel"), 1)
        self.assertTrue(all(item["targetKey"].startswith("element:") for item in report["findings"]))
        self.assertTrue(all(item["evidence"] for item in report["findings"]))
        self.assertEqual(validate_quality_ir(report), [])

    def test_profile_changes_rules_not_page_facts(self):
        rules, profiles = knowledge()
        uiir = document([("element:photo", {"tag": "img"})])
        original = deepcopy(uiir)
        material = compose_profile("material-accessible", profiles, rules)
        base_report = inspect_uiir(uiir, self.profile)
        material_report = inspect_uiir(uiir, material)
        self.assertEqual(base_report["findings"], material_report["findings"])
        self.assertNotEqual(base_report["profile"]["guidelineIds"], material_report["profile"]["guidelineIds"])
        self.assertEqual(uiir, original)


class TestRenderObservation(unittest.TestCase):
    def test_targets_only_use_explicit_uiir_references(self):
        uiir = document([
            ("element:action", {"id": "action", "role": "button"}),
            ("element:wide", {"selector": "#wide"}),
            ("element:prose", {"text": "do not guess this as a selector"}),
        ])
        self.assertEqual(targets_from_uiir(uiir), [
            {"targetKey": "element:action", "selector": "#action"},
            {"targetKey": "element:wide", "selector": "#wide"},
        ])

    def test_render_observation_enforces_resource_budgets(self):
        with self.assertRaisesRegex(ValueError, "max_targets"):
            observe_render(FIXTURES / "render.html", [], max_targets=0)
        with self.assertRaisesRegex(ValueError, "between 1 and 8"):
            observe_render(FIXTURES / "render.html", [], viewports=[{"id": str(i), "width": 300, "height": 300} for i in range(9)])

    def test_missing_playwright_is_a_non_blocking_warning(self):
        report, warnings = observe_render(FIXTURES / "render.html", [{"targetKey": "element:action", "selector": "#action"}], viewports=[{"id": "wise", "width": 390, "height": 844}])
        self.assertEqual(report["format"], "render-observation")
        self.assertEqual(report["viewports"][0]["id"], "wise")
        if report["browser"] is None:
            self.assertTrue(warnings)
            self.assertEqual(report["observations"], [])
        else:
            self.assertEqual(warnings, [])
            self.assertEqual(report["observations"][0]["targetKey"], "element:action")
            self.assertEqual(report["observations"][0]["bounds"]["height"], 44)

if __name__ == "__main__":
    unittest.main()
