"""Gold delivery orchestration and regression-gate tests."""
from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

_SRC = Path(__file__).resolve().parents[2] / "src"
sys.path.insert(0, str(_SRC))

from ui_dismantler.evaluation import delivery  # noqa: E402


class _Proc:
    returncode = 0
    stderr = ""


class TestDeliveryRegressionGate(unittest.TestCase):
    def _run(self, baseline_scores, *, class_coverage=1.0, class_threshold=None):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        lib = root / "lib"
        (lib / "src").mkdir(parents=True)
        (lib / "examples").mkdir()
        (lib / "src" / "demo.js").write_text("var x = 1;", encoding="utf-8")
        example = lib / "examples" / "case.html"
        example.write_text("<!doctype html>", encoding="utf-8")
        (lib / "examples" / "template.html").write_text("<!doctype html><div id=\"mount\"></div>", encoding="utf-8")
        original = root / "original.html"
        original.write_text("<!doctype html>", encoding="utf-8")
        baseline = root / "baseline.json"
        baseline.write_text(json.dumps({
            "scores": baseline_scores,
            "timingsMs": {"total": 100000},
        }), encoding="utf-8")
        fake_dom = {"ok": True, "childCount": 1, "dom": {"tag": "div", "classes": [], "children": []}, "texts": []}
        current = {
            "structure": {"node_match_rate": 1.0, "class_match_rate": 1.0},
            "text": {"text_match_rate": 1.0},
            "scores": {"structure": 0.96, "text": 1.0, "overall": 0.98},
            "class_coverage": {
                "rate": class_coverage,
                "totalClassUses": 10,
                "coveredClassUses": round(10 * class_coverage),
                "missingClasses": [],
            },
        }
        patches = [
            patch.object(delivery, "generate_showcase", return_value='<!doctype html><section id="overview"><div class="ds-bento-grid"></div></section>'),
            patch.object(delivery.LibValidator, "evaluate", return_value=[("ok", True, "")]),
            patch.object(delivery.subprocess, "run", return_value=_Proc()),
            patch.object(delivery, "resolve_reference_dom", return_value=fake_dom),
            patch.object(delivery, "render_generated_dom", return_value=fake_dom),
            patch.object(delivery, "score_comparison", return_value=current),
        ]
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            return delivery.verify_delivery(
                original,
                lib,
                example,
                overall_threshold=0.98,
                class_coverage_threshold=class_threshold,
                baseline_report=baseline,
                max_score_drop=0.0,
                max_time_ratio=2.0,
            )

    def test_equal_or_better_scores_pass(self):
        report = self._run({"structure": 0.96, "text": 1.0, "overall": 0.98})
        self.assertTrue(report["passed"])
        self.assertTrue(report["regression"]["passed"])

    def test_score_drop_fails_delivery(self):
        report = self._run({"structure": 0.97, "text": 1.0, "overall": 0.99})
        self.assertFalse(report["passed"])
        self.assertFalse(report["regression"]["passed"])
        self.assertFalse(report["regression"]["scores"]["overall"]["passed"])

    def test_template_mount_is_part_of_delivery_gate(self):
        report = self._run({"structure": 0.96, "text": 1.0, "overall": 0.98})
        self.assertTrue(report["templateRender"]["passed"])

    def test_class_coverage_threshold_can_fail_delivery(self):
        report = self._run(
            {"structure": 0.96, "text": 1.0, "overall": 0.98},
            class_coverage=0.8,
            class_threshold=0.98,
        )
        self.assertFalse(report["passed"])
        self.assertFalse(report["class_coverage"]["passed"])



if __name__ == "__main__":
    unittest.main(verbosity=2)
