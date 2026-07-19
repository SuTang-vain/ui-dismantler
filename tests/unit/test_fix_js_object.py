"""test_fix_js_object.py — analyze_html.py._fix_js_object 单元测试

覆盖 JS 对象字面量 → JSON 转换的边界：
- 单引号字符串 → 双引号
- 模板字符串（反引号）→ 双引号 JSON 字符串
- 裸 key 加引号
- URL 中的冒号不误判为 key
- true/false/null 字面量
- 尾逗号去除
- 嵌套对象/数组
- 字符串内的引号转义
- 注释跳过

运行：python3 tests/unit/test_fix_js_object.py
"""

import json
import os
from pathlib import Path
import sys
import unittest

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "src"))

# _fix_js_object 是 HtmlAnalyzer 的方法，但它无状态、不依赖 self
# 直接实例化一个最小 HTML 的 analyzer 来拿到可调用方法
from ui_dismantler.analysis.html import HtmlAnalyzer  # noqa: E402

import tempfile  # noqa: E402


def _make_fixer():
    """造一个临时 HTML 文件初始化 analyzer，仅用于拿到 _fix_js_object 方法。"""
    with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w", encoding="utf-8") as f:
        f.write("<!DOCTYPE html><html><body></body></html>")
        path = f.name
    try:
        a = HtmlAnalyzer(path)
        return a._fix_js_object
    finally:
        os.unlink(path)


class TestFixJsObject(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fix = _make_fixer()

    def _parse(self, js_text):
        """fix 后应能被 json.loads 解析，返回解析结果。"""
        fixed = self.fix(js_text)
        return json.loads(fixed)

    # ---------- 单引号字符串 ----------
    def test_single_quotes(self):
        out = self._parse("[{name: 'Jisoo', role: '主唱'}]")
        self.assertEqual(out, [{"name": "Jisoo", "role": "主唱"}])

    def test_double_quotes_preserved(self):
        out = self._parse('[{"name": "Jisoo"}]')
        self.assertEqual(out, [{"name": "Jisoo"}])

    def test_quote_inside_single_quoted_string(self):
        # 单引号字符串里含双引号，应转义
        out = self._parse("[{desc: 'he said \"hi\"'}]")
        self.assertEqual(out[0]["desc"], 'he said "hi"')

    def test_single_quote_inside_double_quoted(self):
        # 双引号字符串里含单引号，原样保留
        out = self._parse('[{"desc": "it\'s ok"}]')
        self.assertEqual(out[0]["desc"], "it's ok")

    # ---------- 模板字符串 ----------
    def test_template_literal_basic(self):
        out = self._parse("[{title: `Hello`}]")
        self.assertEqual(out[0]["title"], "Hello")

    def test_template_literal_with_double_quote(self):
        out = self._parse("[{title: `say \"hi\"`}]")
        self.assertEqual(out[0]["title"], 'say "hi"')

    def test_template_literal_multiline(self):
        # 反引号字符串内的换行应转为 \n
        out = self._parse("[{story: `line1\nline2`}]")
        self.assertEqual(out[0]["story"], "line1\nline2")

    # ---------- 裸 key ----------
    def test_bare_keys(self):
        out = self._parse("{name: 'Jisoo', age: 28}")
        self.assertEqual(out, {"name": "Jisoo", "age": 28})

    def test_nested_bare_keys(self):
        out = self._parse("{outer: {inner: 'val'}}")
        self.assertEqual(out, {"outer": {"inner": "val"}})

    # ---------- URL 冒号 ----------
    def test_url_colon_not_treated_as_key(self):
        # url(http://...) 里的冒号不应被当作 key 分隔符
        out = self._parse("[{img: 'http://example.com/a.png'}]")
        self.assertEqual(out[0]["img"], "http://example.com/a.png")

    def test_https_in_value(self):
        out = self._parse('[{"url": "https://x.com"}]')
        self.assertEqual(out[0]["url"], "https://x.com")

    # ---------- 字面量 ----------
    def test_true_false_null(self):
        out = self._parse("{a: true, b: false, c: null}")
        self.assertEqual(out, {"a": True, "b": False, "c": None})

    def test_numbers(self):
        out = self._parse("{a: 1, b: 2.5, c: -3}")
        self.assertEqual(out, {"a": 1, "b": 2.5, "c": -3})

    # ---------- 尾逗号 ----------
    def test_trailing_comma_object(self):
        out = self._parse("{a: 1, b: 2,}")
        self.assertEqual(out, {"a": 1, "b": 2})

    def test_trailing_comma_array(self):
        out = self._parse("[1, 2, 3,]")
        self.assertEqual(out, [1, 2, 3])

    # ---------- 嵌套 ----------
    def test_nested_arrays_in_object(self):
        js = "{relations: [['label1', 'val1'], ['label2', 'val2']]}"
        out = self._parse(js)
        self.assertEqual(out["relations"], [["label1", "val1"], ["label2", "val2"]])

    def test_array_of_objects(self):
        js = "[{name: 'A'}, {name: 'B'}]"
        out = self._parse(js)
        self.assertEqual(out, [{"name": "A"}, {"name": "B"}])

    def test_deeply_nested(self):
        js = "{a: {b: {c: [{d: 'val'}]}}}"
        out = self._parse(js)
        self.assertEqual(out["a"]["b"]["c"][0]["d"], "val")

    # ---------- 转义 ----------
    def test_backslash_escape_preserved(self):
        # \n 在字符串里应保留为转义
        out = self._parse("[{desc: 'line1\\nline2'}]")
        self.assertEqual(out[0]["desc"], "line1\nline2")

    def test_escaped_quote_in_single_quoted(self):
        out = self._parse("[{desc: 'it\\'s ok'}]")
        self.assertEqual(out[0]["desc"], "it's ok")

    # ---------- 注释 ----------
    def test_line_comment_skipped(self):
        js = "{a: 1, // comment\nb: 2}"
        out = self._parse(js)
        self.assertEqual(out, {"a": 1, "b": 2})

    def test_block_comment_skipped(self):
        js = "{a: 1, /* comment */ b: 2}"
        out = self._parse(js)
        self.assertEqual(out, {"a": 1, "b": 2})

    # ---------- 真实场景近似 ----------
    def test_member_list_realistic(self):
        js = """[
          {key: 'jisoo', name: 'Jisoo', role: '主唱·领舞', img: 'http://x.com/j.jpg'},
          {key: 'jennie', name: 'Jennie', role: '主唱·说唱', img: 'http://x.com/n.jpg'}
        ]"""
        out = self._parse(js)
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]["name"], "Jisoo")
        self.assertEqual(out[1]["role"], "主唱·说唱")
        self.assertTrue(out[0]["img"].startswith("http://"))

    def test_relations_mixed_format(self):
        # relations 可能是 [ [l,v], ... ] 混合
        js = "{relations: [['出道', '2016'], ['成员数', '4']]}"
        out = self._parse(js)
        self.assertEqual(out["relations"], [["出道", "2016"], ["成员数", "4"]])


if __name__ == "__main__":
    unittest.main(verbosity=2)
