"""Section-oriented scaffold generation tests."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from ui_dismantler.generation.section_scaffold import generate_section_scaffold  # noqa: E402
from ui_dismantler.validation.library import LibValidator  # noqa: E402


class TestSectionScaffold(unittest.TestCase):
    def _input(self):
        return {
            "schemaVersion": "1.0",
            "status": "ready-for-agent",
            "sections": [{
                "id": "feature-tabs",
                "heading": "Feature Tabs",
                "chunkFile": "sections/001-feature-tabs.html",
                "contract": {
                    "component": "FeatureTabs",
                    "props": {"required": ["tabs"], "optional": []},
                    "dataContract": {"fields": ["tabs"]},
                    "interactions": [{"id": "tab-click", "status": "candidate"}],
                    "a11y": {"requirements": ["role=tablist"]},
                    "verification": ["section-selector-visible"],
                },
            }],
        }

    def test_generates_independent_section_assets_and_assembly(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            result = generate_section_scaffold(self._input(), temp_dir, "demo-sectioned")
            root = Path(temp_dir)
            self.assertEqual(result["status"], "scaffold-generated")
            self.assertTrue((root / "src/base.css").is_file())
            self.assertTrue((root / "src/demo-sectioned.js").is_file())
            self.assertTrue((root / "src/sections/feature-tabs.js").is_file())
            self.assertTrue((root / "src/sections/feature-tabs.css").is_file())
            self.assertTrue((root / "examples/template.html").is_file())
            self.assertIn("DemoSectioned.mount", (root / "examples/template.html").read_text())
            proc = subprocess.run(
                ["node", "--check", str(root / "src/demo-sectioned.js")],
                capture_output=True,
                text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            proc = subprocess.run(
                ["node", "--check", str(root / "src/sections/feature-tabs.js")],
                capture_output=True,
                text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_generated_scaffold_passes_gold_artifact_contract(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            generate_section_scaffold(
                self._input(), temp_dir, "demo-sectioned", generate_showcase_artifact=True,
            )
            results = LibValidator(
                temp_dir, require_showcase=True, quality_profile="gold",
            ).evaluate()
        self.assertTrue(all(ok for _, ok, _ in results), results)

    def test_invalid_generation_input_is_blocked(self):
        bad = self._input()
        bad["status"] = "invalid"
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaises(ValueError):
                generate_section_scaffold(bad, temp_dir, "demo")


if __name__ == "__main__":
    unittest.main()
