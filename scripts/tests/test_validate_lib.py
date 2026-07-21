"""test_validate_lib.py - validate_lib.py 校验器单元测试

覆盖：
- check_data_separation：JS 硬编码 URL + examples HTML DOM 硬编码业务文案（年份/长描述）
- check_a11y：从 CSS/JS blob 探测 tab/modal（不依赖 manifest）
- check_naming：generic_words 扩充名单

运行：python3 scripts/tests/test_validate_lib.py
"""

import os
import sys
import tempfile
import unittest

_SKILL_SCRIPTS = os.path.join(os.path.dirname(__file__), "..", "..", "src", "skill", "scripts")
sys.path.insert(0, os.path.abspath(_SKILL_SCRIPTS))

from validate_lib import LibValidator  # noqa: E402


def _make_validator(files: dict) -> LibValidator:
    """构造临时组件库目录。files: {相对路径: 内容}。"""
    d = tempfile.mkdtemp()
    for rel, content in files.items():
        full = os.path.join(d, rel)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(content)
    return LibValidator(d)


# 最小合法 CSS（含核心变量 + 响应式 + sg- 前缀），用于通过其他检查
_MIN_CSS = """:root {
  --sg-primary: #6487FA; --sg-ink: #1E1F24; --sg-muted: #848691;
  --sg-line: #ECEDF1; --sg-paper: #FFFFFF; --sg-stage: #F8F8F8;
}
.sg-frame { color: var(--sg-ink); }
@media (max-width: 500px) { .sg-frame { padding: 8px; } }
@media (max-width: 320px) { .sg-frame { padding: 4px; } }"""

# 最小合法 JS（含全局对象 + A11y 基线）
_MIN_JS = """window.GlossaryExplorer = { mount: function(){} };
var el = document.createElement('div');
el.setAttribute('aria-label', 'main');
el.setAttribute('aria-live', 'polite');"""


class TestDataSeparation(unittest.TestCase):
    """check_data_separation：JS URL + DOM 业务文案检查。"""

    def test_clean_library_passes(self):
        """业务文案全在 <script> options 内 -> PASS。"""
        v = _make_validator({
            "src/glossary.css": _MIN_CSS,
            "src/glossary.js": _MIN_JS,
            "examples/case.html": """<!doctype html><html><body>
<div id="mount"></div>
<script src="../src/glossary.js"></script>
<script>
GlossaryExplorer.mount(document.getElementById('mount'), {
  members: [{name:'JISOO', year:2016, role:'主唱'}]
});
</script>
</body></html>""",
            "README.md": "# Lib\n\nGlossaryExplorer.mount(el, opts)\n",
            "docs/设计规范.md": "# 设计规范\n\n主题色：primary\n",
        })
        v.check_data_separation()
        passed = all(ok for _, ok, _ in v.results if _)
        # 直接断言：应无 issue
        self.assertEqual(len(v.results), 1)
        self.assertTrue(v.results[0][1], f"应 PASS: {v.results[0][2]}")

    def test_dom_hardcoded_years_fail(self):
        """DOM 残留 ≥2 个年份 -> FAIL。"""
        v = _make_validator({
            "src/glossary.css": _MIN_CSS,
            "src/glossary.js": _MIN_JS,
            "examples/bad.html": """<!doctype html><html><body>
<div id="mount"></div>
<div class="sg-timeline"><span>2016年出道</span><span>2022年回归</span></div>
<script src="../src/glossary.js"></script>
</body></html>""",
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_data_separation()
        self.assertFalse(v.results[0][1])
        self.assertIn("年份", v.results[0][2])

    def test_dom_long_description_fail(self):
        """DOM 残留长描述（≥15 中文字符）-> FAIL。"""
        v = _make_validator({
            "src/glossary.css": _MIN_CSS,
            "src/glossary.js": _MIN_JS,
            "examples/bad.html": """<!doctype html><html><body>
<div id="mount"></div>
<p class="sg-desc">该组合于二零一六年正式出道并迅速走红亚洲流行乐坛</p>
<script src="../src/glossary.js"></script>
</body></html>""",
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_data_separation()
        self.assertFalse(v.results[0][1])
        self.assertIn("长描述", v.results[0][2])

    def test_brand_name_in_dom_not_flagged(self):
        """品牌名 GlossaryExplorer 在 DOM（标题）不应告警（避免误伤）。"""
        v = _make_validator({
            "src/glossary.css": _MIN_CSS,
            "src/glossary.js": _MIN_JS,
            "examples/case.html": """<!doctype html><html><body>
<div id="mount"></div>
<h1>GlossaryExplorer 技术术语探索卡</h1>
<script src="../src/glossary.js"></script>
<script>GlossaryExplorer.mount(document.getElementById('mount'), {tabs:[]});</script>
</body></html>""",
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_data_separation()
        self.assertTrue(v.results[0][1], f"品牌名不应告警: {v.results[0][2]}")

    def test_svg_namespace_url_is_structural_not_business_data(self):
        """SVG namespace/schema URL 不应触发业务 URL 硬编码告警。"""
        v = _make_validator({
            "src/glossary.css": _MIN_CSS,
            "src/glossary.js": _MIN_JS + "\nvar SVG_NS = 'http://www.w3.org/2000/svg';",
            "examples/case.html": '<!doctype html><html><body><div id="mount"></div><script src="../src/glossary.js"></script></body></html>',
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_data_separation()
        self.assertTrue(v.results[0][1], v.results[0][2])

    def test_js_hardcoded_url_fail(self):
        """JS 硬编码 https URL（非变量引用）-> FAIL。"""
        v = _make_validator({
            "src/glossary.css": _MIN_CSS,
            "src/glossary.js": _MIN_JS + "\nvar url = 'https://example.com/biz.jpg';",
            "examples/case.html": '<!doctype html><html><body><div id="mount"></div><script src="../src/glossary.js"></script></body></html>',
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_data_separation()
        self.assertFalse(v.results[0][1])


class TestA11yBlobDetection(unittest.TestCase):
    """check_a11y：从 blob 探测 tab/modal（Sprint 2-1 改造）。"""

    def test_tab_without_tablist_fails(self):
        """有 .sg-tab 类但无 role=tablist -> FAIL。"""
        css = _MIN_CSS + "\n.sg-tab { display: flex; }"
        js = _MIN_JS  # 无 tablist/tabpanel
        v = _make_validator({
            "src/glossary.css": css,
            "src/glossary.js": js,
            "examples/case.html": '<!doctype html><div id="mount"></div><script src="../src/glossary.js"></script>',
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_a11y()
        self.assertFalse(v.results[0][1])
        self.assertIn("tablist", v.results[0][2])

    def test_modal_without_dialog_fails(self):
        """有 .sg-modal 类但无 role=dialog -> FAIL。"""
        css = _MIN_CSS + "\n.sg-modal-overlay { position: fixed; }"
        js = _MIN_JS  # 无 dialog/Escape
        v = _make_validator({
            "src/glossary.css": css,
            "src/glossary.js": js,
            "examples/case.html": '<!doctype html><div id="mount"></div><script src="../src/glossary.js"></script>',
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_a11y()
        self.assertFalse(v.results[0][1])
        self.assertIn("dialog", v.results[0][2])

    def test_clean_a11y_passes_without_manifest(self):
        """无 manifest 时，blob 含完整 A11y 关键字 -> PASS。"""
        css = _MIN_CSS + "\n.sg-tab {} \n.sg-modal-overlay {}"
        # 用库实际写法：HTML 属性形式 role="tablist" 或 JS 字符串里含该形式
        js = _MIN_JS + """
var nav = '<nav role="tablist"><div role="tabpanel"></div></nav>';
var modal = '<div role="dialog" aria-modal="true"></div>';
document.addEventListener('keydown', function(e){ if(e.key==='Escape'){} });"""
        v = _make_validator({
            "src/glossary.css": css,
            "src/glossary.js": js,
            "examples/case.html": '<!doctype html><div id="mount"></div><script src="../src/glossary.js"></script>',
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_a11y()
        self.assertTrue(v.results[0][1], f"应 PASS: {v.results[0][2]}")


class TestNamingGenericWords(unittest.TestCase):
    """check_naming：扩充后的 generic_words 名单。"""

    def test_bare_card_fails(self):
        """.card 裸类名 -> FAIL。"""
        css = _MIN_CSS + "\n.card { padding: 10px; }"
        v = _make_validator({
            "src/glossary.css": css,
            "src/glossary.js": _MIN_JS + "\nwindow.GlossaryExplorer.mount = function(){};",
            "examples/case.html": '<!doctype html><div id="sg-mount"><div id="mount"></div></div><script src="../src/glossary.js"></script>',
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_naming()
        # 可能有多个 issue，至少含 .card
        issues = " ".join(d for _, ok, d in v.results if not ok)
        self.assertIn("card", issues.lower())

    def test_bare_btn_fails(self):
        """.btn 裸类名 -> FAIL。"""
        css = _MIN_CSS + "\n.btn { color: red; }"
        v = _make_validator({
            "src/glossary.css": css,
            "src/glossary.js": _MIN_JS + "\nwindow.GlossaryExplorer.mount = function(){};",
            "examples/case.html": '<!doctype html><div id="sg-mount"><div id="mount"></div></div><script src="../src/glossary.js"></script>',
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_naming()
        issues = " ".join(d for _, ok, d in v.results if not ok)
        self.assertIn("btn", issues.lower())

    def test_sg_prefixed_not_flagged(self):
        """sg- 前缀的类名不告警。"""
        css = _MIN_CSS + "\n.sg-card { padding: 10px; }\n.sg-btn { color: red; }"
        v = _make_validator({
            "src/glossary.css": css,
            "src/glossary.js": _MIN_JS + "\nwindow.GlossaryExplorer.mount = function(){};",
            "examples/case.html": '<!doctype html><div id="sg-mount"><div id="mount"></div></div><script src="../src/glossary.js"></script>',
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_naming()
        self.assertTrue(v.results[0][1], f"sg- 前缀不应告警: {v.results[0][2]}")

class TestArtifactCompleteness(unittest.TestCase):
    """稳定交付物：template 必须存在，showcase 可由完整门禁显式要求。"""

    _BASE_FILES = {
        "src/glossary.css": _MIN_CSS,
        "src/glossary.js": _MIN_JS,
        "README.md": "# Lib\n\nGlossaryExplorer.mount(el, opts)\n",
        "docs/设计规范.md": "# 设计规范\n\n主题色\n",
        "examples/case.html": "<!doctype html><div id='mount'></div>",
    }

    def test_template_is_required(self):
        v = _make_validator(self._BASE_FILES)
        v.check_docs()
        self.assertFalse(v.results[0][1])
        self.assertIn("template.html", v.results[0][2])

    def test_template_passes_without_showcase_legacy_mode(self):
        files = dict(self._BASE_FILES)
        files["examples/template.html"] = "<!doctype html><div id='mount'></div><script>GlossaryExplorer.mount(document.getElementById('mount'))</script>"
        v = _make_validator(files)
        v.check_docs()
        self.assertTrue(v.results[0][1], v.results[0][2])

    def test_complete_gate_requires_showcase(self):
        files = dict(self._BASE_FILES)
        files["examples/template.html"] = "<!doctype html><div id='mount'></div><script>GlossaryExplorer.mount(document.getElementById('mount'))</script>"
        v = _make_validator(files)
        v.require_showcase = True
        v.check_docs()
        self.assertFalse(v.results[0][1])
        self.assertIn("showcase.html", v.results[0][2])

    def test_complete_gate_accepts_template_and_showcase(self):
        files = dict(self._BASE_FILES)
        files["examples/template.html"] = "<!doctype html><div id='mount'></div><script>GlossaryExplorer.mount(document.getElementById('mount'))</script>"
        files["showcase.html"] = "<!doctype html><html><body>showcase</body></html>"
        v = _make_validator(files)
        v.require_showcase = True
        v.check_docs()
        self.assertTrue(v.results[0][1], v.results[0][2])

    def test_gold_profile_rejects_mount_only_thin_docs(self):
        files = dict(self._BASE_FILES)
        files["examples/template.html"] = "<!doctype html><div id='mount'></div><script>GlossaryExplorer.mount(document.getElementById('mount'))</script>"
        files["showcase.html"] = "<!doctype html><html><body>showcase</body></html>"
        v = _make_validator(files)
        v.require_showcase = True
        v.quality_profile = "gold"
        v.check_gold_quality()
        self.assertFalse(v.results[0][1])
        self.assertIn("create", v.results[0][2])

    def test_gold_profile_accepts_complete_api_docs_and_bento(self):
        files = dict(self._BASE_FILES)
        files["src/glossary.js"] = """window.GlossaryExplorer = {
  version: '1.0.0',
  create: function(options){ return document.createElement('div'); },
  mount: function(container, options){ return container; }
};"""
        files["README.md"] = "# Lib\n\n## API\nmount/create\n## 数据契约\nfields\n## 主题\ntokens\n"
        files["docs/设计规范.md"] = "# 设计规范\n主题色 交互 响应式 A11y 组件\n"
        files["examples/template.html"] = "<!doctype html><div id='mount'></div><script>GlossaryExplorer.mount(document.getElementById('mount'))</script>"
        files["showcase.html"] = """<!doctype html><section id="overview"><div class="ds-bento-grid"></div></section>
<section id="colors"></section><section id="components"></section><section id="breakpoints"></section>"""
        v = _make_validator(files)
        v.require_showcase = True
        v.quality_profile = "gold"
        v.check_gold_quality()
        self.assertTrue(v.results[0][1], v.results[0][2])


class TestClassAlignment(unittest.TestCase):
    """check_class_alignment：JS 引用的 sg-* 类名必须在 CSS 中有定义。"""

    def test_pass_when_js_classes_all_defined(self):
        """JS 引用的类全在 CSS 定义 -> PASS。"""
        css = _MIN_CSS + "\n.sg-carousel-dots { gap: 4px; }\n.sg-stage { padding: 10px; }"
        js = _MIN_JS + """
function el(tag, cls, attrs) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
var dots = el('div', 'sg-carousel-dots');
var stage = el('div', 'sg-stage');"""
        v = _make_validator({
            "src/glossary.css": css,
            "src/glossary.js": js,
            "examples/case.html": '<!doctype html><div id="mount"></div><script src="../src/glossary.js"></script>',
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_class_alignment()
        self.assertEqual(len(v.results), 1)
        self.assertTrue(v.results[0][1], f"应 PASS: {v.results[0][2]}")

    def test_fail_when_js_class_missing_from_css(self):
        """JS 用 sg-carousel-dots 但 CSS 只有 sg-carousel-arrow -> FAIL（拦截类名脱节）。"""
        css = _MIN_CSS + "\n.sg-carousel-arrow { cursor: pointer; }"
        js = _MIN_JS + """
function el(tag, cls, attrs) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
var dots = el('div', 'sg-carousel-dots');"""
        v = _make_validator({
            "src/glossary.css": css,
            "src/glossary.js": js,
            "examples/case.html": '<!doctype html><div id="mount"></div><script src="../src/glossary.js"></script>',
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_class_alignment()
        self.assertEqual(len(v.results), 1)
        self.assertFalse(v.results[0][1], "应 FAIL: JS 用 sg-carousel-dots 但 CSS 未定义")
        self.assertIn("sg-carousel-dots", v.results[0][2])

    def test_exempt_dynamic_id_prefixes(self):
        """动态拼接的 ID 前缀（sg-tab-xxx / sg-panel-xxx）不是类名，不报 FAIL。"""
        css = _MIN_CSS + "\n.sg-tab { color: red; }\n.sg-view { display: grid; }"
        js = _MIN_JS + """
function el(tag, cls, attrs) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
var tab = el('button', 'sg-tab');
tab.id = 'sg-tab-members';
var panel = el('section', 'sg-view');
panel.id = 'sg-panel-members';"""
        v = _make_validator({
            "src/glossary.css": css,
            "src/glossary.js": js,
            "examples/case.html": '<!doctype html><div id="mount"></div><script src="../src/glossary.js"></script>',
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_class_alignment()
        self.assertTrue(v.results[0][1], f"动态 ID 前缀应豁免: {v.results[0][2]}")

    def test_exempt_semantic_base_classes(self):
        """语义基类（sg-tl-prev/sg-tl-next 用于组合选择器）不报 FAIL。"""
        css = _MIN_CSS + "\n.sg-arrow { display: flex; }\n.sg-tl-prev-pc { left: 0; }\n.sg-tl-next-pc { right: 0; }"
        js = _MIN_JS + """
function el(tag, cls, attrs) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
var prev = el('button', 'sg-arrow sg-tl-prev sg-tl-prev-pc');
var next = el('button', 'sg-arrow sg-tl-next sg-tl-next-pc');"""
        v = _make_validator({
            "src/glossary.css": css,
            "src/glossary.js": js,
            "examples/case.html": '<!doctype html><div id="mount"></div><script src="../src/glossary.js"></script>',
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_class_alignment()
        self.assertTrue(v.results[0][1], f"语义基类应豁免: {v.results[0][2]}")

    def test_pass_with_min_fixture(self):
        """_MIN_CSS + _MIN_JS 应 PASS（无 sg-* 类引用或全在 CSS 定义）。"""
        v = _make_validator({
            "src/glossary.css": _MIN_CSS,
            "src/glossary.js": _MIN_JS,
            "examples/case.html": '<!doctype html><div id="mount"></div><script src="../src/glossary.js"></script>',
            "README.md": "# Lib\nmount\n",
            "docs/设计规范.md": "主题色\n",
        })
        v.check_class_alignment()
        self.assertTrue(v.results[0][1], f"最小 fixture 应 PASS: {v.results[0][2]}")

if __name__ == "__main__":
    unittest.main(verbosity=2)
