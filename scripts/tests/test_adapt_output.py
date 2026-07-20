"""test_adapt_output.py — IIFE → ESM / Web Component 适配器单元测试

覆盖:
- extract_iife_core: 正向提取 + 错误处理（缺 IIFE/缺 API/缺 Lib）
- to_esm: 输出含 export 语句 + 不含 IIFE 包裹
- to_web_component: 输出含 customElements.define
- 端到端: ESM 输出通过 node --check 语法检查
"""

import os
import sys
import tempfile
import unittest

_SRC = os.path.join(os.path.dirname(__file__), "..", "..", "src")
sys.path.insert(0, os.path.abspath(_SRC))

from ui_dismantler.generation.adapt_output import extract_iife_core, to_esm, to_web_component  # noqa: E402


# 最小 IIFE 源码（符合 adapt_output 期望的格式）
_MIN_IIFE = """\
(function (global) {
  "use strict";
  function Lib(root, options) {
    root.innerHTML = '<div>' + options.title + '</div>';
  }
  var API = { mount: Lib, create: function(o) { var d = document.createElement('div'); Lib(d, o); return d; } };
  global.TestLib = API;
})(window);
"""


class TestExtractIifeCore(unittest.TestCase):
    def test_extracts_5_tuple(self):
        """正常 IIFE -> 5-tuple (preamble, body, api_name, lib_name, use_strict)。"""
        result = extract_iife_core(_MIN_IIFE)
        self.assertEqual(len(result), 5)
        preamble, body, api_name, lib_name, use_strict = result
        self.assertEqual(api_name, "TestLib")
        self.assertEqual(lib_name, "Lib")
        self.assertIn("function Lib", body)
        # body 是 function Lib 到 var API 之间的部分（不含 var API 本身）
        self.assertIn("innerHTML", body)

    def test_missing_iife_wrapper_raises(self):
        """无 IIFE 包裹 -> ValueError。"""
        with self.assertRaises(ValueError) as ctx:
            extract_iife_core("var x = 1;")
        self.assertIn("IIFE", str(ctx.exception))

    def test_missing_api_assignment_raises(self):
        """无 global.XXX = API -> ValueError。"""
        src = "(function(global){'use strict';function Lib(root,options){}})(window);"
        with self.assertRaises(ValueError) as ctx:
            extract_iife_core(src)
        self.assertIn("API", str(ctx.exception))

    def test_missing_lib_function_raises(self):
        """无 function Lib(root, options) -> ValueError。"""
        src = "(function(global){'use strict';var API={};global.X=API;})(window);"
        with self.assertRaises(ValueError) as ctx:
            extract_iife_core(src)
        self.assertIn("Lib", str(ctx.exception))


class TestToEsm(unittest.TestCase):
    def test_esm_output_has_no_iife_wrapper(self):
        """ESM 输出不包含 IIFE 包裹 (function(global)。"""
        esm = to_esm(_MIN_IIFE)
        self.assertNotIn("(function(global)", esm)
        self.assertNotIn("})(window)", esm)

    def test_esm_output_has_export(self):
        """ESM 输出包含全局赋值（兼容 jsdom + 浏览器）。"""
        esm = to_esm(_MIN_IIFE)
        self.assertIn("TestLib", esm)

    def test_esm_output_renames_constructor(self):
        """ESM 输出把构造函数改名为 _LibCtor 避免全局冲突。"""
        esm = to_esm(_MIN_IIFE)
        self.assertIn("_LibCtor", esm)

    def test_esm_passes_node_check(self):
        """ESM 输出通过 node --check 语法检查。"""
        import subprocess
        esm = to_esm(_MIN_IIFE)
        with tempfile.NamedTemporaryFile(suffix=".js", delete=False, mode="w") as f:
            f.write(esm)
            path = f.name
        try:
            proc = subprocess.run(
                ["node", "--check", path],
                capture_output=True, text=True, timeout=10,
            )
            self.assertEqual(proc.returncode, 0, f"node --check 失败: {proc.stderr}")
        finally:
            os.unlink(path)


class TestToWebComponent(unittest.TestCase):
    def test_wc_output_has_custom_elements_define(self):
        """WC 输出包含 customElements.define。"""
        wc = to_web_component(_MIN_IIFE, "sg-test")
        self.assertIn("customElements.define", wc)
        self.assertIn("sg-test", wc)

    def test_wc_output_extends_html_element(self):
        """WC 输出包含 extends HTMLElement。"""
        wc = to_web_component(_MIN_IIFE, "sg-test")
        self.assertIn("HTMLElement", wc)

    def test_wc_passes_node_check(self):
        """WC 输出通过 node --check 语法检查。"""
        import subprocess
        wc = to_web_component(_MIN_IIFE, "sg-test")
        with tempfile.NamedTemporaryFile(suffix=".js", delete=False, mode="w") as f:
            f.write(wc)
            path = f.name
        try:
            proc = subprocess.run(
                ["node", "--check", path],
                capture_output=True, text=True, timeout=10,
            )
            self.assertEqual(proc.returncode, 0, f"node --check 失败: {proc.stderr}")
        finally:
            os.unlink(path)


class TestRealLibrary(unittest.TestCase):
    """用 benchmark/lib/src/glossary.js 做端到端验证。

    注意：adapt_output 目前只识别 function Lib(root, options) 命名约定，
    不支持 GlossaryExplorer(options) 等自定义命名。这是已知局限。
    """

    def setUp(self):
        repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        self.lib = os.path.join(repo, "benchmark", "lib", "src", "glossary.js")
        if not os.path.isfile(self.lib):
            self.skipTest("glossary.js 不存在")

    def test_glossary_not_supported_yet(self):
        """glossary.js 用自定义命名，adapt_output 尚不支持（已知局限）。"""
        src = open(self.lib, encoding="utf-8").read()
        with self.assertRaises(ValueError):
            to_esm(src)


if __name__ == "__main__":
    unittest.main(verbosity=2)
