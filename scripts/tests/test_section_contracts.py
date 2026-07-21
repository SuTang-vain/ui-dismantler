"""Section-level component contract inference tests."""
from __future__ import annotations

import os
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from ui_dismantler.analysis.chunks import extract_section_chunks  # noqa: E402
from ui_dismantler.analysis.contracts import infer_component_contract  # noqa: E402


class TestSectionContracts(unittest.TestCase):
    def test_contract_is_evidence_bounded(self):
        contract = infer_component_contract(
            {"id": "feature-tabs", "heading": "Feature Tabs", "classes": ["relative"]},
            """<section><div role='tablist'><button role='tab'>Agents</button></div>
            <div role='tabpanel'>Panel</div></section>""",
            {
                "status": "ok",
                "matchedSelectors": [".feature-tabs"],
                "cssCustomProperties": ["--sg-primary"],
                "computedStyle": {"display": "grid", "gap": "16px"},
            },
        )
        self.assertEqual(contract["component"], "FeatureTabs")
        self.assertEqual(contract["confidence"], "heuristic")
        self.assertEqual(contract["layout"]["display"], "grid")
        self.assertIn("--sg-primary", contract["cssTokens"])
        self.assertTrue(all(item["status"] == "candidate" for item in contract["interactions"]))
        self.assertIn("interaction-assertions-before-promotion", contract["verification"])

    def test_mastra_contracts_are_written_to_section_metadata(self):
        source = ROOT / "examples/cases/mastra/original.html"
        with tempfile.TemporaryDirectory() as temp_dir:
            result = extract_section_chunks(source, temp_dir)
            chunks = result.inventory["chunks"]
        feature = next(item for item in chunks if item["componentContract"]["component"] == "FeatureTabs")
        faq = next(item for item in chunks if item["componentContract"]["component"] == "FAQSection")
        footer = next(item for item in chunks if item["componentContract"]["component"] == "Footer")
        self.assertIn("tabs", feature["componentContract"]["props"]["required"])
        self.assertTrue(any(item["id"] == "tab-click" for item in feature["componentContract"]["interactions"]))
        self.assertIn("faq", faq["componentContract"]["props"]["required"])
        self.assertTrue(any(item["id"] == "native-details-toggle" for item in faq["componentContract"]["interactions"]))
        self.assertIn("form", footer["componentContract"]["props"]["required"])
        self.assertEqual(footer["componentContract"]["confidence"], "heuristic")


if __name__ == "__main__":
    unittest.main()
