"""test_causal_detectors.py — cause-chain / nav-panel / graph detector 单元测试

直接测 ``ui_dismantler.analysis.detectors.default_view_detector_registry().detect()``，
不经过 HtmlAnalyzer，更轻量。用 BeautifulSoup 构造 DOM 节点 + 模拟 scripts。

覆盖：
- cause-chain: timeline-nav + causeChain/whatIf 信号 → 命中
- nav-panel: nav + >=2 triggers + >=2 panels → 命中
- graph: svg + node 类名 + NODES JS → 命中
- 边界: 缺少关键信号 → 不命中（避免误判）
- 回归: 已有类型（timeline/member-grid）不被新 detector 误判
"""

import os
import sys
import unittest

_SRC = os.path.join(os.path.dirname(__file__), "..", "..", "src")
sys.path.insert(0, os.path.abspath(_SRC))

from bs4 import BeautifulSoup  # noqa: E402

from ui_dismantler.analysis.detectors import default_view_detector_registry  # noqa: E402


REGISTRY = default_view_detector_registry()


def _node(html: str):
    """从 HTML 片段构造 BeautifulSoup 节点（取 body 的第一个子节点）。"""
    soup = BeautifulSoup(f"<html><body>{html}</body></html>", "html.parser")
    return soup.body


def _detect(html: str, css: str = "", scripts: tuple[str, ...] = ()):
    """便捷封装：构造节点并跑 registry.detect。"""
    return REGISTRY.detect(_node(html), css, scripts)


class TestCauseChainDetector(unittest.TestCase):
    """cause-chain: timeline-nav + 因果链数据/whatif。"""

    def test_timeline_nav_plus_cause_chain_class_hits(self):
        """timeline-nav + .cause-chain 类名 → 命中 cause-chain。"""
        result = _detect(
            '<div class="timeline-nav">nav</div><div class="cause-chain">链</div>',
        )
        self.assertIsNotNone(result)
        self.assertEqual(result.semantic_type, "cause-chain")
        self.assertEqual(result.structural_type, "sequence")
        self.assertIn("class:timeline-nav", result.evidence)
        self.assertIn("data:causeChain", result.evidence)

    def test_timeline_nav_plus_cause_chain_js_hits(self):
        """timeline-nav + JS 含 causeChain → 命中。"""
        result = _detect(
            '<div class="timeline-nav">nav</div>',
            scripts=("var causeChain = [{cause:'a', effect:'b'}];",),
        )
        self.assertIsNotNone(result)
        self.assertEqual(result.semantic_type, "cause-chain")

    def test_timeline_nav_plus_whatif_hits(self):
        """timeline-nav + whatif 信号 → 命中（无 causeChain 也能命中）。"""
        result = _detect(
            '<div class="timeline-nav">nav</div><button class="whatif-btn">假设</button>',
        )
        self.assertIsNotNone(result)
        self.assertEqual(result.semantic_type, "cause-chain")
        self.assertIn("signal:whatif", result.evidence)

    def test_both_cause_chain_and_whatif_gets_higher_confidence(self):
        """同时有 causeChain + whatif → confidence 0.95。"""
        result = _detect(
            '<div class="timeline-nav">nav</div><div class="cause-chain"></div>'
            '<button class="whatif-btn">假设</button>',
        )
        self.assertIsNotNone(result)
        self.assertEqual(result.semantic_type, "cause-chain")
        self.assertAlmostEqual(result.confidence, 0.95, places=2)

    def test_timeline_nav_alone_does_not_hit_cause_chain(self):
        """只有 timeline-nav、无因果链信号 → 不命中 cause-chain（可能命中 timeline）。"""
        result = _detect('<div class="timeline-nav">nav</div>')
        if result is not None:
            # 不应误判为 cause-chain
            self.assertNotEqual(result.semantic_type, "cause-chain")

    def test_cause_chain_without_timeline_nav_does_not_hit(self):
        """有 cause-chain 但无 timeline-nav → 不命中 cause-chain。"""
        result = _detect('<div class="cause-chain">链</div>')
        if result is not None:
            self.assertNotEqual(result.semantic_type, "cause-chain")


class TestNavPanelDetector(unittest.TestCase):
    """nav-panel: nav + >=2 triggers + >=2 panels。"""

    def test_nav_with_two_triggers_and_two_panels_hits(self):
        """nav 含 2 个 data-p + 2 个 .panel → 命中 nav-panel。"""
        html = (
            '<nav><button data-p="p1">T1</button><button data-p="p2">T2</button></nav>'
            '<div class="panel" id="p1">P1</div><div class="panel" id="p2">P2</div>'
        )
        result = _detect(html)
        self.assertIsNotNone(result)
        self.assertEqual(result.semantic_type, "nav-panel")
        self.assertEqual(result.structural_type, "content-region")
        self.assertIn("nav-triggers:2", result.evidence)
        self.assertIn("panels:2", result.evidence)

    def test_nav_with_data_tab_triggers_also_hits(self):
        """nav 含 2 个 data-tab（非 data-p）→ 也命中。"""
        html = (
            '<nav><a data-tab="t1">T1</a><a data-tab="t2">T2</a></nav>'
            '<div class="tab-panel">P1</div><div class="tab-panel">P2</div>'
        )
        result = _detect(html)
        self.assertIsNotNone(result)
        self.assertEqual(result.semantic_type, "nav-panel")

    def test_nav_with_only_one_trigger_does_not_hit(self):
        """只有 1 个触发器 → 不命中（需 >=2）。"""
        html = (
            '<nav><button data-p="p1">T1</button></nav>'
            '<div class="panel">P1</div><div class="panel">P2</div>'
        )
        result = _detect(html)
        if result is not None:
            self.assertNotEqual(result.semantic_type, "nav-panel")

    def test_nav_with_only_one_panel_does_not_hit(self):
        """只有 1 个面板 → 不命中（需 >=2）。"""
        html = (
            '<nav><button data-p="p1">T1</button><button data-p="p2">T2</button></nav>'
            '<div class="panel">P1</div>'
        )
        result = _detect(html)
        if result is not None:
            self.assertNotEqual(result.semantic_type, "nav-panel")

    def test_no_nav_element_does_not_hit(self):
        """无 nav 元素 → 不命中。"""
        html = '<div><button data-p="p1">T1</button><button data-p="p2">T2</button></div>'
        result = _detect(html)
        if result is not None:
            self.assertNotEqual(result.semantic_type, "nav-panel")


class TestGraphDetector(unittest.TestCase):
    """graph: svg + node 类名 + NODES JS。"""

    def test_svg_plus_node_class_plus_nodes_js_hits(self):
        """svg + .node 类名 + JS 含 NODES → 命中 graph。"""
        html = '<svg><line x1="0" y1="0" x2="10" y2="10"/></svg><div class="node">A</div>'
        result = _detect(html, scripts=("const NODES = [{id:1}];",))
        self.assertIsNotNone(result)
        self.assertEqual(result.semantic_type, "graph")
        self.assertEqual(result.structural_type, "collection")
        self.assertIn("element:svg", result.evidence)
        self.assertIn("class:graph-node", result.evidence)
        self.assertIn("data:NODES", result.evidence)

    def test_svg_plus_gnd_class_plus_nodes_js_hits(self):
        """svg + .gnd 类名 + NODES → 也命中（gnd 是 node 的变体）。"""
        html = '<svg></svg><div class="gnd">A</div>'
        result = _detect(html, scripts=("var NODES=[];",))
        self.assertIsNotNone(result)
        self.assertEqual(result.semantic_type, "graph")

    def test_svg_without_node_class_does_not_hit(self):
        """svg 但无 node/gnd/graph 类名 → 不命中。"""
        html = '<svg></svg><div class="box">A</div>'
        result = _detect(html, scripts=("var NODES=[];",))
        if result is not None:
            self.assertNotEqual(result.semantic_type, "graph")

    def test_node_class_without_svg_does_not_hit(self):
        """有 .node 但无 svg → 不命中。"""
        html = '<div class="node">A</div>'
        result = _detect(html, scripts=("var NODES=[];",))
        if result is not None:
            self.assertNotEqual(result.semantic_type, "graph")

    def test_svg_and_node_without_nodes_js_does_not_hit(self):
        """svg + .node 但 JS 无 NODES → 不命中。"""
        html = '<svg></svg><div class="node">A</div>'
        result = _detect(html, scripts=("var data=[];",))
        if result is not None:
            self.assertNotEqual(result.semantic_type, "graph")


class TestNoRegressionOnExistingTypes(unittest.TestCase):
    """新 detector 不应误判已有类型。"""

    def test_timeline_still_recognized(self):
        """纯 timeline（无 timeline-nav/causeChain）仍命中 timeline，不被 cause-chain 抢。"""
        result = _detect('<div class="timeline"><div class="tl-item">事件</div></div>')
        self.assertIsNotNone(result)
        self.assertEqual(result.semantic_type, "timeline")

    def test_member_grid_still_recognized(self):
        """member-grid 不被新 detector 误判。"""
        result = _detect('<div class="member-grid"><div class="member">成员</div></div>')
        self.assertIsNotNone(result)
        self.assertEqual(result.semantic_type, "member-grid")

    def test_quiz_still_recognized(self):
        """quiz 不被新 detector 误判。"""
        result = _detect('<div class="qz-body"><div class="opt">选项</div></div>')
        self.assertIsNotNone(result)
        self.assertEqual(result.semantic_type, "quiz")


class TestViewContextScriptsField(unittest.TestCase):
    """ViewContext.scripts 字段向后兼容性。"""

    def test_default_scripts_is_empty_tuple(self):
        """不传 scripts 时默认为空 tuple（旧调用方兼容）。"""
        from ui_dismantler.analysis.detectors import ViewContext
        ctx = ViewContext(node=None, html="", css="")
        self.assertEqual(ctx.scripts, ())

    def test_registry_detect_without_scripts_arg_works(self):
        """registry.detect 不传 scripts 参数仍工作（向后兼容）。"""
        result = REGISTRY.detect(_node('<div class="timeline">x</div>'), "")
        self.assertIsNotNone(result)
        self.assertEqual(result.semantic_type, "timeline")


if __name__ == "__main__":
    unittest.main(verbosity=2)
