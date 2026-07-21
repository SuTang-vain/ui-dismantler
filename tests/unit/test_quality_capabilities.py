"""Quality capability registry completeness and repair-gate tests."""
from copy import deepcopy
import json
from pathlib import Path
from unittest.mock import patch
import tempfile
import unittest
from ui_dismantler.cli.check_quality_gate import main as gate_main
from ui_dismantler.quality.capabilities import (
    assess_acceptance_gate, load_capability_registry, validate_capability_registry,
)
from ui_dismantler.quality.knowledge import load_guidelines

ROOT = Path(__file__).resolve().parents[2]
GUIDELINES = ROOT / "src" / "skill" / "references" / "guidelines"
REGISTRY = GUIDELINES / "capabilities.json"


class TestQualityCapabilities(unittest.TestCase):
    def setUp(self):
        self.registry = load_capability_registry(REGISTRY)
        self.guidelines = load_guidelines(GUIDELINES / "components")
        self.guidelines.update(load_guidelines(GUIDELINES / "systems"))

    def test_registry_has_exactly_one_record_per_guideline(self):
        self.assertEqual(validate_capability_registry(self.registry), [])
        capability_ids = [item["guidelineId"] for item in self.registry["capabilities"]]
        self.assertEqual(set(capability_ids), set(self.guidelines))
        self.assertEqual(len(capability_ids), len(set(capability_ids)))

    def test_current_repair_gate_is_explicitly_blocked(self):
        report = assess_acceptance_gate(self.registry, GUIDELINES)
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["guidelineCount"], 16)
        self.assertEqual(report["capabilityCount"], 16)
        codes = {item["code"] for item in report["blockers"]}
        self.assertEqual(codes, {"no-repair-eligible-capabilities", "registry-gate-blocked"})
        self.assertEqual(len(report["blockers"]), 2)
        self.assertEqual(report["inspectStatus"], "ready")
        self.assertEqual(report["implementedCount"], 16)
        self.assertEqual(report["browserVerifiedCount"], 16)
        self.assertEqual(report["repairEligibleCount"], 0)

    def test_web_base_is_inspect_ready_but_repair_blocked(self):
        report = assess_acceptance_gate(self.registry, GUIDELINES, profile_id="web-base")
        self.assertEqual(report["scope"], "profile")
        self.assertEqual(report["profile"]["id"], "web-base")
        self.assertEqual(report["enabledGuidelineCount"], 15)
        self.assertEqual(report["implementedCount"], 15)
        self.assertEqual(report["browserVerifiedCount"], 15)
        self.assertEqual(report["inspectStatus"], "ready")
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["inspectBlockerCount"], 0)
        self.assertEqual(report["repairBlockerCount"], 2)
        self.assertEqual({item["code"] for item in report["blockers"]}, {
            "no-repair-eligible-capabilities", "registry-gate-blocked",
        })

    def test_material_profile_is_inspect_ready_but_repair_blocked(self):
        report = assess_acceptance_gate(self.registry, GUIDELINES, profile_id="material-accessible")
        self.assertEqual(report["profile"]["lineage"], ["web-base", "material-accessible"])
        self.assertEqual(report["enabledGuidelineCount"], 16)
        self.assertEqual(report["implementedCount"], 16)
        self.assertEqual(report["browserVerifiedCount"], 16)
        self.assertEqual(report["inspectStatus"], "ready")
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["inspectBlockerCount"], 0)
        self.assertEqual(report["repairBlockerCount"], 2)

    def test_implemented_record_must_have_registered_detector(self):
        from ui_dismantler.quality.detection import render as render_detection
        without_spacing = set(render_detection.RENDER_DETECTORS) - {"spacing-consistency"}
        with patch.object(render_detection, "RENDER_DETECTORS", without_spacing):
            report = assess_acceptance_gate(self.registry, GUIDELINES)
        blockers = {(item["code"], item["guidelineId"]) for item in report["blockers"]}
        self.assertIn(("detector-missing", "system.spacing.sibling-consistency"), blockers)

    def test_protected_rule_cannot_be_marked_repair_eligible(self):
        registry = deepcopy(self.registry)
        record = next(item for item in registry["capabilities"] if item["guidelineId"] == "system.web.text-contrast")
        record["repairEligibility"] = "eligible"
        registry["repairGate"] = {"status":"eligible", "reason":"test only"}
        report = assess_acceptance_gate(registry, GUIDELINES)
        blockers = {(item["code"], item["guidelineId"]) for item in report["blockers"]}
        self.assertIn(("protected-auto-repair", "system.web.text-contrast"), blockers)
        self.assertEqual(report["status"], "blocked")

    def test_gate_cli_reports_profile_specific_exit_codes(self):
        self.assertEqual(gate_main([]), 0)
        self.assertEqual(gate_main(["--check-inspect"]), 0)
        self.assertEqual(gate_main(["--check"]), 2)
        self.assertEqual(gate_main(["--profile", "material-accessible", "--check-inspect"]), 0)
        self.assertEqual(gate_main(["--profile", "all", "--check-inspect"]), 0)
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "gate.json"
            self.assertEqual(gate_main(["-o", str(output)]), 0)
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["profile"]["id"], "web-base")
            self.assertEqual(report["inspectStatus"], "ready")
            self.assertEqual(report["status"], "blocked")


if __name__ == "__main__":
    unittest.main()
