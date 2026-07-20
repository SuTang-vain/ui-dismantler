"""运行态参照与技术特征矩阵测试。"""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

_SCRIPTS = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.abspath(_SCRIPTS))

import roundtrip as rt  # noqa: E402


FIXTURES = Path(__file__).resolve().parent / "fixtures" / "roundtrip"


def _classes(node: dict | None) -> set[str]:
    if not node:
        return set()
    out = set(node.get("classes", []))
    for child in node.get("children", []):
        out.update(_classes(child))
    return out


class TestRenderedReference(unittest.TestCase):
    def test_inline_javascript_changes_reference_dom(self):
        html = FIXTURES / "dynamic-inline.html"
        static = rt.extract_reference_dom(html)
        rendered = rt.render_reference_dom(html)
        self.assertTrue(rendered["ok"], rendered.get("error"))
        self.assertNotIn("Runtime title", static["texts"])
        self.assertIn("Runtime title", rendered["texts"])
        self.assertIn("dynamic-panel", _classes(rendered["dom"]))

    def test_form_and_dialog_runtime_content_is_observed(self):
        rendered = rt.render_reference_dom(FIXTURES / "form-dialog.html")
        self.assertTrue(rendered["ok"], rendered.get("error"))
        self.assertIn("Email address", rendered["texts"])
        self.assertIn("Review account details", rendered["texts"])
        self.assertIn("dialog-panel", _classes(rendered["dom"]))

    def test_viewport_controls_match_media(self):
        html = FIXTURES / "responsive.html"
        mobile = rt.render_reference_dom(html, width=375, height=667)
        desktop = rt.render_reference_dom(html, width=1024, height=768)
        self.assertIn("mobile-layout", mobile["texts"])
        self.assertIn("desktop-layout", desktop["texts"])

    def test_auto_fallback_is_explicit(self):
        html = FIXTURES / "dynamic-inline.html"
        with patch.object(rt, "render_reference_dom", return_value={"ok": False, "error": "boom"}):
            result = rt.resolve_reference_dom(html, mode="auto")
        self.assertTrue(result["ok"])
        self.assertEqual(result["mode"], "static")
        self.assertTrue(result["fallback"])
        self.assertEqual(result["runtime_error"], "boom")

    def test_rendered_mode_never_silently_falls_back(self):
        html = FIXTURES / "dynamic-inline.html"
        with patch.object(rt, "render_reference_dom", return_value={"ok": False, "error": "boom"}):
            result = rt.resolve_reference_dom(html, mode="rendered")
        self.assertFalse(result["ok"])
        self.assertFalse(result["fallback"])

    def test_auto_mode_reports_successful_runtime_provenance(self):
        result = rt.resolve_reference_dom(FIXTURES / "dynamic-inline.html", mode="auto")
        self.assertTrue(result["ok"], result.get("error"))
        self.assertEqual(result["requested_mode"], "auto")
        self.assertEqual(result["mode"], "reference")
        self.assertFalse(result["fallback"])

    def test_missing_local_resource_is_reported(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            html = Path(temp_dir) / "missing.html"
            html.write_text(
                '<!doctype html><html><body><main>Static body</main>'
                '<script src="missing.js"></script></body></html>',
                encoding="utf-8",
            )
            rendered = rt.render_reference_dom(html)
        self.assertTrue(rendered["ok"])
        self.assertEqual(rendered["missingFiles"], ["missing.js"])

    def test_remote_resources_are_reported_without_network_access(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            html = Path(temp_dir) / "remote.html"
            html.write_text(
                '<!doctype html><html><head>'
                '<link rel="stylesheet" href="https://cdn.example/theme.css">'
                '</head><body><main>Offline body</main>'
                '<script src="https://cdn.example/app.js"></script></body></html>',
                encoding="utf-8",
            )
            rendered = rt.render_reference_dom(html)
        self.assertTrue(rendered["ok"], rendered.get("error"))
        self.assertEqual(
            rendered["remoteResources"],
            ["https://cdn.example/theme.css", "https://cdn.example/app.js"],
        )
        self.assertIn("Offline body", rendered["texts"])

    def test_site_root_resources_and_intersection_observer_are_supported(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            page_dir = root / "projects" / "demo"
            shared_dir = root / "shared"
            page_dir.mkdir(parents=True)
            shared_dir.mkdir()
            (shared_dir / "nav.js").write_text(
                "document.addEventListener('DOMContentLoaded', function() {"
                "document.body.insertAdjacentHTML('afterbegin', '<nav>Shared nav</nav>');"
                "});",
                encoding="utf-8",
            )
            html = page_dir / "index.html"
            html.write_text(
                "<!doctype html><html><head>"
                "<script src='/shared/nav.js'></script>"
                "</head><body><section class='reveal'>Reveal content</section>"
                "<script>new IntersectionObserver(function(entries) {"
                "entries.forEach(function(entry) { entry.target.classList.add('visible'); });"
                "}).observe(document.querySelector('.reveal'));</script></body></html>",
                encoding="utf-8",
            )
            rendered = rt.render_reference_dom(html)

        self.assertTrue(rendered["ok"], rendered.get("error"))
        self.assertEqual(rendered["jsFiles"], 1)
        self.assertEqual(rendered["missingFiles"], [])
        self.assertEqual(rendered["runtimeErrors"], [])
        self.assertIn("Shared nav", rendered["texts"])
        self.assertIn("visible", _classes(rendered["dom"]))


class TestTechnicalFeatureMatrix(unittest.TestCase):
    SOURCE = FIXTURES / "multi-resource" / "original.html"
    LIB = FIXTURES / "multi-resource" / "lib"

    def test_multiple_local_resources_execute_in_document_order(self):
        reference = rt.render_reference_dom(self.SOURCE)
        library = rt.render_generated_dom(self.LIB)
        self.assertTrue(reference["ok"], reference.get("error"))
        self.assertTrue(library["ok"], library.get("error"))
        self.assertEqual(reference["cssFiles"], 2)
        self.assertEqual(reference["jsFiles"], 2)
        self.assertEqual(library["cssFiles"], 2)
        self.assertEqual(library["jsFiles"], 2)
        self.assertIn("Ordered local resources", reference["texts"])
        self.assertIn("Ordered local resources", library["texts"])

    def test_full_runtime_roundtrip_reports_reference_provenance(self):
        proc = subprocess.run(
            [
                sys.executable,
                str(Path(rt.__file__)),
                str(self.SOURCE),
                "--lib", str(self.LIB),
                "--reference-mode", "rendered",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        report = json.loads(proc.stdout)
        self.assertEqual(report["reference"]["mode"], "reference")
        self.assertFalse(report["reference"]["fallback"])
        self.assertGreaterEqual(report["scores"]["overall"], 0.95)


if __name__ == "__main__":
    unittest.main(verbosity=2)
