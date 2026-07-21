"""页面规模策略路由测试。"""
from __future__ import annotations

import os
from pathlib import Path
import tempfile
import unittest

_SRC = os.path.join(os.path.dirname(__file__), "..", "..", "src")
import sys
sys.path.insert(0, os.path.abspath(_SRC))

from ui_dismantler.analysis.html import HtmlAnalyzer  # noqa: E402
from ui_dismantler.analysis.strategy import (  # noqa: E402
    PageMetrics,
    choose_analysis_strategy,
    inspect_html,
)


class TestAnalysisStrategy(unittest.TestCase):
    def test_known_cases_route_by_scale_and_complexity(self):
        mastra = inspect_html(
            Path(__file__).resolve().parents[2]
            / "examples/cases/mastra/original.html"
        )
        self.assertEqual(choose_analysis_strategy(mastra).name, "large")
        self.assertTrue(mastra.tailwind_signal)
        self.assertGreater(mastra.utility_class_count, 250)

        blackpink = inspect_html(
            Path("/Users/tangyaoyue/DEV/Baidu/ui-dismantler/examples/cases/blackpink-v10/original.html")
        )
        self.assertEqual(choose_analysis_strategy(blackpink).name, "compact")

    def test_large_strategy_has_section_and_candidate_gates(self):
        metrics = PageMetrics(
            file_bytes=700_000,
            html_chars=700_000,
            tag_count=3_000,
            script_count=2,
            style_count=4,
            link_count=1,
            inline_script_bytes=50_000,
            inline_style_bytes=600_000,
            external_resource_count=2,
            utility_class_count=1_000,
            tailwind_signal=True,
            framework_signal=True,
            dynamic_signal=True,
        )
        plan = choose_analysis_strategy(metrics)
        self.assertEqual(plan.name, "large")
        self.assertIn("section-chunks", plan.passes)
        self.assertEqual(plan.dismantle_mode, "skeleton-then-section-chunks")
        self.assertEqual(plan.verification_mode, "rendered-reference-late-and-candidate-gated")
        self.assertEqual(plan.css_evidence_mode, "cdp-matched-styles-recommended")

    def test_massive_route_precedes_large(self):
        metrics = PageMetrics(
            file_bytes=3 * 1024 * 1024,
            html_chars=3 * 1024 * 1024,
            tag_count=30_000,
            script_count=20,
            style_count=20,
            link_count=5,
            inline_script_bytes=800_000,
            inline_style_bytes=1_000_000,
            external_resource_count=10,
            utility_class_count=10_000,
            tailwind_signal=True,
            framework_signal=True,
            dynamic_signal=True,
        )
        plan = choose_analysis_strategy(metrics)
        self.assertEqual(plan.name, "massive")
        self.assertIn("bounded-chunks", plan.passes)

    def test_override_is_explicit_and_recorded(self):
        metrics = PageMetrics(
            file_bytes=10,
            html_chars=10,
            tag_count=1,
            script_count=0,
            style_count=0,
            link_count=0,
            inline_script_bytes=0,
            inline_style_bytes=0,
            external_resource_count=0,
            utility_class_count=0,
            tailwind_signal=False,
            framework_signal=False,
            dynamic_signal=False,
        )
        plan = choose_analysis_strategy(metrics, "large")
        self.assertEqual(plan.name, "large")
        self.assertEqual(plan.source, "override")
        self.assertIn("显式指定策略", plan.reason[0])

    def test_manifest_exposes_plan_without_changing_schema_version(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            html = Path(temp_dir) / "small.html"
            html.write_text(
                "<!doctype html><html><head><title>Small</title></head>"
                "<body><main class='panel'>Hello</main></body></html>",
                encoding="utf-8",
            )
            manifest = HtmlAnalyzer(str(html)).analyze()
        self.assertEqual(manifest["schemaVersion"], "1.0")
        plan = manifest["meta"]["analysisPlan"]
        self.assertEqual(plan["name"], "compact")
        self.assertIn("metrics", plan)
        self.assertIn("passes", plan)
        self.assertEqual(plan["sectionInventory"], [])

    def test_large_manifest_contains_bounded_section_inventory(self):
        root = Path(__file__).resolve().parents[2]
        manifest = HtmlAnalyzer(str(root / "examples/cases/mastra/original.html")).analyze()
        plan = manifest["meta"]["analysisPlan"]
        self.assertEqual(plan["name"], "large")
        self.assertGreaterEqual(len(plan["sectionInventory"]), 8)
        self.assertLessEqual(len(plan["sectionInventory"]), 64)
        self.assertTrue(all("textChars" in item and "selector" in item for item in plan["sectionInventory"]))
        selectors = [item["selector"] for item in plan["sectionInventory"]]
        self.assertEqual(len(selectors), len(set(selectors)))


if __name__ == "__main__":
    unittest.main()
