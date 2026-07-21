"""Quality schema, profile composition, and inspect-only detector tests."""
from copy import deepcopy
import json
import os
from pathlib import Path
import unittest
from ui_dismantler.quality import inspect_uiir, validate_quality_ir
from ui_dismantler.quality.colors import composite, contrast_ratio, parse_css_color, resolve_background, resolved_text_contrast
from ui_dismantler.quality.focus import analyze_focus_indicator
from ui_dismantler.quality.states import controlled_visibility_consistency, invalid_aria_states, state_transition_consistency
from ui_dismantler.quality.spacing import analyze_sibling_spacing
from ui_dismantler.quality.knowledge import compose_profile, load_guidelines, load_profiles
from ui_dismantler.quality.knowledge.profiles import ProfileCompositionError
from ui_dismantler.quality.observation import observe_render, targets_from_uiir
from ui_dismantler.quality.observation.render import _build_observation, _normalize_state_scenarios
from ui_dismantler.quality.schema import (
    validate_guideline, validate_profile, validate_render_observation, validate_state_transition,
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
        observation = {"targetKey": "element:x", "targetType":"region", "viewport": {"width": 390, "height": 844}, "bounds": {"x": 0, "y": 0, "width": 44, "height": 44}, "computedStyle": {}, "visible": True, "clipped": False, "layoutContext": {"documentClientWidth": 390, "documentScrollWidth": 390, "pageHorizontalOverflow": False, "targetContributesToPageOverflow": False, "horizontalScrollContainer": None, "exceptionKind": ""}, "spacingContext":{"display":"flex","flexDirection":"row","flexWrap":"nowrap","rowGap":"0px","columnGap":"8px","childrenTruncated":False,"children":[]}, "keyboardContext": {"sequentiallyFocusable": True, "tabIndex": 0, "managedComposite": False, "compositeRole": ""}}
        proposal = {"id": "proposal:1", "findingIds": ["finding:1"], "targetKey": "element:x", "strategy": "local-attribute", "risk": "low", "changes": [{"attribute": "aria-label", "after": "Search"}], "verificationChecks": ["quality-rescan"], "rollback": "restore source span"}
        verification = {"proposalId": "proposal:1", "status": "accepted", "originalIssuesResolved": True, "contentPreserved": True, "behaviorPreserved": True, "newIssues": [], "checks": [{"name": "quality-rescan", "passed": True}]}
        transition = {"scenarioId":"toggle","actionIndex":0,"action":"click","selector":"#x","targetKey":"element:x","viewportKey":"desktop","viewport":{"width":1280,"height":720},"status":"completed","role":"button","stateObservable":True,"before":{"ariaExpanded":"false","ariaSelected":None,"ariaPressed":None,"ariaControls":[],"controlsTruncated":False,"controlledTargets":[]},"after":{"ariaExpanded":"true","ariaSelected":None,"ariaPressed":None,"ariaControls":[],"controlsTruncated":False,"controlledTargets":[]}}
        self.assertEqual(validate_render_observation(observation), [])
        self.assertEqual(validate_state_transition(transition), [])
        self.assertEqual(validate_repair_proposal(proposal), [])
        self.assertEqual(validate_verification_result(verification), [])


class TestSpacingAnalysis(unittest.TestCase):
    def test_consistent_and_inconsistent_flex_gaps(self):
        def child(index, x):
            return {"index":index,"tag":"div","role":"","position":"static","transform":"none","marginTop":"0px","marginRight":"0px","marginBottom":"0px","marginLeft":"0px","bounds":{"x":x,"y":0,"width":40,"height":32}}
        base = {"display":"flex","flexDirection":"row","flexWrap":"nowrap","childrenTruncated":False}
        good, reason = analyze_sibling_spacing({**base,"children":[child(0,0),child(1,48),child(2,96)]})
        self.assertIsNone(reason); self.assertFalse(good["inconsistent"])
        bad, reason = analyze_sibling_spacing({**base,"children":[child(0,0),child(1,48),child(2,104)]})
        self.assertIsNone(reason); self.assertTrue(bad["inconsistent"])
        self.assertEqual(bad["gapsCssPx"], [8.0, 16.0])

    def test_complex_spacing_layouts_are_skipped(self):
        child = {"index":0,"tag":"div","role":"","position":"absolute","transform":"none","marginTop":"0px","marginRight":"0px","marginBottom":"0px","marginLeft":"0px","bounds":{"x":0,"y":0,"width":40,"height":32}}
        value, reason = analyze_sibling_spacing({"display":"flex","flexDirection":"row","flexWrap":"nowrap","childrenTruncated":False,"children":[child,dict(child,index=1),dict(child,index=2)]})
        self.assertIsNone(value); self.assertEqual(reason, "out-of-flow-spacing-child")


class TestStateAnalysis(unittest.TestCase):
    def test_invalid_state_tokens_are_deterministic(self):
        self.assertEqual(invalid_aria_states({"ariaExpanded":"open","ariaSelected":"true","ariaPressed":"mixed"}), [{"attribute":"aria-expanded","value":"open"}])
        self.assertEqual(invalid_aria_states({"ariaExpanded":None,"ariaSelected":None,"ariaPressed":None}), [])

    def test_controlled_visibility_requires_complete_observation(self):
        mismatch, reason = controlled_visibility_consistency({
            "ariaExpanded":"true", "controlsTruncated":False,
            "controlledTargets":[{"id":"panel","found":True,"visible":False}],
        }, "button")
        self.assertIsNone(reason)
        self.assertEqual(mismatch["mismatches"][0]["attribute"], "aria-expanded")
        mismatch, reason = controlled_visibility_consistency({
            "ariaExpanded":"true", "controlsTruncated":False,
            "controlledTargets":[{"id":"missing","found":False,"visible":False}],
        }, "button")
        self.assertIsNone(mismatch)
        self.assertEqual(reason, "controlled-target-not-observed")

    def test_trusted_transition_checks_toggle_and_visibility(self):
        good, reason = state_transition_consistency(
            {"ariaExpanded":"false","ariaSelected":None,"ariaPressed":None,"ariaControls":["panel"],"controlsTruncated":False,"controlledTargets":[{"id":"panel","found":True,"visible":False}]},
            {"ariaExpanded":"true","ariaSelected":None,"ariaPressed":None,"ariaControls":["panel"],"controlsTruncated":False,"controlledTargets":[{"id":"panel","found":True,"visible":True}]},
            "button",
        )
        self.assertIsNone(good); self.assertIsNone(reason)
        bad, reason = state_transition_consistency(
            {"ariaPressed":"false","ariaExpanded":None,"ariaSelected":None,"controlledTargets":[]},
            {"ariaPressed":"false","ariaExpanded":None,"ariaSelected":None,"controlledTargets":[]},
            "button",
        )
        self.assertIsNone(reason)
        self.assertEqual(bad["issues"][0]["reason"], "state-not-updated")


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


    def test_trusted_state_transitions_report_stale_invalid_and_visibility_mismatch(self):
        render = fixture("render-transitions.json")
        uiir = document([(item["targetKey"], {"id": item["selector"][1:], "role": item.get("role") or "button"}) for item in render["stateTransitions"]])
        report = inspect_uiir(uiir, self.profile, render)
        transition_findings = [item for item in report["findings"] if item["guidelineId"] == "system.web.controlled-state.transition"]
        self.assertEqual({item["targetKey"] for item in transition_findings}, {
            "element:transition-expanded-stale", "element:transition-expanded-visibility-bad",
            "element:transition-pressed-stale", "element:transition-tab-stale", "element:transition-invalid-after",
        })
        token_findings = [item for item in report["findings"] if item["guidelineId"] == "system.web.aria-state.token-valid"]
        self.assertEqual([item["targetKey"] for item in token_findings], ["element:transition-invalid-after"])
        self.assertEqual(token_findings[0]["evidence"][0]["method"], "trusted-scenario")
        self.assertIn({"guidelineId":"system.web.controlled-state.transition","targetKey":"element:transition-action-failed","viewportKey":"desktop","reason":"scenario-action-not-completed"}, report["diagnostics"]["renderSkipped"])

    def test_aria_state_tokens_and_controlled_visibility_are_separate_findings(self):
        render = fixture("render-state.json")
        uiir = document([(item["targetKey"], {"id": item["selector"][1:], "role": item.get("role") or "button", "ariaControls": " ".join(item["stateContext"]["ariaControls"])}) for item in render["observations"]])
        report = inspect_uiir(uiir, self.profile, render)
        tokens = [item for item in report["findings"] if item["guidelineId"] == "system.web.aria-state.token-valid"]
        self.assertEqual([item["targetKey"] for item in tokens], ["element:state-invalid-pressed"])
        self.assertEqual(tokens[0]["constraint"], "hard")
        visibility = [item for item in report["findings"] if item["guidelineId"] == "system.web.controlled-state.visibility"]
        self.assertEqual({item["targetKey"] for item in visibility}, {"element:state-expanded-bad", "element:state-collapsed-bad", "element:state-tab-selected-bad"})
        skipped = [item for item in report["diagnostics"]["renderSkipped"] if item["guidelineId"] == "system.web.controlled-state.visibility"]
        self.assertCountEqual(skipped, [
            {"guidelineId":"system.web.controlled-state.visibility","targetKey":"element:state-missing-control","viewportKey":"desktop","reason":"controlled-target-not-observed"},
            {"guidelineId":"system.web.controlled-state.visibility","targetKey":"element:state-truncated","viewportKey":"desktop","reason":"controlled-targets-truncated"},
        ])

    def test_optional_browser_trusted_clicks_capture_state_transitions(self):
        scenario_path = FIXTURES / "state-transition.scenarios.json"
        scenarios = json.loads(scenario_path.read_text(encoding="utf-8"))
        uiir = document([
            ("element:transition-expanded-good", {"id":"transition-expanded-good","role":"button"}),
            ("element:transition-expanded-stale", {"id":"transition-expanded-stale","role":"button"}),
            ("element:transition-expanded-visibility-bad", {"id":"transition-expanded-visibility-bad","role":"button"}),
            ("element:transition-pressed-good", {"id":"transition-pressed-good","role":"button"}),
            ("element:transition-pressed-stale", {"id":"transition-pressed-stale","role":"button"}),
            ("element:transition-tab-good", {"id":"transition-tab-good","role":"tab"}),
            ("element:transition-tab-stale", {"id":"transition-tab-stale","role":"tab"}),
            ("element:transition-invalid-after", {"id":"transition-invalid-after","role":"button"}),
        ])
        render, warnings = observe_render(
            FIXTURES / "render.html", targets_from_uiir(uiir),
            viewports=[{"id":"desktop","width":1280,"height":720}], scenarios=scenarios,
        )
        if render["browser"] is None:
            self.skipTest(warnings[0] if warnings else "Playwright browser unavailable")
        self.assertEqual(len(render["stateTransitions"]), 8)
        report = inspect_uiir(uiir, self.profile, render)
        findings = [item for item in report["findings"] if item["guidelineId"] == "system.web.controlled-state.transition"]
        self.assertEqual({item["targetKey"] for item in findings}, {
            "element:transition-expanded-stale", "element:transition-expanded-visibility-bad",
            "element:transition-pressed-stale", "element:transition-tab-stale", "element:transition-invalid-after",
        })

    def test_optional_browser_state_probe_matches_initial_visibility(self):
        uiir = document([
            ("element:state-expanded-bad", {"id":"state-expanded-bad","role":"button","ariaControls":"state-panel-hidden"}),
            ("element:state-expanded-good", {"id":"state-expanded-good","role":"button","ariaControls":"state-panel-visible"}),
            ("element:state-collapsed-bad", {"id":"state-collapsed-bad","role":"button","ariaControls":"state-panel-visible"}),
            ("element:state-tab-selected-bad", {"id":"state-tab-selected-bad","role":"tab","ariaControls":"state-tabpanel-hidden"}),
            ("element:state-invalid-pressed", {"id":"state-invalid-pressed","role":"button"}),
        ])
        render, warnings = observe_render(FIXTURES / "render.html", targets_from_uiir(uiir), viewports=[{"id":"desktop","width":1280,"height":720}])
        if render["browser"] is None:
            self.skipTest(warnings[0] if warnings else "Playwright browser unavailable")
        report = inspect_uiir(uiir, self.profile, render)
        tokens = [item for item in report["findings"] if item["guidelineId"] == "system.web.aria-state.token-valid"]
        self.assertEqual([item["targetKey"] for item in tokens], ["element:state-invalid-pressed"])
        visibility = [item for item in report["findings"] if item["guidelineId"] == "system.web.controlled-state.visibility"]
        self.assertEqual({item["targetKey"] for item in visibility}, {"element:state-expanded-bad", "element:state-collapsed-bad", "element:state-tab-selected-bad"})

    def test_material_spacing_reports_only_bounded_region_inconsistency(self):
        rules, profiles = knowledge()
        material = compose_profile("material-accessible", profiles, rules)
        builder = UIIRBuilder(); page = builder.add_node("page", "page:spacing", None, {"title":"Spacing"})
        for key, node_type in [
            ("element:spacing-good","region"), ("element:spacing-bad","region"),
            ("element:spacing-wrapped","region"), ("element:spacing-heterogeneous","region"),
            ("element:spacing-element","element"),
        ]:
            builder.add_node(node_type, key, page, {"id":key.split(":",1)[1]}, {"source":"render.html","observations":[{"sourceSpan":[0,1],"method":"fixture","confidence":1.0}]})
        report = inspect_uiir(builder.build(), material, fixture("render-spacing.json"))
        findings = [item for item in report["findings"] if item["guidelineId"] == "system.spacing.sibling-consistency"]
        self.assertEqual([(item["targetKey"],item["viewportKey"]) for item in findings], [("element:spacing-bad","desktop")])
        self.assertEqual(findings[0]["severity"], "info")
        self.assertEqual(findings[0]["evidence"][0]["observed"]["gapsCssPx"], [8.0,16.0])
        skipped = [item for item in report["diagnostics"]["renderSkipped"] if item["guidelineId"] == "system.spacing.sibling-consistency"]
        self.assertCountEqual(skipped, [
            {"guidelineId":"system.spacing.sibling-consistency","targetKey":"element:spacing-wrapped","viewportKey":"desktop","reason":"wrapped-spacing-layout"},
            {"guidelineId":"system.spacing.sibling-consistency","targetKey":"element:spacing-heterogeneous","viewportKey":"desktop","reason":"heterogeneous-spacing-siblings"},
        ])

    def test_optional_browser_material_spacing_distinguishes_good_and_bad(self):
        rules, profiles = knowledge()
        material = compose_profile("material-accessible", profiles, rules)
        builder = UIIRBuilder(); page = builder.add_node("page", "page:spacing-browser", None, {"title":"Spacing"})
        for key, node_type in [("spacing-good","region"),("spacing-bad","region"),("spacing-wrapped","region"),("spacing-heterogeneous","region"),("spacing-element","element")]:
            builder.add_node(node_type, f"element:{key}", page, {"id":key}, {"source":"render.html","observations":[{"sourceSpan":[0,1],"method":"fixture","confidence":1.0}]})
        uiir = builder.build()
        render, warnings = observe_render(FIXTURES / "render.html", targets_from_uiir(uiir), viewports=[{"id":"desktop","width":1280,"height":720}])
        if render["browser"] is None:
            self.skipTest(warnings[0] if warnings else "Playwright browser unavailable")
        report = inspect_uiir(uiir, material, render)
        findings = [item for item in report["findings"] if item["guidelineId"] == "system.spacing.sibling-consistency"]
        self.assertEqual([item["targetKey"] for item in findings], ["element:spacing-bad"])

    def test_reflow_reports_page_overflow_and_skips_bounded_exceptions(self):
        uiir = document([
            ("element:reflow-bad", {"id":"reflow-bad"}),
            ("element:reflow-table", {"id":"reflow-table"}),
            ("element:reflow-scroll", {"id":"reflow-scroll"}),
            ("element:reflow-good", {"id":"reflow-good"}),
        ])
        report = inspect_uiir(uiir, self.profile, fixture("render-reflow.json"))
        findings = [item for item in report["findings"] if item["guidelineId"] == "system.web.reflow.horizontal-overflow"]
        self.assertEqual([(item["targetKey"], item["viewportKey"]) for item in findings], [("element:reflow-bad", "reflow")])
        self.assertEqual(findings[0]["evidence"][0]["observed"]["documentScrollWidth"], 500)
        skipped = [item for item in report["diagnostics"]["renderSkipped"] if item["guidelineId"] == "system.web.reflow.horizontal-overflow"]
        self.assertCountEqual(skipped, [
            {"guidelineId":"system.web.reflow.horizontal-overflow","targetKey":"element:reflow-table","viewportKey":"reflow","reason":"reflow-exception:data-table"},
            {"guidelineId":"system.web.reflow.horizontal-overflow","targetKey":"element:reflow-scroll","viewportKey":"reflow","reason":"bounded-horizontal-scroll"},
        ])

    def test_optional_browser_reflow_probe_distinguishes_page_and_bounded_overflow(self):
        uiir = document([
            ("element:reflow-bad", {"id":"reflow-bad"}),
            ("element:reflow-scroll", {"id":"reflow-scroll"}),
        ])
        render, warnings = observe_render(
            FIXTURES / "render.html", targets_from_uiir(uiir),
            viewports=[{"id":"reflow","width":320,"height":800}],
        )
        if render["browser"] is None:
            self.skipTest(warnings[0] if warnings else "Playwright browser unavailable")
        report = inspect_uiir(uiir, self.profile, render)
        findings = [item for item in report["findings"] if item["guidelineId"] == "system.web.reflow.horizontal-overflow"]
        self.assertEqual([item["targetKey"] for item in findings], ["element:reflow-bad"])
        self.assertIn({"guidelineId":"system.web.reflow.horizontal-overflow","targetKey":"element:reflow-scroll","viewportKey":"reflow","reason":"bounded-horizontal-scroll"}, report["diagnostics"]["renderSkipped"])

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
        render = fixture("render-spacing.json")
        render["observations"][0]["spacingContext"]["children"][0]["bounds"]["width"] = "wide"
        spacing_uiir = document([(item["targetKey"], {"id":item["selector"][1:]}) for item in render["observations"]])
        with self.assertRaisesRegex(ValueError, "invalid render observation"):
            inspect_uiir(spacing_uiir, self.profile, render)
        render = fixture("render-transitions.json")
        render["stateTransitions"][0]["actionIndex"] = -1
        transition_uiir = document([(item["targetKey"], {"id": item["targetKey"].split(":", 1)[1], "role":item.get("role") or "button"}) for item in render["stateTransitions"]])
        with self.assertRaisesRegex(ValueError, "invalid state transition"):
            inspect_uiir(transition_uiir, self.profile, render)
        render = fixture("render-state.json")
        render["observations"][0]["stateContext"]["controlledTargets"][0]["visible"] = "hidden"
        state_uiir = document([(item["targetKey"], {"id": item["targetKey"].split(":", 1)[1], "role":item.get("role") or "button"}) for item in render["observations"]])
        with self.assertRaisesRegex(ValueError, "invalid render observation"):
            inspect_uiir(state_uiir, self.profile, render)
        render = fixture("render-reflow.json")
        render["observations"][0]["layoutContext"]["documentScrollWidth"] = "wide"
        reflow_uiir = document([(item["targetKey"], {"id": item["targetKey"].split(":", 1)[1]}) for item in render["observations"]])
        with self.assertRaisesRegex(ValueError, "invalid render observation"):
            inspect_uiir(reflow_uiir, self.profile, render)


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
            {"targetKey": "element:action", "selector": "#action", "targetType":"element"},
            {"targetKey": "element:wide", "selector": "#wide", "targetType":"element"},
        ])

    def test_quality_scenarios_only_accept_explicit_condition_free_clicks(self):
        targets = [{"targetKey":"element:toggle","selector":"#toggle"}]
        accepted, warnings = _normalize_state_scenarios([
            {"id":"good","actions":[{"action":"click","selector":"#toggle"}]},
            {"id":"fill","actions":[{"action":"fill","selector":"#toggle","value":"x"}]},
            {"id":"conditional","when":[{"condition":"visible","selector":"#toggle"}],"actions":[{"action":"click","selector":"#toggle"}]},
            {"id":"action-conditional","actions":[{"action":"click","selector":"#toggle","when":[{"condition":"visible","selector":"#toggle"}]}]},
            {"id":"unknown","actions":[{"action":"click","selector":"#missing"}]},
        ], targets, max_scenarios=16, max_actions=32)
        self.assertEqual([item["id"] for item in accepted], ["good"])
        self.assertEqual(accepted[0]["actions"][0]["targetKey"], "element:toggle")
        self.assertEqual(len(warnings), 4)

    def test_browser_payload_preserves_layout_and_keyboard_contexts(self):
        raw = {
            "targetKey":"element:x", "selector":"#x", "targetType":"region", "tag":"button", "role":"",
            "interactive":True, "disabled":False, "textContent":"X", "accessibleName":"X",
            "bounds":{"x":0,"y":0,"width":44,"height":44}, "computedStyle":{},
            "visible":True, "clipped":False, "colorContext":{"foreground":"","backgroundLayers":[]},
            "stateContext":{"ariaExpanded":"false","ariaSelected":None,"ariaPressed":None,"ariaControls":["panel"],"controlsTruncated":False,"controlledTargets":[{"id":"panel","found":True,"visible":False,"hiddenAttribute":True,"ariaHidden":"","role":""}]},
            "layoutContext":{"documentClientWidth":320,"documentScrollWidth":500,"pageHorizontalOverflow":True,"targetContributesToPageOverflow":True,"horizontalScrollContainer":None,"exceptionKind":""},
            "spacingContext":{"display":"flex","flexDirection":"row","flexWrap":"nowrap","rowGap":"0px","columnGap":"8px","childrenTruncated":False,"children":[]},
            "keyboardContext":{"sequentiallyFocusable":True,"tabIndex":0,"managedComposite":False,"compositeRole":""},
            "focusContext":{"focusable":True,"focused":True,"focusVisible":True,"before":[],"after":[]},
        }
        observation = _build_observation(raw, {"id":"reflow","width":320,"height":800})
        self.assertEqual(observation["targetType"], "region")
        self.assertEqual(observation["stateContext"], raw["stateContext"])
        self.assertEqual(observation["spacingContext"], raw["spacingContext"])
        self.assertEqual(observation["layoutContext"], raw["layoutContext"])
        self.assertEqual(observation["keyboardContext"], raw["keyboardContext"])
        self.assertEqual(validate_render_observation(observation), [])

    def test_default_viewports_include_reflow_probe(self):
        report, warnings = observe_render(FIXTURES / "missing.html", [])
        self.assertEqual([item["id"] for item in report["viewports"]], ["desktop", "wise", "reflow"])
        self.assertTrue(warnings)

    def test_render_observation_rejects_unknown_browser(self):
        with self.assertRaisesRegex(ValueError, "browser_name"):
            observe_render(FIXTURES / "render.html", [], browser_name="netscape")

    def test_optional_explicit_browser_selection(self):
        requested = os.environ.get("UI_DISMANTLER_QUALITY_BROWSER", "auto")
        report, warnings = observe_render(
            FIXTURES / "render.html", [{"targetKey":"element:action","selector":"#action"}],
            viewports=[{"id":"desktop","width":1280,"height":720}], browser_name=requested,
        )
        if report["browser"] is None:
            self.skipTest(warnings[0] if warnings else "Playwright browser unavailable")
        if requested != "auto":
            self.assertEqual(report["browser"], requested)

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
