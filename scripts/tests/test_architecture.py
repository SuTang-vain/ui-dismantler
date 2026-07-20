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
            "generation/__init__.py",
            "generation/showcase.py",
            "generation/adapt_output.py",
            "validation/__init__.py",
            "validation/library.py",
            "evaluation/__init__.py",
            "evaluation/scenario_coverage.py",
            "evaluation/scenario_generator.py",
            "evaluation/roundtrip.py",
            "evaluation/batch.py",
            "aggregation/__init__.py",
            "aggregation/vertical.py",
            "cli/__init__.py",
            "cli/analyze_html.py",
            "cli/validate_lib.py",
            "cli/generate_showcase.py",
            "cli/adapt_output.py",
            "cli/roundtrip.py",
            "cli/verify_all.py",
            "cli/generate_scenarios.py",
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
        """所有旧入口必须是薄桥接，不能内联业务逻辑。

        确保业务逻辑全部住在规范包里，旧入口只负责透出符号和转发 CLI 调用。
        每个桥接入口的预期映射：
        - analyze_html    → analysis.html + cli.analyze_html
        - view_detectors  → analysis.detectors
        - validate_lib    → validation.library + cli.validate_lib
        - generate_showcase → generation.showcase + cli.generate_showcase
        - adapt_output    → generation.adapt_output + cli.adapt_output
        """
        # 业务 + CLI 双桥接（旧入口含 if __name__ 转发）
        biz_cli_pairs = [
            ("analyze_html.py", "ui_dismantler.analysis.html", "ui_dismantler.cli.analyze_html"),
            ("validate_lib.py", "ui_dismantler.validation.library", "ui_dismantler.cli.validate_lib"),
            ("generate_showcase.py", "ui_dismantler.generation.showcase", "ui_dismantler.cli.generate_showcase"),
            ("adapt_output.py", "ui_dismantler.generation.adapt_output", "ui_dismantler.cli.adapt_output"),
        ]
        for name, biz_mod, cli_mod in biz_cli_pairs:
            path = COMPAT / name
            self.assertTrue(path.is_file(), f"src/skill/scripts/{name} 缺失")
            text = path.read_text(encoding="utf-8")
            with self.subTest(name=name):
                self.assertIn("from _bootstrap import expose", text, f"{name} 必须用 _bootstrap.expose 桥接")
                self.assertIn(f'expose("{biz_mod}"', text, f"{name} 必须桥接到 {biz_mod}")
                self.assertIn(f'expose("{cli_mod}"', text, f"{name} 必须桥接到 {cli_mod}")
                # 桥接入口不应含 argparse（CLI 应在 cli/ 层）
                self.assertNotIn("argparse", text, f"{name} 桥接不应含 argparse")

        # 纯业务桥接（无 CLI，只透出符号）
        detectors_compat = COMPAT / "view_detectors.py"
        self.assertTrue(detectors_compat.is_file(), "src/skill/scripts/view_detectors.py 缺失")
        detectors_text = detectors_compat.read_text(encoding="utf-8")
        with self.subTest(name="view_detectors.py"):
            self.assertIn("from _bootstrap import expose", detectors_text)
            self.assertIn('expose("ui_dismantler.analysis.detectors"', detectors_text)

    def test_business_modules_have_no_cli_code(self):
        """所有业务逻辑层模块不能含 CLI 代码（argparse / sys.exit / def main）。

        这是 CLI 与业务分离的关键防线：业务层应可被任何代码 import 调用，
        不能有进程级副作用（sys.exit）或参数解析（argparse）。
        覆盖 core/ + analysis/ + generation/ + validation/ + evaluation/ 下所有 .py。
        """
        business_dirs = ["core", "analysis", "generation", "validation", "evaluation", "aggregation"]
        forbidden = ["argparse", "sys.exit", "ap.parse_args", "def main("]
        found_any = False
        for subdir in business_dirs:
            biz_dir = CORE / subdir
            if not biz_dir.is_dir():
                continue
            for path in biz_dir.rglob("*.py"):
                text = path.read_text(encoding="utf-8")
                for token in forbidden:
                    if token in text:
                        found_any = True
                        with self.subTest(path=path.relative_to(ROOT), token=token):
                            self.fail(
                                f"{path.relative_to(ROOT)} 不应含 CLI 代码: '{token}'"
                                f"（应移至 cli/ 层）"
                            )
        # 即使没有业务文件（极端情况），也要确认扫描执行过
        if not found_any:
            self.assertTrue(True, "业务层扫描完成，未发现 CLI 代码")

    def test_bootstrap_exposes_canonical_modules(self):
        """_bootstrap.py 必须正确暴露规范包。"""
        bootstrap = COMPAT / "_bootstrap.py"
        self.assertTrue(bootstrap.is_file(), "src/skill/scripts/_bootstrap.py 缺失")
        text = bootstrap.read_text(encoding="utf-8")
        self.assertIn("def expose", text, "_bootstrap.py 必须定义 expose() 函数")
        self.assertIn("SOURCE_ROOT", text, "_bootstrap.py 必须定位 SOURCE_ROOT")

    def test_legacy_scripts_entry_points_are_thin_wrappers(self):
        """scripts/ 下的旧入口（roundtrip/verify_all/scenario_coverage/generate_scenarios）
        必须是薄桥接，桥接到 ui_dismantler.evaluation + cli。

        与 src/skill/scripts/ 的桥接是对称设计——两个旧入口目录都不能内联业务逻辑。
        """
        SCRIPTS_COMPAT = ROOT / "scripts"
        # 业务 + CLI 双桥接（旧入口含 if __name__ 转发）
        scripts_biz_cli_pairs = [
            ("roundtrip.py", "ui_dismantler.evaluation.roundtrip", "ui_dismantler.cli.roundtrip"),
            ("verify_all.py", "ui_dismantler.evaluation.batch", "ui_dismantler.cli.verify_all"),
            ("generate_scenarios.py", "ui_dismantler.evaluation.scenario_generator", "ui_dismantler.cli.generate_scenarios"),
        ]
        for name, biz_mod, cli_mod in scripts_biz_cli_pairs:
            path = SCRIPTS_COMPAT / name
            self.assertTrue(path.is_file(), f"scripts/{name} 缺失")
            text = path.read_text(encoding="utf-8")
            with self.subTest(name=f"scripts/{name}"):
                self.assertIn("from _bootstrap import expose", text, f"scripts/{name} 必须用 _bootstrap.expose 桥接")
                self.assertIn(f'expose("{biz_mod}"', text, f"scripts/{name} 必须桥接到 {biz_mod}")
                self.assertIn(f'expose("{cli_mod}"', text, f"scripts/{name} 必须桥接到 {cli_mod}")
                self.assertNotIn("argparse", text, f"scripts/{name} 桥接不应含 argparse")

        # 纯业务桥接（scenario_coverage 无 CLI，只透出符号）
        sc_compat = SCRIPTS_COMPAT / "scenario_coverage.py"
        self.assertTrue(sc_compat.is_file(), "scripts/scenario_coverage.py 缺失")
        sc_text = sc_compat.read_text(encoding="utf-8")
        with self.subTest(name="scripts/scenario_coverage.py"):
            self.assertIn("from _bootstrap import expose", sc_text)
            self.assertIn('expose("ui_dismantler.evaluation.scenario_coverage"', sc_text)

        # scripts/ 必须有自己的 _bootstrap.py
        scripts_bootstrap = SCRIPTS_COMPAT / "_bootstrap.py"
        self.assertTrue(scripts_bootstrap.is_file(), "scripts/_bootstrap.py 缺失")
        sb_text = scripts_bootstrap.read_text(encoding="utf-8")
        self.assertIn("def expose", sb_text, "scripts/_bootstrap.py 必须定义 expose()")

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
