"""test_showcase.py — 设计系统展示页生成器单元测试

覆盖:
- generate_showcase: 正向生成 + 输出是合法 HTML + 含设计令牌
- classify_var: CSS 变量按语义分组
- 端到端: benchmark/lib 的 showcase 生成
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path

_SRC = os.path.join(os.path.dirname(__file__), "..", "..", "src")
sys.path.insert(0, os.path.abspath(_SRC))

from ui_dismantler.generation.showcase import generate_showcase, classify_var  # noqa: E402


class TestClassifyVar(unittest.TestCase):
    """classify_var: 把 --sg-* 变量按语义分组。"""

    def test_color_var_classified(self):
        """颜色变量被分到色卡组。"""
        result = classify_var("--sg-primary", "#4f46e5")
        self.assertIsNotNone(result)

    def test_non_color_var(self):
        """非颜色变量（如 --sg-frame-w）可能返回 None 或其他分组。"""
        result = classify_var("--sg-frame-w", "800px")
        # 布局变量可能不被分类为颜色（取决于实现）
        # 这里只验证不报错
        self.assertTrue(result is None or isinstance(result, str))


class TestGenerateShowcase(unittest.TestCase):
    """generate_showcase: 从组件库 CSS 生成展示页。"""

    _MIN_LIB_CSS = """\
:root, .sg-frame {
  --sg-primary: #4f46e5;
  --sg-accent: #ec4899;
  --sg-ink: #1a1a2e;
  --sg-muted: #6b7280;
  --sg-line: #e5e7eb;
  --sg-paper: #ffffff;
  --sg-stage: #f3f4f6;
}
@media (max-width: 500px) { .sg-frame { --sg-frame-w: 380px; } }
@media (max-width: 320px) { .sg-frame { --sg-frame-w: 300px; } }
"""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        lib_dir = os.path.join(self.tmpdir, "test-lib")
        os.makedirs(os.path.join(lib_dir, "src"))
        with open(os.path.join(lib_dir, "src", "test.css"), "w", encoding="utf-8") as f:
            f.write(self._MIN_LIB_CSS)
        self.lib_dir = Path(lib_dir)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_generates_valid_html(self):
        """生成的输出是合法 HTML（含 <!doctype html>）。"""
        html = generate_showcase(self.lib_dir)
        self.assertIsInstance(html, str)
        self.assertIn("<!doctype html>", html.lower())
        self.assertIn("</html>", html.lower())

    def test_output_contains_design_tokens(self):
        """输出包含 --sg-* 变量信息。"""
        html = generate_showcase(self.lib_dir)
        self.assertIn("sg-primary", html)
        self.assertIn("#4f46e5", html)

    def test_output_contains_responsive_info(self):
        """输出包含响应式断点信息。"""
        html = generate_showcase(self.lib_dir)
        # 展示页应提及响应式断点
        self.assertTrue(
            "500" in html or "media" in html.lower(),
            "展示页应包含响应式信息",
        )

    def test_output_has_no_external_deps(self):
        """输出是自包含的（无外部 CSS/JS 依赖）。"""
        html = generate_showcase(self.lib_dir)
        # 不应引用外部 CDN
        self.assertNotIn("cdn.", html.lower())
        self.assertNotIn("https://unpkg", html.lower())


class TestBenchmarkShowcase(unittest.TestCase):
    """用 benchmark/lib 做端到端验证。"""

    def setUp(self):
        repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        self.lib_dir = Path(repo) / "benchmark" / "lib"
        if not (self.lib_dir / "src").is_dir():
            self.skipTest("benchmark/lib 不存在")

    def test_benchmark_showcase_generation(self):
        """benchmark/lib -> showcase 生成成功且是合法 HTML。"""
        html = generate_showcase(self.lib_dir)
        self.assertIn("<!doctype html>", html.lower())
        self.assertIn("sg-primary", html)
        self.assertIn("sg-accent", html)


if __name__ == "__main__":
    unittest.main(verbosity=2)
