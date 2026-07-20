"""交互场景协议、执行与逐状态评分测试。"""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

_SCRIPTS = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.abspath(_SCRIPTS))

import roundtrip as rt  # noqa: E402


FIXTURE = Path(__file__).resolve().parent / "fixtures" / "scenarios" / "interaction-app"
SOURCE = FIXTURE / "original.html"
LIB = FIXTURE / "lib"
SCENARIOS = FIXTURE / "scenarios.json"


class TestScenarioProtocol(unittest.TestCase):
    def test_fixture_matrix_is_valid(self):
        scenarios = rt.load_scenario_matrix(SCENARIOS)
        self.assertEqual(len(scenarios), 5)
        self.assertEqual(scenarios[-1]["viewport"], {"width": 390, "height": 844})

    def test_duplicate_ids_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "duplicate.json"
            path.write_text(json.dumps({
                "schemaVersion": "1.0",
                "scenarios": [
                    {"id": "same", "steps": [], "assertions": [{"target": "body", "visible": True}]},
                    {"id": "same", "steps": [], "assertions": [{"target": "body", "visible": True}]},
                ],
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "重复"):
                rt.load_scenario_matrix(path)

    def test_unknown_action_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "unknown.json"
            path.write_text(json.dumps({
                "schemaVersion": "1.0",
                "scenarios": [{
                    "id": "bad",
                    "steps": [{"action": "evaluate", "code": "alert(1)"}],
                    "assertions": [{"target": "body", "visible": True}],
                }],
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "不支持"):
                rt.load_scenario_matrix(path)

    def test_wait_is_bounded(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "wait.json"
            path.write_text(json.dumps({
                "schemaVersion": "1.0",
                "scenarios": [{
                    "id": "slow",
                    "steps": [{"action": "wait", "ms": 6000}],
                    "assertions": [{"target": "body", "visible": True}],
                }],
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "0..5000"):
                rt.load_scenario_matrix(path)


class TestScenarioExecution(unittest.TestCase):
    def test_reference_and_library_execute_same_tab_scenario(self):
        reference = rt.render_reference_dom(
            SOURCE, scenario_file=SCENARIOS, scenario_id="switch-details-tab",
        )
        library = rt.render_generated_dom(
            LIB, scenario_file=SCENARIOS, scenario_id="switch-details-tab",
        )
        self.assertTrue(reference["ok"], reference.get("error"))
        self.assertTrue(library["ok"], library.get("error"))
        self.assertIn("Details content", reference["texts"])
        self.assertIn("Details content", library["texts"])
        self.assertTrue(reference["scenario"]["steps"][0]["ok"])
        self.assertTrue(library["scenario"]["steps"][0]["ok"])

    def test_input_scenario_updates_both_outputs(self):
        reference = rt.render_reference_dom(
            SOURCE, scenario_file=SCENARIOS, scenario_id="enter-display-name",
        )
        library = rt.render_generated_dom(
            LIB, scenario_file=SCENARIOS, scenario_id="enter-display-name",
        )
        self.assertIn("Ada Lovelace", reference["texts"])
        self.assertIn("Ada Lovelace", library["texts"])

    def test_mobile_scenario_overrides_viewport(self):
        reference = rt.render_reference_dom(
            SOURCE,
            width=1024,
            height=768,
            scenario_file=SCENARIOS,
            scenario_id="mobile-layout",
        )
        self.assertEqual(reference["viewport"], {"width": 390, "height": 844})
        self.assertIn("mobile-state", reference["texts"])

    def test_selector_failure_is_an_execution_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "missing-selector.json"
            path.write_text(json.dumps({
                "schemaVersion": "1.0",
                "scenarios": [{
                    "id": "missing",
                    "steps": [{"action": "click", "target": ".not-present"}],
                    "assertions": [{"target": "body", "visible": True}],
                }],
            }), encoding="utf-8")
            result = rt.render_reference_dom(
                SOURCE, scenario_file=path, scenario_id="missing",
            )
        self.assertFalse(result["ok"])
        self.assertIn("场景执行失败", result["error"])
        self.assertIn("selector 未命中", result["scenario"]["steps"][0]["error"])

    def test_failed_assertion_prevents_state_scoring(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "failed-assertion.json"
            path.write_text(json.dumps({
                "schemaVersion": "1.0",
                "scenarios": [{
                    "id": "not-open",
                    "steps": [],
                    "assertions": [{
                        "target": ".dialog-overlay",
                        "visible": True,
                    }],
                }],
            }), encoding="utf-8")
            scenarios = rt.load_scenario_matrix(path)
            matrix = rt.evaluate_scenario_matrix(
                SOURCE,
                LIB,
                path,
                scenarios,
                1024,
                768,
                0.85,
            )
        self.assertEqual(matrix["passed"], 0)
        self.assertFalse(matrix["states"][0]["reference_ok"])
        self.assertFalse(matrix["states"][0]["library_ok"])
        self.assertEqual(matrix["states"][0]["scores"]["overall"], 0.0)


class TestScenarioRoundtrip(unittest.TestCase):
    def test_full_matrix_scores_each_independent_state(self):
        proc = subprocess.run(
            [
                sys.executable,
                str(Path(rt.__file__)),
                str(SOURCE),
                "--lib", str(LIB),
                "--reference-mode", "rendered",
                "--scenarios", str(SCENARIOS),
                "--state-threshold", "0.95",
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        report = json.loads(proc.stdout)
        matrix = report["scenario_matrix"]
        self.assertEqual(matrix["total"], 5)
        self.assertEqual(matrix["passed"], 5)
        self.assertGreaterEqual(matrix["minOverall"], 0.95)
        ids = [state["id"] for state in matrix["states"]]
        self.assertEqual(ids, [
            "switch-details-tab",
            "enter-display-name",
            "open-dialog",
            "open-and-close-dialog-with-escape",
            "mobile-layout",
        ])
        escape = matrix["states"][3]
        self.assertEqual(len(escape["reference_scenario"]["steps"]), 2)
        self.assertEqual(len(escape["library_scenario"]["steps"]), 2)
        for state in matrix["states"]:
            self.assertTrue(all(
                assertion["ok"]
                for assertion in state["reference_scenario"]["assertions"]
            ))
            self.assertTrue(all(
                assertion["ok"]
                for assertion in state["library_scenario"]["assertions"]
            ))

    def test_failed_state_returns_exit_one_and_keeps_report(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            scenario_path = Path(temp_dir) / "bad-state.json"
            report_path = Path(temp_dir) / "report.json"
            scenario_path.write_text(json.dumps({
                "schemaVersion": "1.0",
                "scenarios": [{
                    "id": "bad-state",
                    "steps": [],
                    "assertions": [{
                        "target": {
                            "reference": ".dialog-overlay",
                            "library": ".sg-dialog-overlay",
                        },
                        "visible": True,
                    }],
                }],
            }), encoding="utf-8")
            proc = subprocess.run(
                [
                    sys.executable,
                    str(Path(rt.__file__)),
                    str(SOURCE),
                    "--lib", str(LIB),
                    "--reference-mode", "rendered",
                    "--scenarios", str(scenario_path),
                    "--out", str(report_path),
                ],
                capture_output=True,
                text=True,
                timeout=60,
            )
            report = json.loads(report_path.read_text(encoding="utf-8"))
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(report["scenario_matrix"]["passed"], 0)
        self.assertEqual(report["scenario_matrix"]["total"], 1)

    def test_interaction_coverage_is_reported_and_can_fail_gate(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            manifest_path = Path(temp_dir) / "manifest.json"
            report_path = Path(temp_dir) / "coverage-report.json"
            manifest_path.write_text(json.dumps({
                "interactions": [{
                    "type": "explicit-handler",
                    "trigger": "click",
                    "target": "#uncovered-control",
                    "handler": "runUncoveredAction",
                    "action": "uncovered-action",
                }],
            }), encoding="utf-8")
            proc = subprocess.run(
                [
                    sys.executable,
                    str(Path(rt.__file__)),
                    str(SOURCE),
                    "--lib", str(LIB),
                    "--reference-mode", "rendered",
                    "--scenarios", str(SCENARIOS),
                    "--manifest", str(manifest_path),
                    "--coverage-threshold", "1.0",
                    "--out", str(report_path),
                ],
                capture_output=True,
                text=True,
                timeout=60,
            )
            report = json.loads(report_path.read_text(encoding="utf-8"))
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(report["interaction_coverage"]["identified"], 1)
        self.assertEqual(report["interaction_coverage"]["rate"], 0.0)
        self.assertFalse(report["interaction_coverage"]["passed"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
