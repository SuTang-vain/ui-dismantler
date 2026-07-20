"""verify_all 批量调度的案例匹配与命令协议测试。"""

from pathlib import Path
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

_SCRIPTS = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.abspath(_SCRIPTS))

# 优先 import 规范包（mock 需要作用于业务模块本身）
_SRC = os.path.join(os.path.dirname(__file__), "..", "..", "src")
sys.path.insert(0, os.path.abspath(_SRC))

import verify_all  # noqa: E402  旧桥接（向后兼容）
from ui_dismantler.evaluation import batch as batch_mod  # noqa: E402


class TestSelectCases(unittest.TestCase):
    CASES = [
<<<<<<< HEAD
        ("blackpink", Path("/cases/blackpink/original.html")),
        ("blackpink-v10", Path("/cases/blackpink-v10/original.html")),
=======
        ("benchmark", Path("/benchmark/original.html")),
        ("glossary-v2", Path("/cases/glossary-v2/original.html")),
>>>>>>> codex/generic-agent-quality
    ]

    def test_single_library_uses_parent_case_directory(self):
        selected = verify_all.select_cases(
            self.CASES,
<<<<<<< HEAD
            Path("/cases/blackpink-v10/lib"),
            single_lib_mode=True,
        )
        self.assertEqual([name for name, _ in selected], ["blackpink-v10"])
=======
            Path("/benchmark/lib"),
            single_lib_mode=True,
        )
        self.assertEqual([name for name, _ in selected], ["benchmark"])
>>>>>>> codex/generic-agent-quality

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
<<<<<<< HEAD
            requested_case="blackpink",
        )
        self.assertEqual([name for name, _ in selected], ["blackpink"])
=======
            requested_case="benchmark",
        )
        self.assertEqual([name for name, _ in selected], ["benchmark"])
>>>>>>> codex/generic-agent-quality


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

    def test_command_forwards_manifest_coverage_gate(self):
        command = verify_all.build_roundtrip_command(
            Path("input.html"),
            Path("lib"),
            Path("report.json"),
            "rendered",
            1024,
            768,
            Path("scenarios.json"),
            0.9,
            Path("manifest.json"),
            0.8,
        )
        self.assertIn("--manifest", command)
        self.assertIn("manifest.json", command)
        self.assertIn("--coverage-threshold", command)
        self.assertIn("0.8", command)


class TestHashFunctions(unittest.TestCase):
    """html_hash / lib_hash 的确定性测试。"""

    def test_html_hash_is_deterministic(self):
        """相同内容 → 相同 hash。"""
        with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as tf:
            tf.write(b"<html>test</html>")
            path = Path(tf.name)
        try:
            self.assertEqual(batch_mod.html_hash(path), batch_mod.html_hash(path))
        finally:
            path.unlink()

    def test_html_hash_changes_with_content(self):
        """不同内容 → 不同 hash。"""
        with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as tf1:
            tf1.write(b"<html>A</html>")
            p1 = Path(tf1.name)
        with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as tf2:
            tf2.write(b"<html>B</html>")
            p2 = Path(tf2.name)
        try:
            self.assertNotEqual(batch_mod.html_hash(p1), batch_mod.html_hash(p2))
        finally:
            p1.unlink()
            p2.unlink()

    def test_lib_hash_covers_source_files(self):
        """lib_hash 覆盖 css/js/html/md 文件。"""
        with tempfile.TemporaryDirectory() as d:
            lib = Path(d)
            (lib / "a.css").write_text(".x{color:red}", encoding="utf-8")
            (lib / "b.js").write_text("var x=1;", encoding="utf-8")
            h1 = batch_mod.lib_hash(lib)
            # 加一个非源码文件不应改变 hash
            (lib / "ignore.txt").write_text("noise", encoding="utf-8")
            h2 = batch_mod.lib_hash(lib)
            self.assertEqual(h1, h2)
            # 修改源码文件应改变 hash
            (lib / "a.css").write_text(".x{color:blue}", encoding="utf-8")
            h3 = batch_mod.lib_hash(lib)
            self.assertNotEqual(h2, h3)


class TestCacheLayer(unittest.TestCase):
    """缓存读写 + 清除测试。"""

    def setUp(self):
        """每个测试前清缓存，避免互相干扰。"""
        batch_mod.clear_cache()

    def tearDown(self):
        batch_mod.clear_cache()

    def test_set_and_get_cached_hash(self):
        batch_mod.set_cached_hash("test_key", "abc123")
        self.assertEqual(batch_mod.get_cached_hash("test_key"), "abc123")

    def test_get_cached_hash_returns_none_for_missing(self):
        self.assertIsNone(batch_mod.get_cached_hash("nonexistent_key"))

    def test_clear_cache_returns_count(self):
        batch_mod.set_cached_hash("k1", "v1")
        batch_mod.set_cached_hash("k2", "v2")
        count = batch_mod.clear_cache()
        self.assertGreaterEqual(count, 2)
        # 再清一次应为 0 或目录不存在
        self.assertEqual(batch_mod.clear_cache(), 0)

    def test_clear_cache_when_empty(self):
        """空缓存清除不报错。"""
        batch_mod.clear_cache()
        self.assertEqual(batch_mod.clear_cache(), 0)


class TestRunSingleCaseCaching(unittest.TestCase):
    """run_single_case 的缓存命中逻辑测试（用 mock 避免实跑）。"""

    def setUp(self):
        batch_mod.clear_cache()

    def tearDown(self):
        batch_mod.clear_cache()

    def _fake_report(self, overall: float = 0.99) -> dict:
        return {
            "render_ok": True,
            "scores": {"structure": 0.99, "text": 0.99, "overall": overall},
            "reference": {"mode": "reference"},
        }

    def test_cache_hit_skips_roundtrip(self):
        """第二次调用相同案例应命中缓存，不调 run_roundtrip。"""
        with tempfile.TemporaryDirectory() as d:
            html = Path(d) / "x.html"
            html.write_text("<html/>", encoding="utf-8")
            lib = Path(d) / "lib"
            lib.mkdir()
            (lib / "a.css").write_text(".x{}", encoding="utf-8")

            with patch.object(batch_mod, "run_roundtrip",
                              return_value={"ok": True, "report": self._fake_report()}) as mock:
                r1 = batch_mod.run_single_case(
                    "x", html, lib, 0.85, use_cache=True,
                )
                self.assertFalse(r1["cached"])
                self.assertTrue(r1["ok"])
                self.assertEqual(mock.call_count, 1)

                r2 = batch_mod.run_single_case(
                    "x", html, lib, 0.85, use_cache=True,
                )
                self.assertTrue(r2["cached"])
                self.assertTrue(r2["ok"])
                # 关键：第二次未调 run_roundtrip
                self.assertEqual(mock.call_count, 1)

    def test_scenarios_disables_cache(self):
        """含 scenarios 的案例不缓存（执行有副作用）。"""
        with tempfile.TemporaryDirectory() as d:
            html = Path(d) / "x.html"
            html.write_text("<html/>", encoding="utf-8")
            lib = Path(d) / "lib"
            lib.mkdir()
            (lib / "a.css").write_text(".x{}", encoding="utf-8")
            sc = Path(d) / "sc.json"
            sc.write_text("{}", encoding="utf-8")

            with patch.object(batch_mod, "run_roundtrip",
                              return_value={"ok": True, "report": self._fake_report()}) as mock:
                batch_mod.run_single_case(
                    "x", html, lib, 0.85, scenarios=sc, use_cache=True,
                )
                batch_mod.run_single_case(
                    "x", html, lib, 0.85, scenarios=sc, use_cache=True,
                )
                # 两次都实跑（场景矩阵不缓存）
                self.assertEqual(mock.call_count, 2)

    def test_no_cache_always_runs(self):
        """use_cache=False 时总是实跑。"""
        with tempfile.TemporaryDirectory() as d:
            html = Path(d) / "x.html"
            html.write_text("<html/>", encoding="utf-8")
            lib = Path(d) / "lib"
            lib.mkdir()
            (lib / "a.css").write_text(".x{}", encoding="utf-8")

            with patch.object(batch_mod, "run_roundtrip",
                              return_value={"ok": True, "report": self._fake_report()}) as mock:
                batch_mod.run_single_case("x", html, lib, 0.85, use_cache=False)
                batch_mod.run_single_case("x", html, lib, 0.85, use_cache=False)
                self.assertEqual(mock.call_count, 2)


class TestRunCasesParallel(unittest.TestCase):
    """并行调度测试。"""

    def test_serial_mode_workers_one(self):
        """workers=1 走串行路径。"""
        cases = [("a", Path("/a.html"), Path("/liba")), ("b", Path("/b.html"), Path("/libb"))]
        with patch.object(batch_mod, "run_single_case",
                          side_effect=[
                              {"case": "a", "ok": True, "passed": True},
                              {"case": "b", "ok": True, "passed": True},
                          ]) as mock:
            results = batch_mod.run_cases_parallel(cases, 0.85, workers=1)
            self.assertEqual(len(results), 2)
            self.assertEqual(mock.call_count, 2)

    def test_parallel_mode_uses_threadpool(self):
        """workers>1 走 ThreadPoolExecutor 路径。"""
        cases = [("a", Path("/a.html"), Path("/liba")), ("b", Path("/b.html"), Path("/libb"))]
        with patch.object(batch_mod, "run_single_call" if False else "run_single_case",
                          side_effect=lambda *a, **kw: {"case": a[0], "ok": True, "passed": True}) as mock:
            results = batch_mod.run_cases_parallel(cases, 0.85, workers=2)
            self.assertEqual(len(results), 2)
            self.assertEqual(mock.call_count, 2)
            # 结果按案例名排序
            self.assertEqual([r["case"] for r in results], ["a", "b"])

    def test_empty_cases_returns_empty(self):
        self.assertEqual(batch_mod.run_cases_parallel([], 0.85, workers=4), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
