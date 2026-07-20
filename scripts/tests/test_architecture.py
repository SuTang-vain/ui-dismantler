"""test_architecture.py — 仓库架构契约测试

强制守护 ``src/ui_dismantler`` 规范包的分层结构，防止退化回扁平脚本堆。
参考 ``codex/designrepair-quality-kb`` 的 architecture guard 设计。

这些测试不验证业务逻辑，只验证"文件在哪里、谁不能 import 谁"。
"""

from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "src" / "ui_dismantler"
COMPAT = ROOT / "src" / "skill" / "scripts"


class TestArchitectureBoundaries(unittest.TestCase):
    def test_core_package_exists(self):
        """规范包 ui_dismantler 必须存在。"""
        self.assertTrue((CORE / "__init__.py").is_file(), "src/ui_dismantler/__init__.py 缺失")
        self.assertTrue((CORE / "paths.py").is_file(), "src/ui_dismantler/paths.py 缺失")

    def test_core_package_has_expected_domain_boundaries(self):
        """核心包必须有预期的领域边界文件。

        新增领域子包时，把对应文件加入此清单，强制守护其存在。
        """
        for relative in (
            "core/__init__.py",
            "core/common.py",
            "analysis/__init__.py",
            "analysis/html.py",
            "analysis/detectors.py",
            "cli/__init__.py",
            "cli/analyze_html.py",
        ):
            with self.subTest(relative=relative):
                self.assertTrue(
                    (CORE / relative).is_file(),
                    f"核心包缺少领域边界文件: {relative}",
                )

    def test_core_never_imports_the_skill_compatibility_layer(self):
        """核心包永远不能反向依赖旧扁平脚本层。

        这条断言是分层的关键防线：一旦核心包 import 了 src.skill.scripts，
        就形成了循环依赖（旧入口 → _bootstrap → 核心包 → 旧入口），分层失效。
        """
        forbidden = ("src.skill.scripts", "skill.scripts", "from _bootstrap")
        for path in CORE.rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            with self.subTest(path=path.relative_to(ROOT)):
                for token in forbidden:
                    self.assertFalse(
                        token in text,
                        f"{path.relative_to(ROOT)} 不允许引用旧兼容层: '{token}'",
                    )

    def test_legacy_common_is_thin_wrapper(self):
        """旧入口 _common.py 必须是薄桥接，不能内联业务逻辑。

        防止有人偷懒把业务代码写回扁平脚本，导致规范包与旧入口分叉。
        """
        common_compat = COMPAT / "_common.py"
        self.assertTrue(common_compat.is_file(), "src/skill/scripts/_common.py 缺失")
        text = common_compat.read_text(encoding="utf-8")
        code_lines = [
            line for line in text.splitlines()
            if line.strip() and not line.startswith("#") and not line.startswith('"""')
        ]
        with self.subTest(name="_common.py"):
            self.assertIn("from _bootstrap import expose", text, "_common.py 必须用 _bootstrap.expose 桥接")
            self.assertIn("expose(", text, "_common.py 必须调用 expose()")
            self.assertLessEqual(
                len(code_lines),
                8,
                f"_common.py 必须是 ≤8 行的薄桥接，当前 {len(code_lines)} 行代码",
            )

    def test_legacy_entry_points_are_thin_wrappers(self):
        """所有旧入口（analyze_html / view_detectors 等）必须是薄桥接。

        确保业务逻辑全部住在规范包里，旧入口只负责透出符号和转发 CLI 调用。
        """
        # analyze_html.py 桥接到 analysis.html + cli.analyze_html，允许 if __main__ 转发
        analyze_compat = COMPAT / "analyze_html.py"
        self.assertTrue(analyze_compat.is_file(), "src/skill/scripts/analyze_html.py 缺失")
        analyze_text = analyze_compat.read_text(encoding="utf-8")
        with self.subTest(name="analyze_html.py"):
            self.assertIn("from _bootstrap import expose", analyze_text)
            self.assertIn('expose("ui_dismantler.analysis.html"', analyze_text)
            self.assertIn('expose("ui_dismantler.cli.analyze_html"', analyze_text)
            # 不允许出现 argparse / sys.exit 等业务逻辑（CLI 应在 cli/ 层）
            self.assertNotIn("argparse", analyze_text, "analyze_html.py 桥接不应含 argparse")

        # view_detectors.py 桥接到 analysis.detectors
        detectors_compat = COMPAT / "view_detectors.py"
        self.assertTrue(detectors_compat.is_file(), "src/skill/scripts/view_detectors.py 缺失")
        detectors_text = detectors_compat.read_text(encoding="utf-8")
        with self.subTest(name="view_detectors.py"):
            self.assertIn("from _bootstrap import expose", detectors_text)
            self.assertIn('expose("ui_dismantler.analysis.detectors"', detectors_text)

    def test_analysis_html_has_no_cli_code(self):
        """analysis/html.py 业务逻辑层不能含 CLI 代码（argparse / sys.exit / main 函数）。

        这是 CLI 与业务分离的关键防线：业务层应可被任何代码 import 调用，
        不能有进程级副作用（sys.exit）或参数解析（argparse）。
        """
        html = CORE / "analysis" / "html.py"
        text = html.read_text(encoding="utf-8")
        forbidden = ["argparse", "sys.exit", "ap.parse_args", "def main("]
        for token in forbidden:
            with self.subTest(token=token):
                self.assertNotIn(
                    token,
                    text,
                    f"analysis/html.py 不应含 CLI 代码: '{token}'（应移至 cli/ 层）",
                )

    def test_bootstrap_exposes_canonical_modules(self):
        """_bootstrap.py 必须正确暴露规范包。"""
        bootstrap = COMPAT / "_bootstrap.py"
        self.assertTrue(bootstrap.is_file(), "src/skill/scripts/_bootstrap.py 缺失")
        text = bootstrap.read_text(encoding="utf-8")
        self.assertIn("def expose", text, "_bootstrap.py 必须定义 expose() 函数")
        self.assertIn("SOURCE_ROOT", text, "_bootstrap.py 必须定位 SOURCE_ROOT")

    def test_core_common_is_not_empty(self):
        """core/common.py 不能是空壳——它是 _common.py 的规范归宿。"""
        common = CORE / "core" / "common.py"
        text = common.read_text(encoding="utf-8")
        # 至少要有 100 行（原 _common.py 639 行，迁移后不应大幅缩水）
        line_count = len([line for line in text.splitlines() if line.strip()])
        self.assertGreater(
            line_count,
            100,
            f"core/common.py 行数过少（{line_count} 行），可能迁移不完整",
        )


if __name__ == "__main__":
    unittest.main()
