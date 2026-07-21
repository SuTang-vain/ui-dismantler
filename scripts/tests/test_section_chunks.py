"""Bounded section artifact extraction tests."""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from ui_dismantler.analysis.chunks import extract_section_chunks  # noqa: E402


class TestSectionChunks(unittest.TestCase):
    def test_compact_fixture_writes_bounded_artifacts(self):
        source = ROOT / "scripts/tests/fixtures/roundtrip/responsive.html"
        with tempfile.TemporaryDirectory() as temp_dir:
            result = extract_section_chunks(source, temp_dir)
            inventory = json.loads((Path(temp_dir) / "inventory.json").read_text(encoding="utf-8"))
            self.assertEqual(result.page_plan["strategy"]["name"], "compact")
            self.assertTrue((Path(temp_dir) / "page-plan.json").is_file())
            self.assertTrue((Path(temp_dir) / "inventory.json").is_file())
            self.assertEqual(len(inventory["sections"]), len(inventory["chunks"]))
            self.assertTrue(all(item.get("cssEvidence", {}).get("status") == "not-requested" for item in inventory["chunks"]))

    def test_cdp_unavailable_is_preserved_per_section(self):
        source = ROOT / "scripts/tests/fixtures/roundtrip/responsive.html"
        with tempfile.TemporaryDirectory() as temp_dir:
            result = extract_section_chunks(
                source,
                temp_dir,
                with_cdp=True,
                chrome=str(Path(temp_dir) / "missing-chrome"),
            )
            self.assertEqual(result.cdp_evidence["status"], "unavailable")
            inventory = result.inventory
            self.assertTrue(
                all(
                    item.get("cssEvidence", {}).get("status") == "unavailable"
                    for item in inventory["chunks"]
                )
            )

    def test_mastra_is_split_without_copying_main_skeleton(self):
        source = ROOT / "examples/cases/mastra/original.html"
        with tempfile.TemporaryDirectory() as temp_dir:
            result = extract_section_chunks(source, temp_dir)
            chunks = result.inventory["chunks"]
            main = next(item for item in chunks if item["tag"] == "main")
            self.assertFalse(main["chunkable"])
            self.assertIsNone(main["chunkFile"])
            self.assertGreaterEqual(sum(item.get("status") == "ok" for item in chunks), 8)
            self.assertEqual(
                len([item["id"] for item in chunks]),
                len({item["id"] for item in chunks}),
            )


if __name__ == "__main__":
    unittest.main()
