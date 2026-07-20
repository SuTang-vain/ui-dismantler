"""test_roundtrip.py — roundtrip.py 对比器单元测试 + 黄金快照

覆盖：
- compare_structure：结构对比器（贪心匹配 / sg- 重命名容错 / unwrap 容器 / 缺视图 / 渲染失败）
- compare_texts：文本对比器（精确 / 包含 / missing / 渲染失败）
- _is_dev_noise：开发注释识别
- _count：递归节点计数
- 黄金快照：benchmark/lib 端到端 roundtrip（防止评分核心漂移）

运行：python3 scripts/tests/test_roundtrip.py
"""

import os
import sys
import unittest

# 让脚本能直接 import scripts/roundtrip.py
_SCRIPTS = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.abspath(_SCRIPTS))

import roundtrip as rt  # noqa: E402


# ============================================================
# compare_structure：结构对比器
# ============================================================
class TestCompareStructure(unittest.TestCase):
    """compare_structure(ref, got) 接受两棵 {tag,classes,children?,text?} 树。

    ref 形如 {"dom": <tree>, ...}，got 形如 {"ok": True, "dom": <tree>, ...}。
    """

    def _wrap(self, tree):
        return {"dom": tree}

    def _got(self, tree):
        return {"ok": True, "dom": tree}

    def test_identical_trees_full_match(self):
        """完全相同的树 → node_match_rate=1.0，class_match_rate=1.0。"""
        tree = {"tag": "div", "classes": ["card"],
                "children": [{"tag": "span", "classes": ["title"], "text": "hello"}]}
        r = self._wrap(tree)
        g = self._got(tree)
        s = rt.compare_structure(r, g)
        self.assertEqual(s["node_match_rate"], 1.0)
        self.assertEqual(s["class_match_rate"], 1.0)
        self.assertEqual(s["matched_nodes"], s["ref_nodes"])

    def test_sg_prefix_rename_tolerance(self):
        """pc-card-frame 与 sg-frame 应通过后缀容错匹配（重命名不扣分）。"""
        ref = {"tag": "main", "classes": ["pc-card-frame"],
               "children": [{"tag": "div", "classes": ["pc-card-title"], "text": "X"}]}
        got = {"tag": "main", "classes": ["sg-frame"],
               "children": [{"tag": "div", "classes": ["sg-title"], "text": "X"}]}
        s = rt.compare_structure(self._wrap(ref), self._got(got))
        # tag 相同 → matched/ref = 1.0
        self.assertEqual(s["node_match_rate"], 1.0)
        # class 相似度应 > 0.5（后缀容错生效）
        self.assertGreater(s["class_match_rate"], 0.5)

    def test_missing_view_lowers_node_match(self):
        """got 缺一个子视图 → matched < ref_nodes，node_match_rate < 1。"""
        ref = {"tag": "div", "classes": ["root"],
               "children": [
                   {"tag": "section", "classes": ["a"], "text": "A"},
                   {"tag": "section", "classes": ["b"], "text": "B"},
               ]}
        got = {"tag": "div", "classes": ["root"],
               "children": [
                   {"tag": "section", "classes": ["a"], "text": "A"},
               ]}
        s = rt.compare_structure(self._wrap(ref), self._got(got))
        self.assertLess(s["node_match_rate"], 1.0)
        # 缺的 B 子树（1 节点）仍计入 ref_nodes，matched 少 1
        self.assertLess(s["matched_nodes"], s["ref_nodes"])

    def test_unwrap_containerless_wrapper(self):
        """无 class 的 body/div 包裹层应被 unwrap，让 main 层直接对齐。"""
        ref = {"tag": "body", "classes": [],
               "children": [{"tag": "main", "classes": ["frame"], "text": "X"}]}
        got = {"tag": "div", "classes": [],
               "children": [{"tag": "main", "classes": ["sg-frame"], "text": "X"}]}
        s = rt.compare_structure(self._wrap(ref), self._got(got))
        # 对齐发生在 main 层，body/div 不计为不匹配
        self.assertEqual(s["node_match_rate"], 1.0)

    def test_both_no_class_returns_neutral(self):
        """两侧都无 class 的容器 → class_similarity 中性 0.3，不压过有 class 节点。"""
        ref = {"tag": "div", "classes": [],
               "children": [{"tag": "span", "classes": [], "text": "x"}]}
        got = {"tag": "div", "classes": [],
               "children": [{"tag": "span", "classes": [], "text": "x"}]}
        s = rt.compare_structure(self._wrap(ref), self._got(got))
        # ref_classes=0 → cls_rate 默认 1.0（无 class 节点不参与 class 评分）
        self.assertEqual(s["class_match_rate"], 1.0)

    def test_render_failure_returns_zero(self):
        """got 渲染失败 → 结构分全 0。"""
        r = self._wrap({"tag": "div", "classes": ["a"]})
        g = {"ok": False, "error": "jsdom 超时"}
        s = rt.compare_structure(r, g)
        self.assertEqual(s["node_match_rate"], 0.0)
        self.assertEqual(s["class_match_rate"], 0.0)
        self.assertIn("error", s)

    def test_empty_got_dom(self):
        """got.dom 为空 -> 结构分 0。"""
        r = self._wrap({"tag": "div", "classes": ["a"]})
        g = {"ok": True, "dom": None}
        s = rt.compare_structure(r, g)
        self.assertEqual(s["node_match_rate"], 0.0)

    def test_redundant_got_nodes_penalized(self):
        """got 比 ref 多超过 1.5 倍 -> recall 被冗余惩罚折扣（防刷分）。

        ref 2 节点，got 10 节点（2 真实匹配 + 8 噪音），recall=1.0 但应被罚。
        """
        ref = {"tag": "div", "classes": ["root"],
               "children": [{"tag": "span", "classes": ["title"], "text": "A"}]}
        noise = [{"tag": "div", "classes": ["noise"]} for _ in range(8)]
        got = {"tag": "div", "classes": ["root"],
               "children": [{"tag": "span", "classes": ["title"], "text": "A"}] + noise}
        s = rt.compare_structure(self._wrap(ref), self._got(got))
        # recall 本该 1.0（ref 全匹配），但冗余惩罚后 node_match_rate < 1.0
        self.assertEqual(s["node_recall"], 1.0)  # 原始召回满
        self.assertLess(s["node_match_rate"], 1.0)  # 惩罚生效
        self.assertGreater(s["redundancy_penalty"], 0.0)
        self.assertLess(s["node_precision"], 0.5)  # precision 低（噪音多）

    def test_redundancy_within_tolerance_not_penalized(self):
        """got ≤ ref×1.5 在宽容带内 -> 不罚（数据驱动合理膨胀）。

        ref 2 节点，got 3 节点（1.5 倍，刚好在容忍线上）。
        """
        ref = {"tag": "div", "classes": ["root"],
               "children": [{"tag": "span", "classes": ["title"], "text": "A"}]}
        got = {"tag": "div", "classes": ["root"],
               "children": [{"tag": "span", "classes": ["title"], "text": "A"},
                            {"tag": "div", "classes": ["extra"]}]}  # got=3, ref*1.5=3, 不罚
        s = rt.compare_structure(self._wrap(ref), self._got(got))
        self.assertEqual(s["redundancy_penalty"], 0.0)
        self.assertEqual(s["node_match_rate"], s["node_recall"])  # 无惩罚


# ============================================================
# compare_texts：文本对比器
# ============================================================
class TestCompareTexts(unittest.TestCase):
    def _ref(self, texts):
        return {"texts": texts}

    def _got(self, texts):
        return {"ok": True, "texts": texts}

    def test_exact_match(self):
        """文本集合完全重合 → rate=1.0。"""
        t = ["JISOO", "JENNIE", "ROSÉ", "LISA"]
        r = rt.compare_texts(self._ref(t), self._got(t))
        self.assertEqual(r["text_match_rate"], 1.0)
        self.assertEqual(r["exact_match"], 4)
        self.assertEqual(r["contain_match"], 0)
        self.assertEqual(r["missing"], [])

    def test_contain_match(self):
        """ref 文本被某个 got 文本包含 → 算 contain 匹配。"""
        ref = ["主唱"]
        got = ["主唱 · 说唱 · 视觉"]
        r = rt.compare_texts(self._ref(ref), self._got(got))
        self.assertEqual(r["exact_match"], 0)
        self.assertEqual(r["contain_match"], 1)
        self.assertEqual(r["text_match_rate"], 1.0)

    def test_missing_list(self):
        """缺失文本进 missing 列表（最多 10 条）。"""
        ref = ["A", "B", "C"]
        got = ["A"]
        r = rt.compare_texts(self._ref(ref), self._got(got))
        self.assertAlmostEqual(r["text_match_rate"], 1 / 3, places=3)
        self.assertIn("B", r["missing"])
        self.assertIn("C", r["missing"])

    def test_render_failure_returns_zero(self):
        """got 渲染失败 → 文本分 0。"""
        r = rt.compare_texts(self._ref(["A"]), {"ok": False, "error": "x"})
        self.assertEqual(r["text_match_rate"], 0.0)

    def test_empty_ref_with_empty_got(self):
        """两侧都空 → 1.0（无文本可对比）。"""
        r = rt.compare_texts(self._ref([]), self._got([]))
        self.assertEqual(r["text_match_rate"], 1.0)

    def test_empty_ref_with_got_content(self):
        """ref 空 got 非空 -> 0.0（got 有噪音文本）。"""
        r = rt.compare_texts(self._ref([]), self._got(["噪音"]))
        self.assertEqual(r["text_match_rate"], 0.0)

    def test_precision_and_extra_fields(self):
        """got 有 ref 没有的文本 -> text_precision < 1 + extra 列表记录噪音（不惩罚主分）。"""
        ref = ["JISOO", "主唱"]
        got = ["JISOO", "主唱", "DEBUG_FLAG", "占位文本"]  # 2 精确 + 2 噪音
        r = rt.compare_texts(self._ref(ref), self._got(got))
        self.assertEqual(r["text_match_rate"], 1.0)  # recall 不受噪音影响（主分不罚）
        self.assertLess(r["text_precision"], 1.0)   # precision 反映噪音
        self.assertIn("DEBUG_FLAG", r["extra"])
        self.assertIn("占位文本", r["extra"])


# ============================================================
# _is_dev_noise：开发注释识别
# ============================================================
class TestIsDevNoise(unittest.TestCase):
    def test_recognizes_js_dynamic_marker(self):
        self.assertTrue(rt._is_dev_noise("JS 动态填充成员卡片"))
        self.assertTrue(rt._is_dev_noise("这里JS动态渲染"))

    def test_recognizes_data_source_marker(self):
        self.assertTrue(rt._is_dev_noise("数据源：成员列表"))

    def test_recognizes_modal_overlay_marker(self):
        self.assertTrue(rt._is_dev_noise("Modal overlay: 全屏遮罩"))

    def test_real_content_not_noise(self):
        self.assertFalse(rt._is_dev_noise("JISOO"))
        self.assertFalse(rt._is_dev_noise("主唱 · 说唱 · 视觉"))
        self.assertFalse(rt._is_dev_noise("2016年8月8日出道"))


# ============================================================
# _count：递归节点计数
# ============================================================
class TestCount(unittest.TestCase):
    def test_single_node(self):
        self.assertEqual(rt._count({"tag": "div"}), 1)

    def test_with_children(self):
        tree = {"tag": "div", "children": [
            {"tag": "span"},
            {"tag": "p", "children": [{"tag": "b"}]},
        ]}
        self.assertEqual(rt._count(tree), 4)  # div + span + p + b

    def test_empty_children(self):
        self.assertEqual(rt._count({"tag": "div", "children": []}), 1)


# ============================================================
# 黄金快照：benchmark/lib 双口径端到端 roundtrip
# static 维持历史连续性；rendered 验证运行态真实内容。
# ============================================================
class TestGoldenSnapshotBenchmark(unittest.TestCase):
    """对 benchmark 组件库分别运行静态与运行态参照。"""

    REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    HTML = os.path.join(REPO, "benchmark", "original.html")
    LIB = os.path.join(REPO, "benchmark", "lib")

    def _run(self, reference_mode):
        # 跳过条件：fixture 不存在则跳过（不报失败，避免环境缺失误报）
        if not (os.path.isfile(self.HTML) and os.path.isdir(self.LIB)):
            self.skipTest(f"fixture 缺失: {self.HTML} 或 {self.LIB}")
        import json
        import subprocess

        proc = subprocess.run(
            [sys.executable, os.path.join(self.REPO, "scripts", "roundtrip.py"),
             self.HTML, "--lib", self.LIB, "--reference-mode", reference_mode],
            capture_output=True, text=True, timeout=60,
            cwd=self.REPO,
        )
        self.assertEqual(proc.returncode, 0,
                         f"roundtrip 失败: {proc.stderr[:300]}")
        return json.loads(proc.stdout)

    def test_static_baseline_remains_stable(self):
        report = self._run("static")
        self.assertEqual(report["reference"]["mode"], "static")
        self.assertFalse(report["reference"]["fallback"])
        self.assertGreaterEqual(report["scores"]["overall"], 0.80)
        self.assertGreaterEqual(report["scores"]["structure"], 0.90)

    def test_rendered_baseline_uses_runtime_reference(self):
        report = self._run("rendered")
        self.assertEqual(report["reference"]["mode"], "reference")
        self.assertFalse(report["reference"]["fallback"])
        self.assertEqual(report["reference"]["runtime_errors"], [])
        self.assertGreaterEqual(report["scores"]["overall"], 0.95)
        self.assertGreaterEqual(report["scores"]["structure"], 0.95)
        self.assertGreaterEqual(report["scores"]["text"], 0.95)


if __name__ == "__main__":
    unittest.main(verbosity=2)
