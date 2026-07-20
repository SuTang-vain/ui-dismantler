"""交互覆盖率与候选场景生成测试。"""

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

from scenario_coverage import compute_interaction_coverage, interaction_fingerprint  # noqa: E402
from generate_scenarios import generate  # noqa: E402


class TestInteractionCoverage(unittest.TestCase):
    def test_explicit_handler_is_covered_by_matching_scenario(self):
        interaction = {
            "type": "explicit-handler",
            "trigger": "click",
            "target": "#tab-register",
            "handler": "switchTab",
            "action": "switch-tab",
        }
        scenarios = [{
            "id": "switch-register",
            "steps": [{"action": "click", "target": "#tab-register"}],
            "assertions": [{"target": "#tab-register", "classIncludes": ["active"]}],
        }]
        coverage = compute_interaction_coverage([interaction], scenarios)
        self.assertEqual(coverage["rate"], 1.0)
        self.assertEqual(coverage["coveredInteractions"][0]["scenarios"], ["switch-register"])

    def test_candidate_scenarios_are_excluded_by_default(self):
        interaction = {"type": "event-listener", "trigger": "resize", "target": "window", "action": "update-viewport"}
        candidate = {
            "id": "candidate",
            "candidate": True,
            "covers": [interaction_fingerprint(interaction)],
            "steps": [{"action": "wait", "ms": 100}],
            "assertions": [{"target": "body", "visible": True}],
        }
        excluded = compute_interaction_coverage([interaction], [candidate])
        included = compute_interaction_coverage([interaction], [candidate], include_candidates=True)
        self.assertEqual(excluded["rate"], 0.0)
        self.assertEqual(included["rate"], 1.0)


class TestScenarioGeneration(unittest.TestCase):
    def test_generation_emits_reviewable_protocol_scenarios(self):
        result = generate({
            "meta": {"source": "/tmp/auth.html"},
            "interactions": [{
                "type": "explicit-handler",
                "trigger": "click",
                "target": "#tab-register",
                "handler": "switchTab",
                "action": "switch-tab",
            }],
        })
        self.assertEqual(result["schemaVersion"], "1.0")
        self.assertEqual(len(result["scenarios"]), 1)
        scenario = result["scenarios"][0]
        self.assertTrue(scenario["candidate"])
        self.assertEqual(scenario["steps"][0]["target"], "#tab-register")
        self.assertTrue(scenario["covers"])

    def test_cli_writes_json(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            manifest = root / "manifest.json"
            output = root / "scenarios.json"
            manifest.write_text(json.dumps({"interactions": []}), encoding="utf-8")
            proc = subprocess.run([
                sys.executable,
                str(Path(_SCRIPTS) / "generate_scenarios.py"),
                str(manifest),
                "--out", str(output),
            ], capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["scenarios"], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
