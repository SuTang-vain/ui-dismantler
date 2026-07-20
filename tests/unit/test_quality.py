"""Quality schema, profile composition, and inspect-only detector tests."""
from copy import deepcopy
import json
from pathlib import Path
import unittest
from ui_dismantler.quality import inspect_uiir, validate_quality_ir
from ui_dismantler.quality.colors import composite, contrast_ratio, parse_css_color, resolve_background, resolved_text_contrast
from ui_dismantler.quality.focus import analyze_focus_indicator
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
        observation = {"targetKey": "element:x", "viewport": {"width": 390, "height": 844}, "bounds": {"x": 0, "y": 0, "width": 44, "height": 44}, "computedStyle": {}, "visible": True, "clipped": False, "keyboardContext": {"sequentiallyFocusable": True, "tabIndex": 0, "managedComposite": False, "compositeRole": ""}}
        proposal = {"id": "proposal:1", "findingIds": ["finding:1"], "targetKey": "element:x", "strategy": "local-attribute", "risk": "low", "changes": [{"attribute": "aria-label", "after": "Search"}], "verificationChecks": ["quality-rescan"], "rollback": "restore source span"}
        verification = {"proposalId": "proposal:1", "status": "accepted", "originalIssuesResolved": True, "contentPreserved": True, "behaviorPreserved": True, "newIssues": [], "checks": [{"name": "quality-rescan", "passed": True}]}
        self.assertEqual(validate_render_observation(observation), [])
        self.assertEqual(validate_repair_proposal(proposal), [])
        self.assertEqual(validate_verification_result(verification), [])


class TestContrastMath(unittest.TestCase):
    def test_parses_modern_rgb_hex_and_alpha(self):
        self.assertEqual(parse_css_color("rgb(255 0 128 / 50%)"), (255.0, 0.0, 128.0, 0.5))
        self.assertEqual(parse_css_color("#0008"), (0.0, 0.0, 0.0, 136 / 255.0))
        self.assertIsNone(parse_css_color("color(display-p3 1 0 0)"))

    def test_wcag_reference_contrast_and_alpha_composition(self):
        black, white = parse_css_color("#000"), parse_css_color("#fff")
        self.assertAlmostEqual(contrast_ratio(black, white), 21.0, places=6)
        half_black = composite(parse_css_color("rgba(0,0,0,.5)"), white)
        self.assertAlmostEqual(half_black[0], 127.5, places=4)
        self.assertAlmostEqual(contrast_ratio(half_black, white), 3.9767, places=3)

    def test_gradient_blend_and_opacity_are_uncertain(self):
        for layer, reason in [
            ({"backgroundColor":"#fff","backgroundImage":"linear-gradient(red,blue)","opacity":"1","mixBlendMode":"normal","backdropFilter":"none"}, "background-image"),
            ({"backgroundColor":"#fff","backgroundImage":"none","opacity":".5","mixBlendMode":"normal","backdropFilter":"none"}, "ancestor-opacity"),
            ({"backgroundColor":"#fff","backgroundImage":"none","opacity":"1","mixBlendMode":"multiply","backdropFilter":"none"}, "mix-blend-mode"),
        ]:
            self.assertEqual(resolve_background({"backgroundLayers":[layer]}), (None, reason))

    def test_transparent_foreground_is_composited_over_resolved_background(self):
        observation = {"computedStyle":{"color":"rgba(0,0,0,.5)"}, "colorContext":{"foreground":"rgba(0,0,0,.5)","backgroundLayers":[{"backgroundColor":"#fff","backgroundImage":"none","opacity":"1","mixBlendMode":"normal","backdropFilter":"none"}]}}
        result, reason = resolved_text_contrast(observation)
        self.assertIsNone(reason)
        self.assertAlmostEqual(result["ratio"], 3.9767, places=3)


class TestFocusIndicatorAnalysis(unittest.TestCase):
    def test_target_outline_and_parent_shadow_are_detected(self):
        render = fixture("render-focus.json")
        by_key = {item["targetKey"]: item for item in render["observations"]}
        outline, reason = analyze_focus_indicator(by_key["element:focus-good"]["focusContext"])
        self.assertIsNone(reason)
        self.assertTrue(outline["indicatorDetected"])
        parent, reason = analyze_focus_indicator(by_key["element:focus-parent"]["focusContext"])
        self.assertIsNone(reason)
        self.assertTrue(parent["indicatorDetected"])

    def test_missing_indicator_is_conclusive_only_for_focus_visible(self):
        render = fixture("render-focus.json")
        by_key = {item["targetKey"]: item for item in render["observations"]}
        missing, reason = analyze_focus_indicator(by_key["element:focus-bad"]["focusContext"])
        self.assertIsNone(reason)
        self.assertFalse(missing["indicatorDetected"])
        uncertain, reason = analyze_focus_indicator(by_key["element:focus-uncertain"]["focusContext"])
        self.assertIsNone(uncertain)
        self.assertEqual(reason, "focus-visible-not-observed")

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



class TestRenderFindings(unittest.TestCase):
    def setUp(self):
        rules, profiles = knowledge()
        self.profile = compose_profile("web-base", profiles, rules)
        self.uiir = document([
            ("element:small", {"id": "small", "role": "button", "text": "Small"}),
            ("element:wide", {"id": "wide"}),
            ("element:hidden", {"id": "hidden", "role": "button", "text": "Hidden"}),
        ])

    def test_click_target_and_clipping_findings_are_viewport_scoped(self):
        original = deepcopy(self.uiir)
        render = fixture("render-findings.json")
        report = inspect_uiir(self.uiir, self.profile, render)
        findings = report["findings"]
        self.assertEqual(report["summary"], {"total": 2, "hard": 0, "soft": 2})
        by_rule = {item["guidelineId"]: item for item in findings}
        self.assertEqual(by_rule["system.web.click-target.minimum"]["targetKey"], "element:small")
        self.assertEqual(by_rule["system.web.click-target.minimum"]["viewportKey"], "wise")
        self.assertEqual(by_rule["system.web.viewport-clipping"]["targetKey"], "element:wide")
        self.assertEqual(by_rule["system.web.viewport-clipping"]["viewportKey"], "wise")
        self.assertEqual(validate_quality_ir(report), [])
        self.assertEqual(self.uiir, original)


    def test_optional_browser_collection_drives_render_findings(self):
        uiir = document([
            ("element:small", {"id": "small", "role": "button", "text": "Small"}),
            ("element:wide", {"id": "wide"}),
            ("element:low", {"id": "low"}),
            ("element:large", {"id": "large"}),
            ("element:gradient", {"id": "gradient"}),
        ])
        render, warnings = observe_render(
            FIXTURES / "render.html", targets_from_uiir(uiir),
            viewports=[{"id": "wise", "width": 390, "height": 844}],
        )
        if render["browser"] is None:
            self.skipTest(warnings[0] if warnings else "Playwright browser unavailable")
        report = inspect_uiir(uiir, self.profile, render)
        self.assertEqual(
            {item["guidelineId"] for item in report["findings"]},
            {"system.web.click-target.minimum", "system.web.viewport-clipping", "system.web.text-contrast"},
        )


    def test_optional_browser_focus_probe_distinguishes_good_and_bad(self):
        uiir = document([
            ("element:focus-good", {"id":"focus-good","role":"button","text":"Focus good"}),
            ("element:focus-bad", {"id":"focus-bad","role":"button","text":"Focus bad"}),
        ])
        render, warnings = observe_render(
            FIXTURES / "render.html", targets_from_uiir(uiir),
            viewports=[{"id":"desktop","width":1280,"height":720}],
        )
        if render["browser"] is None:
            self.skipTest(warnings[0] if warnings else "Playwright browser unavailable")
        contexts = {item["targetKey"]: item.get("focusContext") for item in render["observations"]}
        if not all(context and context.get("focusVisible") for context in contexts.values()):
            self.skipTest("browser did not expose :focus-visible for the bounded probe")
        report = inspect_uiir(uiir, self.profile, render)
        findings = [item for item in report["findings"] if item["guidelineId"] == "system.web.focus-visible"]
        self.assertEqual([item["targetKey"] for item in findings], ["element:focus-bad"])

    def test_optional_browser_keyboard_probe_distinguishes_reachable_and_managed_targets(self):
        uiir = document([
            ("element:keyboard-bad", {"id":"keyboard-bad","role":"button","text":"Keyboard bad"}),
            ("element:keyboard-good", {"id":"keyboard-good","role":"button","text":"Keyboard good"}),
            ("element:keyboard-tab-inactive", {"id":"keyboard-tab-inactive","role":"tab","text":"Inactive tab"}),
            ("element:tabindex-positive", {"id":"tabindex-positive","role":"button","text":"Priority action"}),
        ])
        render, warnings = observe_render(
            FIXTURES / "render.html", targets_from_uiir(uiir),
            viewports=[{"id":"desktop","width":1280,"height":720}],
        )
        if render["browser"] is None:
            self.skipTest(warnings[0] if warnings else "Playwright browser unavailable")
        report = inspect_uiir(uiir, self.profile, render)
        findings = [item for item in report["findings"] if item["guidelineId"] == "system.web.keyboard-reachable"]
        self.assertEqual([item["targetKey"] for item in findings], ["element:keyboard-bad"])
        tab_order = [item for item in report["findings"] if item["guidelineId"] == "system.web.tab-order.positive"]
        self.assertEqual([item["targetKey"] for item in tab_order], ["element:tabindex-positive"])
        self.assertIn({"guidelineId":"system.web.keyboard-reachable","targetKey":"element:keyboard-tab-inactive","viewportKey":"desktop","reason":"managed-composite-focus"}, report["diagnostics"]["renderSkipped"])

    def test_hidden_and_disabled_targets_do_not_produce_findings(self):
        render = fixture("render-findings.json")
        render["observations"][0]["disabled"] = True
        report = inspect_uiir(self.uiir, self.profile, render)
        self.assertEqual([item["guidelineId"] for item in report["findings"]], ["system.web.viewport-clipping"])


    def test_text_contrast_uses_normal_and_large_thresholds_and_skips_uncertain(self):
        uiir = document([
            ("element:low", {"id":"low"}),
            ("element:large", {"id":"large"}),
            ("element:gradient", {"id":"gradient"}),
        ])
        report = inspect_uiir(uiir, self.profile, fixture("render-contrast.json"))
        findings = [item for item in report["findings"] if item["guidelineId"] == "system.web.text-contrast"]
        self.assertEqual([(item["targetKey"], item["viewportKey"]) for item in findings], [("element:low", "desktop")])
        self.assertEqual(report["diagnostics"]["renderSkipped"], [{"guidelineId":"system.web.text-contrast","targetKey":"element:gradient","viewportKey":"desktop","reason":"background-image"}])
        observed = findings[0]["evidence"][0]["observed"]
        self.assertEqual(observed["threshold"], 4.5)
        self.assertLess(observed["ratio"], 4.5)


    def test_render_target_must_exist_in_uiir(self):
        render = fixture("render-findings.json")
        render["observations"][0]["targetKey"] = "element:unknown"
        with self.assertRaisesRegex(ValueError, "unknown UI-IR targets"):
            inspect_uiir(self.uiir, self.profile, render)

    def test_malformed_render_observation_is_rejected(self):
        render = fixture("render-findings.json")
        render["observations"][0]["bounds"]["width"] = "tiny"
        with self.assertRaisesRegex(ValueError, "invalid render observation"):
            inspect_uiir(self.uiir, self.profile, render)
        render = fixture("render-focus.json")
        render["observations"][0]["focusContext"]["after"] = "invalid"
        focus_uiir = document([(item["targetKey"], {"id": item["targetKey"].split(":", 1)[1], "role":"button"}) for item in render["observations"]])
        with self.assertRaisesRegex(ValueError, "invalid render observation"):
            inspect_uiir(focus_uiir, self.profile, render)
        render = fixture("render-keyboard.json")
        render["observations"][0]["keyboardContext"]["tabIndex"] = "minus-one"
        keyboard_uiir = document([(item["targetKey"], {"id": item["targetKey"].split(":", 1)[1], "role":"button"}) for item in render["observations"]])
        with self.assertRaisesRegex(ValueError, "invalid render observation"):
            inspect_uiir(keyboard_uiir, self.profile, render)


    def test_focus_finding_reports_only_conclusive_missing_indicator(self):
        uiir = document([
            ("element:focus-bad", {"id":"focus-bad","role":"button","text":"Bad"}),
            ("element:focus-good", {"id":"focus-good","role":"button","text":"Good"}),
            ("element:focus-parent", {"id":"focus-parent","role":"button","text":"Parent"}),
            ("element:focus-uncertain", {"id":"focus-uncertain","role":"button","text":"Uncertain"}),
        ])
        report = inspect_uiir(uiir, self.profile, fixture("render-focus.json"))
        focus_findings = [item for item in report["findings"] if item["guidelineId"] == "system.web.focus-visible"]
        self.assertEqual([(item["targetKey"], item["viewportKey"]) for item in focus_findings], [("element:focus-bad", "desktop")])
        self.assertIn({"guidelineId":"system.web.focus-visible","targetKey":"element:focus-uncertain","viewportKey":"desktop","reason":"focus-visible-not-observed"}, report["diagnostics"]["renderSkipped"])

    def test_keyboard_reachability_reports_only_conclusive_unmanaged_target(self):
        uiir = document([
            ("element:keyboard-bad", {"id":"keyboard-bad","role":"button","text":"Keyboard bad"}),
            ("element:keyboard-good", {"id":"keyboard-good","role":"button","text":"Keyboard good"}),
            ("element:keyboard-tab-inactive", {"id":"keyboard-tab-inactive","role":"tab","text":"Inactive tab"}),
            ("element:tabindex-positive", {"id":"tabindex-positive","role":"button","text":"Priority action"}),
        ])
        report = inspect_uiir(uiir, self.profile, fixture("render-keyboard.json"))
        findings = [item for item in report["findings"] if item["guidelineId"] == "system.web.keyboard-reachable"]
        self.assertEqual([(item["targetKey"], item["viewportKey"]) for item in findings], [("element:keyboard-bad", "desktop")])
        self.assertEqual(findings[0]["evidence"][0]["observed"]["tabIndex"], -1)
        self.assertIn({"guidelineId":"system.web.keyboard-reachable","targetKey":"element:keyboard-tab-inactive","viewportKey":"desktop","reason":"managed-composite-focus"}, report["diagnostics"]["renderSkipped"])

    def test_positive_tabindex_reports_local_order_risk(self):
        uiir = document([
            ("element:keyboard-bad", {"id":"keyboard-bad","role":"button","text":"Keyboard bad"}),
            ("element:keyboard-good", {"id":"keyboard-good","role":"button","text":"Keyboard good"}),
            ("element:keyboard-tab-inactive", {"id":"keyboard-tab-inactive","role":"tab","text":"Inactive tab"}),
            ("element:tabindex-positive", {"id":"tabindex-positive","role":"button","text":"Priority action"}),
        ])
        report = inspect_uiir(uiir, self.profile, fixture("render-keyboard.json"))
        findings = [item for item in report["findings"] if item["guidelineId"] == "system.web.tab-order.positive"]
        self.assertEqual([(item["targetKey"], item["viewportKey"]) for item in findings], [("element:tabindex-positive", "desktop")])
        self.assertEqual(findings[0]["evidence"][0]["observed"], {"tabIndex": 3})

    def test_static_only_inspection_ignores_render_rules(self):
        report = inspect_uiir(self.uiir, self.profile)
        self.assertEqual(report["findings"], [])

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
