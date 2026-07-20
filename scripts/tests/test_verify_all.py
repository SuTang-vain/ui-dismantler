"""verify_all 批量调度的案例匹配与命令协议测试。"""

from pathlib import Path
import os
import sys
import unittest

_SCRIPTS = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.abspath(_SCRIPTS))

import verify_all  # noqa: E402


class TestSelectCases(unittest.TestCase):
    CASES = [
        ("blackpink", Path("/cases/blackpink/original.html")),
        ("blackpink-v10", Path("/cases/blackpink-v10/original.html")),
    ]

    def test_single_library_uses_parent_case_directory(self):
        selected = verify_all.select_cases(
            self.CASES,
            Path("/cases/blackpink-v10/lib"),
            single_lib_mode=True,
        )
        self.assertEqual([name for name, _ in selected], ["blackpink-v10"])

    def test_ambiguous_single_library_requires_explicit_case(self):
        with self.assertRaises(ValueError):
            verify_all.select_cases(
                self.CASES,
                Path("/tmp/component-lib"),
                single_lib_mode=True,
            )

    def test_explicit_case_overrides_directory_inference(self):
        selected = verify_all.select_cases(
            self.CASES,
            Path("/tmp/component-lib"),
            single_lib_mode=True,
            requested_case="blackpink",
        )
        self.assertEqual([name for name, _ in selected], ["blackpink"])


class TestRoundtripCommand(unittest.TestCase):
    def test_command_contains_strict_reference_and_viewport(self):
        command = verify_all.build_roundtrip_command(
            Path("input.html"),
            Path("lib"),
            Path("report.json"),
            "rendered",
            390,
            844,
        )
        self.assertEqual(command[0], sys.executable)
        self.assertIn("--reference-mode", command)
        self.assertIn("rendered", command)
        self.assertIn("--width", command)
        self.assertIn("390", command)
        self.assertIn("--height", command)
        self.assertIn("844", command)

    def test_command_forwards_scenario_matrix(self):
        command = verify_all.build_roundtrip_command(
            Path("input.html"),
            Path("lib"),
            Path("report.json"),
            "rendered",
            1024,
            768,
            Path("scenarios.json"),
            0.9,
        )
        self.assertIn("--scenarios", command)
        self.assertIn("scenarios.json", command)
        self.assertIn("--state-threshold", command)
        self.assertIn("0.9", command)


if __name__ == "__main__":
    unittest.main(verbosity=2)
