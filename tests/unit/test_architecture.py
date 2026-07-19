"""Repository architecture contract tests."""

from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "src" / "ui_dismantler"
COMPAT = ROOT / "src" / "skill" / "scripts"


class TestArchitectureBoundaries(unittest.TestCase):
    def test_core_package_has_expected_domain_boundaries(self):
        for relative in (
            "analysis/html.py",
            "core/common.py",
            "generation/showcase.py",
            "validation/library.py",
            "aggregation/vertical.py",
            "uiir/schema.py",
            "uiir/validation.py",
            "uiir/conversion/manifest_to_uiir.py",
            "uiir/conversion/uiir_to_manifest.py",
            "uiir/projection/compact.py",
            "uiir/projection/expanded.py",
            "uiir/projection/diff.py",
            "uiir/extraction/css_media.py",
            "uiir/runtime/runtime_refs.py",
            "uiir/runtime/scenarios.py",
            "uiir/runtime/actions.py",
            "uiir/runtime/assertions.py",
            "uiir/runtime/init_script.py",
            "cli/manifest_to_uiir.py",
        ):
            with self.subTest(relative=relative):
                self.assertTrue((CORE / relative).is_file())

    def test_core_never_imports_the_skill_compatibility_layer(self):
        forbidden = ("src.skill.scripts", "skill.scripts", "from _bootstrap")
        for path in CORE.rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            with self.subTest(path=path.relative_to(ROOT)):
                self.assertFalse(any(value in text for value in forbidden))

    def test_legacy_entry_points_are_thin_wrappers(self):
        entry_points = (
            "analyze_html.py",
            "generate_lib.py",
            "generate_showcase.py",
            "validate_lib.py",
            "manifest_to_uiir.py",
            "uiir_to_compact.py",
        )
        for name in entry_points:
            text = (COMPAT / name).read_text(encoding="utf-8")
            code_lines = [line for line in text.splitlines() if line.strip() and not line.startswith("#")]
            with self.subTest(name=name):
                self.assertIn("from _bootstrap import expose", text)
                self.assertIn("expose(", text)
                self.assertLessEqual(len(code_lines), 8)

    def test_documentation_index_links_resolve(self):
        index = (ROOT / "docs" / "README.md").read_text(encoding="utf-8")
        for target in re.findall(r"\[[^]]+\]\(([^)]+)\)", index):
            with self.subTest(target=target):
                self.assertTrue((ROOT / "docs" / target).resolve().exists())

    def test_baselines_are_grouped_by_contract(self):
        baseline_root = ROOT / "docs" / "baselines"
        self.assertEqual(
            {path.name for path in baseline_root.iterdir() if path.is_dir()},
            {"manifests", "runtime", "roundtrip"},
        )
        self.assertEqual(len(list((baseline_root / "manifests").glob("*.json"))), 2)
        self.assertEqual(len(list((baseline_root / "runtime").glob("*.json"))), 2)
        self.assertEqual(len(list((baseline_root / "roundtrip").glob("*.json"))), 3)


if __name__ == "__main__":
    unittest.main()
