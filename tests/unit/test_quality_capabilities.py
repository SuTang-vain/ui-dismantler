"""Quality capability registry completeness and repair-gate tests."""
from copy import deepcopy
import json
from pathlib import Path
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
        self.assertEqual(codes, {
            "implementation-incomplete", "hard-rule-unverified", "browser-suite-unverified",
            "no-repair-eligible-capabilities", "registry-gate-blocked",
        })
        self.assertEqual(report["repairEligibleCount"], 0)

    def test_implemented_record_must_have_registered_detector(self):
        registry = deepcopy(self.registry)
        guideline = self.guidelines["system.spacing.sibling-consistency"]
        record = next(item for item in registry["capabilities"] if item["guidelineId"] == guideline["id"])
        record["implementation"] = "implemented"
        report = assess_acceptance_gate(registry, GUIDELINES)
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

    def test_gate_cli_reports_and_check_mode_blocks(self):
        self.assertEqual(gate_main([]), 0)
        self.assertEqual(gate_main(["--check"]), 2)
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "gate.json"
            self.assertEqual(gate_main(["-o", str(output)]), 0)
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "blocked")


if __name__ == "__main__":
    unittest.main()
