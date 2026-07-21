"""Fast scaffold generator regression tests."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

_SRC = Path(__file__).resolve().parents[2] / "src"
sys.path.insert(0, str(_SRC))

from ui_dismantler.generation.scaffold import render_all  # noqa: E402


class TestScaffoldGenerator(unittest.TestCase):
    def _manifest(self):
        return {
            "meta": {"caseName": "demo", "title": "Demo"},
            "theme": {"tokens": [], "gradients": []},
            "structure": {
                "tabs": [{"id": "main", "label": "Main", "count": 1}],
                "views": [{"id": "panel-main", "tabId": "main", "type": "member-grid"}],
                "modals": [],
                "storyPanels": [],
            },
            "data": {},
            "interactions": [],
            "responsive": [],
            "a11y": {},
        }

    def test_scaffold_writes_case_and_reuse_template(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            out = Path(temp_dir) / "lib"
            render_all(self._manifest(), out, "demo", "sg")
            expected = [
                out / "README.md",
                out / "docs" / "设计规范.md",
                out / "examples" / "demo.html",
                out / "examples" / "template.html",
                out / "src" / "demo.css",
                out / "src" / "demo.js",
                out / "manifest.json",
            ]
            for path in expected:
                self.assertTrue(path.is_file(), path)
            self.assertIn("替换下方 mount options", (out / "examples" / "template.html").read_text())
            generated_js = (out / "src" / "demo.js").read_text(encoding="utf-8")
            self.assertIn("if (m.img)", generated_js, "无图片占位数据时不得生成 broken img")

    def test_carousel_state_classes_are_prefixed(self):
        manifest = self._manifest()
        manifest["structure"]["tabs"] = [{"id": "works", "label": "Works", "count": 3}]
        manifest["structure"]["views"] = [{
            "id": "panel-works",
            "tabId": "works",
            "type": "carousel-3d",
            "positions": [
                {"cls": "is-center", "opacity": 1, "zIndex": 3},
                {"cls": "is-prev-side", "opacity": 0.7, "zIndex": 2},
            ],
        }]
        with tempfile.TemporaryDirectory() as temp_dir:
            out = Path(temp_dir) / "lib"
            render_all(manifest, out, "demo", "sg")
            js = (out / "src" / "demo.js").read_text(encoding="utf-8")
            css = (out / "src" / "demo.css").read_text(encoding="utf-8")
            self.assertIn("PREFIX + '-is-center'", js)
            self.assertIn(".sg-work-item.sg-is-center", css)
            self.assertNotIn(".sg-work-item.is-center", css)

    def test_scaffold_js_is_syntax_valid(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            out = Path(temp_dir) / "lib"
            render_all(self._manifest(), out, "demo", "sg")
            proc = subprocess.run(
                ["node", "--check", str(out / "src" / "demo.js")],
                capture_output=True,
                text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
