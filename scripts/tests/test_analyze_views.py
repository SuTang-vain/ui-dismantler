"""test_analyze_views.py - analyze_html.py 视图分类单元测试

覆盖：
- _classify_view 新增视图类型：quiz / comparison / splash
- _extract_view_details 对应字段提取
- _classify_modal_layout 的 comparison（whatif 形态）
- 回归：已有类型（member-grid/timeline/carousel-3d/detail-panel）不误判

运行：python3 scripts/tests/test_analyze_views.py
"""

import os
import sys
import tempfile
import unittest

# 让脚本能 import src/skill/scripts/analyze_html.py
_SKILL_SCRIPTS = os.path.join(os.path.dirname(__file__), "..", "..", "src", "skill", "scripts")
sys.path.insert(0, os.path.abspath(_SKILL_SCRIPTS))

from analyze_html import HtmlAnalyzer  # noqa: E402


def _make_analyzer(body_html: str, css: str = "") -> HtmlAnalyzer:
    """构造一个最小 HTML 文件并返回 HtmlAnalyzer 实例。"""
    full = f"""<!doctype html><html><head><meta charset="utf-8">
<title>test</title><style>{css}</style></head>
<body>{body_html}</body></html>"""
    fd, path = tempfile.mkstemp(suffix=".html")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(full)
    return HtmlAnalyzer(path)


class TestClassifyViewNewTypes(unittest.TestCase):
    """_classify_view 对新视图类型的识别。"""

    def test_quiz_recognized_by_qz_prefix(self):
        html = '<section class="panel" id="quiz"><div class="qz-top"></div><div class="qz-body"><div class="qt">题干</div><div class="opts"></div></div><div class="qz-next"></div><div class="qz-result"></div></section>'
        a = _make_analyzer(html)
        node = a.soup.find(id="quiz")
        self.assertEqual(a._classify_view(node), "quiz")

    def test_quiz_recognized_by_opt_and_qt(self):
        html = '<section class="panel" id="quiz"><div class="q-title">题</div><div class="opt" data-k="1"></div></section>'
        a = _make_analyzer(html)
        node = a.soup.find(id="quiz")
        self.assertEqual(a._classify_view(node), "quiz")

    def test_comparison_recognized_by_whatif(self):
        html = '<section class="panel" id="cmp"><div class="whatif-card real">史实</div><div class="whatif-card alt">如果没发生</div></section>'
        a = _make_analyzer(html)
        node = a.soup.find(id="cmp")
        self.assertEqual(a._classify_view(node), "comparison")

    def test_comparison_recognized_by_cmp_btn(self):
        html = '<section class="panel" id="cmp"><button class="cmp-btn k1">维度1</button><button class="cmp-btn k2">维度2</button></section>'
        a = _make_analyzer(html)
        node = a.soup.find(id="cmp")
        self.assertEqual(a._classify_view(node), "comparison")

    def test_splash_recognized_by_cta_and_options(self):
        html = '<section class="panel" id="splash"><div class="splash-cta">开始解锁</div><div class="splash-opt" data-v="1">选项</div></section>'
        a = _make_analyzer(html)
        node = a.soup.find(id="splash")
        self.assertEqual(a._classify_view(node), "splash")


class TestExtractViewDetails(unittest.TestCase):
    """新视图类型的字段提取。"""

    def test_quiz_fields(self):
        html = '''<section class="panel" id="quiz">
          <div class="qz-top"><div class="bar"></div></div>
          <div class="qz-body">
            <div class="qt">题干1</div><div class="opts"><div class="opt" data-k="0">A</div></div>
            <div class="qz-fb">反馈</div>
          </div>
          <div class="qz-next">下一题</div>
          <div class="qz-result">结果</div>
        </section>'''
        a = _make_analyzer(html)
        node = a.soup.find(id="quiz")
        details = a._extract_view_details(node, "quiz")
        self.assertGreaterEqual(details["questionCount"], 1)
        self.assertTrue(details["hasFeedback"])
        self.assertTrue(details["hasResult"])
        self.assertTrue(details["hasProgressBar"])
        self.assertEqual(details["optionsSelector"], ".opt")

    def test_comparison_fields_whatif(self):
        html = '<section class="panel" id="cmp"><div class="whatif-card real">史实A</div><div class="whatif-card alt">如果B</div></section>'
        a = _make_analyzer(html)
        node = a.soup.find(id="cmp")
        details = a._extract_view_details(node, "comparison")
        sides = [c["side"] for c in details["columns"]]
        self.assertIn("real", sides)
        self.assertIn("alt", sides)

    def test_splash_fields(self):
        html = '<section class="panel" id="splash"><div class="splash-question">问题</div><div class="splash-cta">开始</div><div class="splash-opt" data-v="1">x</div></section>'
        a = _make_analyzer(html)
        node = a.soup.find(id="splash")
        details = a._extract_view_details(node, "splash")
        self.assertTrue(details["hasQuestion"])
        self.assertTrue(details["hasOptions"])
        self.assertEqual(details["ctaSelector"], ".splash-cta")
        self.assertIn("开始", details["ctaText"])


class TestClassifyModalLayoutComparison(unittest.TestCase):
    """_classify_modal_layout 对 whatif 形态的 comparison 识别。"""

    def test_whatif_modal_is_comparison(self):
        html = '<div class="modal-overlay" id="whatifOverlay"><div class="whatif-modal"><div class="whatif-card real">史实</div><div class="whatif-card alt">如果</div></div></div>'
        a = _make_analyzer(html)
        node = a.soup.find(id="whatifOverlay")
        self.assertEqual(a._classify_modal_layout(node, "modal-overlay"), "comparison")


class TestNoRegressionOnExistingTypes(unittest.TestCase):
    """回归：已有视图类型不被新分支误判。"""

    def test_member_grid_not_misclassified(self):
        html = '<section class="panel" id="m"><div class="member-grid"><div class="member"><img></div></div></section>'
        a = _make_analyzer(html)
        node = a.soup.find(id="m")
        self.assertEqual(a._classify_view(node), "member-grid")

    def test_timeline_not_misclassified(self):
        html = '<section class="panel" id="t"><div class="timeline"><div class="tl-item"><time>2016</time></div></div></section>'
        a = _make_analyzer(html)
        node = a.soup.find(id="t")
        self.assertEqual(a._classify_view(node), "timeline")

    def test_detail_panel_not_misclassified(self):
        html = '<section class="panel" id="d" aria-live="polite"><div class="detail-panel"></div></section>'
        a = _make_analyzer(html)
        node = a.soup.find(id="d")
        self.assertEqual(a._classify_view(node), "detail-panel")

    def test_truly_unknown_still_generic(self):
        """完全陌生的结构仍兜底 generic。"""
        html = '<section class="panel" id="x"><div class="unknown-widget"><p>hello</p></div></section>'
        a = _make_analyzer(html)
        node = a.soup.find(id="x")
        self.assertEqual(a._classify_view(node), "generic")


if __name__ == "__main__":
    unittest.main(verbosity=2)
