"""test_discover_js_arrays.py - 通用 JS 数组发现单元测试

覆盖：
- _discover_js_arrays：扫描任意命名的 JS 数组，按字段特征分类
- _classify_data_array：字段特征 -> 业务类型判定
- 回归：配置数组/纯值数组不误识别

运行：python3 scripts/tests/test_discover_js_arrays.py
"""

import os
import sys
import tempfile
import unittest

_SKILL_SCRIPTS = os.path.join(os.path.dirname(__file__), "..", "..", "src", "skill", "scripts")
sys.path.insert(0, os.path.abspath(_SKILL_SCRIPTS))

from analyze_html import HtmlAnalyzer  # noqa: E402


def _make_analyzer(body_html: str) -> HtmlAnalyzer:
    full = f"""<!doctype html><html><head><meta charset="utf-8">
<title>test</title><style>:root{{--primary:#6487FA;}}</style></head>
<body>{body_html}</body></html>"""
    fd, path = tempfile.mkstemp(suffix=".html")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(full)
    return HtmlAnalyzer(path)


class TestClassifyDataArray(unittest.TestCase):
    """_classify_data_array：字段特征 -> 业务类型。"""

    def test_members_with_role(self):
        self.assertEqual(
            HtmlAnalyzer.__new__(HtmlAnalyzer)._classify_data_array(
                {"name": "str", "role": "str", "img": "str"}), "members")

    def test_members_with_state(self):
        self.assertEqual(
            HtmlAnalyzer.__new__(HtmlAnalyzer)._classify_data_array(
                {"name": "str", "state": "str", "relations": "arr"}), "members")

    def test_works_with_year_no_role(self):
        self.assertEqual(
            HtmlAnalyzer.__new__(HtmlAnalyzer)._classify_data_array(
                {"title": "str", "year": "str", "img": "str"}), "works")

    def test_timeline_with_time(self):
        self.assertEqual(
            HtmlAnalyzer.__new__(HtmlAnalyzer)._classify_data_array(
                {"time": "str", "title": "str", "desc": "str"}), "timeline")

    def test_title_with_role_not_works(self):
        """有 role 不应判为 works（避免与 members 冲突）。"""
        # name+role 命中 members（优先）
        self.assertEqual(
            HtmlAnalyzer.__new__(HtmlAnalyzer)._classify_data_array(
                {"name": "str", "role": "str", "title": "str"}), "members")

    def test_unknown_fields_return_none(self):
        """纯配置数组不归类。"""
        self.assertIsNone(
            HtmlAnalyzer.__new__(HtmlAnalyzer)._classify_data_array(
                {"color": "str", "label": "str"}))

    def test_empty_fields_return_none(self):
        self.assertIsNone(
            HtmlAnalyzer.__new__(HtmlAnalyzer)._classify_data_array({}))


class TestDiscoverJsArrays(unittest.TestCase):
    """_discover_js_arrays：通用 JS 数组发现。"""

    def test_finds_groupMembers_named_array(self):
        """变量名不是 memberList 也能发现（核心目标）。"""
        html = '''<script>
        const groupMembers = [
          {key:"a",name:"A",role:"主唱",img:"a.jpg",relations:[]},
          {key:"b",name:"B",role:"领舞",img:"b.jpg",relations:[]}
        ];
        </script>'''
        a = _make_analyzer(html)
        out = a._discover_js_arrays()
        self.assertIn("members", out)
        self.assertEqual(len(out["members"]), 2)
        self.assertEqual(out["members"][0]["name"], "A")

    def test_finds_starList_named_array(self):
        """starList 命名也能发现。"""
        html = '''<script>
        var starList = [{name:"X",role:"Y",img:"x.jpg",relations:[]}];
        </script>'''
        a = _make_analyzer(html)
        out = a._discover_js_arrays()
        self.assertIn("members", out)

    def test_finds_works_and_timeline_too(self):
        """同时发现 works 和 timeline。"""
        html = '''<script>
        var starWorks = [{img:"a.jpg",year:"2016",title:"X",desc:"Y"}];
        var tl = [{time:"2016",title:"出道",desc:"test",img:"a.jpg"}];
        </script>'''
        a = _make_analyzer(html)
        out = a._discover_js_arrays()
        self.assertIn("works", out)
        self.assertIn("timeline", out)

    def test_ignores_config_arrays(self):
        """纯配置数组（无成员字段特征）不归类。"""
        html = '''<script>
        var COLORS = [{color:"#fff",label:"白"},{color:"#000",label:"黑"}];
        var labels = ["a","b","c"];
        </script>'''
        a = _make_analyzer(html)
        out = a._discover_js_arrays()
        self.assertNotIn("members", out)
        self.assertNotIn("works", out)
        self.assertNotIn("timeline", out)

    def test_no_scripts_returns_empty(self):
        """无 JS 时返回空 dict。"""
        a = _make_analyzer("<div>no script</div>")
        self.assertEqual(a._discover_js_arrays(), {})


class TestNoRegressionOnMemberList(unittest.TestCase):
    """回归：写死的 memberList 路径仍可用（向后兼容）。"""

    def test_member_list_still_extracted(self):
        html = '''<script>
        var memberList = [{key:"a",name:"A",role:"主唱",img:"a.jpg",relations:[]}];
        </script>'''
        a = _make_analyzer(html)
        # _extract_js_array（旧路径）仍能提取
        arr = a._extract_js_array("memberList", "members")
        self.assertIsNotNone(arr)
        self.assertEqual(arr[0]["name"], "A")
        # 通用发现也能发现
        out = a._discover_js_arrays()
        self.assertIn("members", out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
