"""Kezhongke_web 页面形态的可迁移运行时回归测试。"""

import json
from pathlib import Path
import sys
import unittest

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "src"))

from ui_dismantler.uiir.extraction.css_media import extract_css_media_blocks  # noqa: E402
from ui_dismantler.uiir.extraction.runtime_refs import observe_runtime_references  # noqa: E402
from ui_dismantler.uiir.extraction.source_refs import extract_source_references  # noqa: E402

_FIXTURES = _ROOT / "tests" / "fixtures" / "kezhongke"
_CASES = (
    "auth-tabs",
    "article-search",
    "toc-reader",
    "journal-dynamic",
    "growth-filter",
)


class TestKezhongkePageMatrix(unittest.TestCase):
    def test_portable_page_scenarios_complete_without_runtime_failures(self):
        totals = {"scenarios": 0, "actions": 0, "assertions": 0, "changedEdges": 0}
        browser_unavailable = None
        for name in _CASES:
            with self.subTest(page=name):
                html = _FIXTURES / f"{name}.html"
                scenarios = json.loads(
                    (_FIXTURES / f"{name}.scenarios.json").read_text(encoding="utf-8")
                )
                result, warnings = observe_runtime_references(
                    html,
                    scenarios=scenarios,
                    settle_ms=60,
                    timeout_ms=5000,
                    max_candidates=64,
                )
                if not result.get("browser"):
                    browser_unavailable = " | ".join(warnings)
                    break

                self.assertEqual(warnings, [])
                self.assertEqual(result["errors"], [])
                self.assertEqual(result["failureReplay"], [])
                self.assertEqual(result["coverage"]["scenarios"]["failed"], 0)
                self.assertEqual(
                    result["coverage"]["scenarios"]["completed"], len(scenarios)
                )
                self.assertGreater(result["coverage"]["actions"]["completed"], 0)
                self.assertGreater(result["coverage"]["assertions"]["passed"], 0)
                self.assertGreater(result["coverage"]["candidates"]["discovered"], 0)
                self.assertGreaterEqual(
                    len(result["stateGraph"]["edges"]),
                    result["coverage"]["actions"]["total"],
                )
                self.assertTrue(
                    any(edge.get("fromState") != edge.get("toState")
                        for edge in result["stateGraph"]["edges"])
                )

                serialized = json.dumps(result, ensure_ascii=False)
                self.assertNotIn("fixture-secret", serialized)
                self.assertNotIn("fixture@example.test", serialized)
                self.assertNotIn("研究方法", serialized)

                totals["scenarios"] += result["coverage"]["scenarios"]["total"]
                totals["actions"] += result["coverage"]["actions"]["total"]
                totals["assertions"] += result["coverage"]["assertions"]["total"]
                totals["changedEdges"] += sum(
                    edge.get("fromState") != edge.get("toState")
                    for edge in result["stateGraph"]["edges"]
                )

        if browser_unavailable is not None:
            self.skipTest("Playwright 浏览器不可用：" + browser_unavailable)
        self.assertEqual(totals["scenarios"], 8)
        self.assertEqual(totals["actions"], 14)
        self.assertEqual(totals["assertions"], 25)
        self.assertGreaterEqual(totals["changedEdges"], 8)

    def test_page_matrix_covers_static_events_and_direct_media_rules(self):
        expected_media = {
            "auth-tabs": 0,
            "article-search": 1,
            "toc-reader": 1,
            "journal-dynamic": 1,
            "growth-filter": 1,
        }
        total_bindings = 0
        total_media = 0
        for name in _CASES:
            with self.subTest(page=name):
                html = _FIXTURES / f"{name}.html"
                source_index, source_warnings = extract_source_references(html)
                media_blocks, media_warnings = extract_css_media_blocks(html)
                self.assertEqual(source_warnings, [])
                self.assertEqual(media_warnings, [])
                self.assertGreater(len(source_index["elements"]), 0)
                self.assertGreater(len(source_index["eventBindings"]), 0)
                self.assertEqual(len(media_blocks), expected_media[name])
                for block in media_blocks:
                    self.assertTrue(block["breakpoint"])
                    self.assertGreater(len(block["changes"]), 0)
                total_bindings += len(source_index["eventBindings"])
                total_media += len(media_blocks)

        self.assertGreaterEqual(total_bindings, 10)
        self.assertEqual(total_media, 4)


if __name__ == "__main__":
    unittest.main()
