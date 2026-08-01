"""Portable Skill runtime and installer regression tests."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SKILL_SOURCE = ROOT / "src" / "skill"


class SkillRuntimeTests(unittest.TestCase):
    def install_fixture(self, directory: Path) -> Path:
        target = directory / "installed-skill"
        shutil.copytree(SKILL_SOURCE, target, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        (target / ".ui-dismantler-runtime.json").write_text(
            json.dumps({"schemaVersion": "1.0", "runtimeRoot": str(ROOT)}),
            encoding="utf-8",
        )
        return target

    def test_installed_analyzer_runs_outside_repository_cwd(self):
        with tempfile.TemporaryDirectory(prefix="ui-dismantler-skill-runtime-") as raw:
            directory = Path(raw)
            skill = self.install_fixture(directory)
            source = directory / "source.html"
            output = directory / "manifest.json"
            source.write_text(
                "<!doctype html><html lang='en'><head><title>Portable</title>"
                "<style>:root{--ink:#111}</style></head><body><main><h1>Portable Skill</h1></main></body></html>",
                encoding="utf-8",
            )
            result = subprocess.run(
                ["python3", str(skill / "scripts" / "analyze_html.py"), str(source), "--out", str(output)],
                cwd=directory,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["meta"]["title"], "Portable")

    def test_run_ts_and_preflight_use_installed_locator(self):
        with tempfile.TemporaryDirectory(prefix="ui-dismantler-skill-ts-") as raw:
            directory = Path(raw)
            skill = self.install_fixture(directory)
            help_result = subprocess.run(
                ["python3", str(skill / "scripts" / "run_ts.py"), "--help"],
                cwd=directory,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(help_result.returncode, 0, help_result.stderr)
            preflight = subprocess.run(
                ["python3", str(skill / "scripts" / "tool_preflight.py")],
                cwd=directory,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(preflight.returncode, 0, preflight.stderr)
            payload = json.loads(preflight.stdout)
            self.assertTrue(payload["ready"])
            self.assertEqual(Path(payload["runtimeRoot"]), ROOT)

    def test_environment_runtime_overrides_stale_locator(self):
        with tempfile.TemporaryDirectory(prefix="ui-dismantler-skill-env-") as raw:
            directory = Path(raw)
            skill = self.install_fixture(directory)
            (skill / ".ui-dismantler-runtime.json").write_text(
                json.dumps({"runtimeRoot": str(directory / "missing")}),
                encoding="utf-8",
            )
            environment = {**os.environ, "UI_DISMANTLER_RUNTIME_ROOT": str(ROOT)}
            result = subprocess.run(
                ["python3", str(skill / "scripts" / "tool_preflight.py")],
                cwd=directory,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(Path(json.loads(result.stdout)["runtimeRoot"]), ROOT)

    def test_missing_runtime_fails_preflight_with_machine_readable_output(self):
        with tempfile.TemporaryDirectory(prefix="ui-dismantler-skill-missing-") as raw:
            directory = Path(raw)
            skill = self.install_fixture(directory)
            (skill / ".ui-dismantler-runtime.json").write_text(
                json.dumps({"runtimeRoot": str(directory / "missing")}),
                encoding="utf-8",
            )
            home = directory / "home"
            home.mkdir()
            environment = {key: value for key, value in os.environ.items() if key != "UI_DISMANTLER_RUNTIME_ROOT"}
            environment["HOME"] = str(home)
            preflight = subprocess.run(
                ["python3", str(skill / "scripts" / "tool_preflight.py")],
                cwd=directory,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(preflight.returncode, 2)
            payload = json.loads(preflight.stdout)
            self.assertFalse(payload["ready"])
            self.assertTrue(payload["issues"])
            command = subprocess.run(
                ["python3", str(skill / "scripts" / "run_ts.py"), "skill-list"],
                cwd=directory,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(command.returncode, 2)
            self.assertIn("runtime is unavailable", command.stderr)

    def test_installer_writes_runtime_locator_and_filters_bytecode(self):
        with tempfile.TemporaryDirectory(prefix="ui-dismantler-skill-install-") as raw:
            target = Path(raw) / "ui-dismantler"
            result = subprocess.run(
                ["node", str(ROOT / "scripts" / "install_skill.mjs"), "--target", str(target)],
                cwd=Path(raw),
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            locator = json.loads((target / ".ui-dismantler-runtime.json").read_text(encoding="utf-8"))
            self.assertEqual(Path(locator["runtimeRoot"]), ROOT)
            self.assertFalse(any(target.rglob("*.pyc")))
            self.assertFalse(any(path.name == "__pycache__" for path in target.rglob("__pycache__")))


if __name__ == "__main__":
    unittest.main()
