"""Optional Chromium CDP CSS evidence tests."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "scripts" / "cdp_css_probe.mjs"
CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
FIXTURE = ROOT / "scripts/tests/fixtures/roundtrip/responsive.html"


@unittest.skipUnless(shutil.which("node"), "需要 Node.js")
class TestCdpCssProbe(unittest.TestCase):
    def test_unavailable_chrome_is_explicit(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            out = Path(temp_dir) / "unavailable.json"
            proc = subprocess.run(
                [
                    "node", str(PROBE), str(FIXTURE),
                    "--selector", "body",
                    "--chrome", str(Path(temp_dir) / "missing-chrome"),
                    "--out", str(out),
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            result = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(result["status"], "unavailable")
        self.assertFalse(result["comparable"])

    @unittest.skipUnless(CHROME.is_file(), "本机没有 Google Chrome，跳过真实 CDP 测试")
    def test_real_chrome_returns_matched_and_computed_styles(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            out = Path(temp_dir) / "cdp.json"
            proc = subprocess.run(
                [
                    "node", str(PROBE), str(FIXTURE),
                    "--selector", "body",
                    "--chrome", str(CHROME),
                    "--out", str(out),
                    "--max-samples", "1",
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            result = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(result["status"], "ok", proc.stderr)
        self.assertTrue(result["comparable"])
        self.assertEqual(result["engine"], "chromium-cdp")
        body = result["selectors"][0]
        self.assertEqual(body["status"], "ok")
        self.assertGreaterEqual(len(body["nodes"][0]["matchedStyles"]["matchedRules"]), 1)
        self.assertIn("display", body["nodes"][0]["computedStyle"])
