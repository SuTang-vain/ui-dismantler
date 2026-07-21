"""Section contract validation and generation-input adapter tests."""
from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from ui_dismantler.generation.section_contracts import (  # noqa: E402
    prepare_section_generation_input,
    validate_section_contracts,
)


class TestSectionGenerationInput(unittest.TestCase):
    def _inventory(self):
        return {
            "schemaVersion": "1.0",
            "source": "/tmp/source.html",
            "chunks": [{
                "id": "feature-tabs",
                "tag": "section",
                "chunkable": True,
                "selector": "section.feature",
                "chunkFile": "sections/001-feature.html",
                "htmlBytes": 120,
                "cssEvidence": {"status": "ok", "matchedSelectors": []},
                "componentContract": {
                    "component": "FeatureTabs",
                    "confidence": "heuristic",
                    "props": {"required": ["tabs"], "optional": []},
                    "dataContract": {"fields": ["tabs"], "evidence": ["dom:tab"]},
                    "layout": {"display": "grid"},
                    "cssTokens": [],
                    "matchedSelectors": [],
                    "interactions": [{"id": "tab-click", "status": "candidate"}],
                    "a11y": {"requirements": ["role=tablist"], "evidence": []},
                    "verification": ["section-selector-visible"],
                },
            }],
        }

    def test_valid_contract_is_ready_but_candidate_is_warned(self):
        inventory = self._inventory()
        validation = validate_section_contracts(inventory)
        self.assertTrue(validation["valid"])
        self.assertEqual(validation["status"], "ready")
        self.assertTrue(validation["warnings"])
        result = prepare_section_generation_input(inventory, "/tmp/inventory.json")
        self.assertEqual(result["status"], "ready-for-agent")
        self.assertEqual(result["sections"][0]["contract"]["component"], "FeatureTabs")
        self.assertEqual(result["sections"][0]["generationInstructions"]["doNotPromote"], ["tab-click"])

    def test_invalid_contract_blocks_strict_generation_input(self):
        inventory = self._inventory()
        inventory["chunks"][0]["componentContract"].pop("verification")
        validation = validate_section_contracts(inventory)
        self.assertFalse(validation["valid"])
        with self.assertRaises(ValueError):
            prepare_section_generation_input(inventory, "/tmp/inventory.json")
        result = prepare_section_generation_input(inventory, "/tmp/inventory.json", strict=False)
        self.assertEqual(result["status"], "invalid")
        self.assertTrue(result["validation"]["errors"])

    def test_mastra_inventory_prepares_ten_sections(self):
        inventory_path = Path("/tmp/mastra-contract-artifacts/inventory.json")
        if not inventory_path.exists():
            self.skipTest("需要先生成 Mastra section artifact")
        inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
        result = prepare_section_generation_input(inventory, inventory_path)
        self.assertEqual(result["status"], "ready-for-agent")
        self.assertEqual(len(result["sections"]), 10)
        self.assertTrue(any(item["contract"]["component"] == "FeatureTabs" for item in result["sections"]))


if __name__ == "__main__":
    unittest.main()
