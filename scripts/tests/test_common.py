"""test_common.py — _common.py 工具函数单元测试

覆盖：
- normalize_var_name（变量归一化）
- parse_color / to_hex / color_distance（颜色解析）
- extract_root_vars / extract_all_vars（CSS 变量提取，含 :root 选择器组）
- split_media_blocks（@media 拆分，含注释/嵌套）
- parse_rules（CSS 规则解析）
- extract_gradients（渐变提取）
- slugify

运行：python3 scripts/tests/test_common.py
"""

import os
import sys
import unittest

# 让脚本能直接 import src/skill/scripts/_common.py
_SKILL_SCRIPTS = os.path.join(os.path.dirname(__file__), "..", "..", "src", "skill", "scripts")
sys.path.insert(0, os.path.abspath(_SKILL_SCRIPTS))

from _common import (  # noqa: E402
    normalize_var_name, parse_color, to_hex, color_distance,
    extract_root_vars, extract_all_vars, split_media_blocks, parse_rules,
    extract_gradients, slugify, infer_color_roles, query_rules,
    extract_data_contracts,
)


class TestNormalizeVarName(unittest.TestCase):
    def test_strips_leading_dashes(self):
        self.assertEqual(normalize_var_name("--primary"), "primary")

    def test_known_mappings(self):
        cases = [
            ("--primary", "primary"),
            ("--primary-color", "primary"),
            ("--primary_color", "primary"),
            ("--marker-primary", "primary"),
            ("--brand", "primary"),
            ("--accent", "accent"),
            ("--cause-color", "accent"),
            ("--ink", "ink"),
            ("--text-main", "ink"),
            ("--text-primary", "ink"),
            ("--color-text", "ink"),
            ("--muted", "muted"),
            ("--text-secondary", "muted"),
            ("--text-sub", "muted"),
            ("--subtle", "subtle"),
            ("--text-tertiary", "subtle"),
            ("--line", "line"),
            ("--border", "line"),
            ("--paper", "paper"),
            ("--bg-white", "paper"),
            ("--card-bg", "paper"),
            ("--stage", "stage"),
            ("--bg-gray", "stage"),
            ("--soft", "soft"),
            ("--primary-l", "soft"),
            ("--primary-light", "soft"),
            ("--soft-pink", "soft-accent"),
            ("--accent-l", "soft-accent"),
            ("--accent-2", "accent-2"),
            ("--accent2", "accent-2"),
            ("--2", "accent-2"),
            ("--primary-dark", "primary-dark"),
            ("--primary-d", "primary-dark"),
            # Tailwind / Material Design 3 语义色
            ("--on-primary", "on-primary"),
            ("--on-primary", "on-primary"),
            ("--on-secondary", "on-accent"),
            ("--on-tertiary", "on-tertiary"),
            ("--on-error", "on-error"),
            ("--secondary", "accent"),
            ("--tertiary", "tertiary"),
            ("--background", "paper"),
            ("--surface", "paper"),
            ("--surface-container-lowest", "paper"),
            ("--surface-container", "stage"),
            ("--surface-dim", "stage"),
            ("--surface-bright", "stage"),
            ("--on-surface", "ink"),
            ("--on-background", "ink"),
            ("--on-surface-variant", "muted"),
            ("--outline", "line"),
            ("--outline-variant", "line"),
            ("--error", "error"),
            ("--error-container", "error"),
            ("--primary-container", "soft"),
            ("--secondary-container", "soft-accent"),
            ("--primary-fixed", "primary-fixed"),
            ("--primary-fixed-dim", "primary-fixed-dim"),
            ("--inverse-surface", "inverse-surface"),
            ("--inverse-primary", "inverse-primary"),
        ]
        for orig, expected in cases:
            with self.subTest(orig=orig):
                self.assertEqual(normalize_var_name(orig), expected)

    def test_tailwind_material3_mappings_cover_full_palette(self):
        """Tailwind / Material Design 3 调色板归一化覆盖测试。

        这批映射从 experimental 分支迁移而来，用于支持 Tailwind CDN 页面
        和 Material Design 3 主题色变量。验证关键语义角色的归一化正确性。
        """
        cases = [
            # on-* 前景色（与对应背景色配对）
            ("--on-primary", "on-primary"),
            ("--on_secondary", "on-accent"),
            # MD3 secondary/tertiary 映射到 generic 的 accent/tertiary
            ("--secondary", "accent"),
            ("--tertiary", "tertiary"),
            # surface 系列分层：lowest → paper，container/dim/bright → stage
            ("--surface-container-lowest", "paper"),
            ("--surface-container", "stage"),
            ("--surface_dim", "stage"),
            # outline 映射到 line（边框语义）
            ("--outline-variant", "line"),
            # container 变体映射到 soft 系列
            ("--primary-container", "soft"),
            ("--secondary-container", "soft-accent"),
            # fixed 系列（MD3 色调固定变体）
            ("--primary-fixed", "primary-fixed"),
            ("--primary-fixed-dim", "primary-fixed-dim"),
        ]
        for orig, expected in cases:
            with self.subTest(orig=orig):
                self.assertEqual(normalize_var_name(orig), expected)

    def test_unknown_keeps_name_lowercased(self):
        self.assertEqual(normalize_var_name("--XYZ"), "xyz")
        self.assertEqual(normalize_var_name("--Custom-Token"), "custom-token")

    def test_empty_input(self):
        self.assertEqual(normalize_var_name(""), "")
        self.assertEqual(normalize_var_name(None), None)

    def test_case_insensitive(self):
        self.assertEqual(normalize_var_name("--PRIMARY"), "primary")
        self.assertEqual(normalize_var_name("--Ink"), "ink")


class TestParseColor(unittest.TestCase):
    def test_hex_3(self):
        self.assertEqual(parse_color("#abc"), (0xaa, 0xbb, 0xcc, 1.0))

    def test_hex_6(self):
        self.assertEqual(parse_color("#FF8800"), (255, 136, 0, 1.0))

    def test_hex_8_with_alpha(self):
        r, g, b, a = parse_color("#FF880080")
        self.assertEqual((r, g, b), (255, 136, 0))
        self.assertAlmostEqual(a, 0x80 / 255, places=3)

    def test_hex_lowercase(self):
        self.assertEqual(parse_color("#ff8800"), (255, 136, 0, 1.0))

    def test_rgb(self):
        self.assertEqual(parse_color("rgb(255, 136, 0)"), (255, 136, 0, 1.0))

    def test_rgb_no_commas(self):
        self.assertEqual(parse_color("rgb(255 136 0)"), (255, 136, 0, 1.0))

    def test_rgba(self):
        r, g, b, a = parse_color("rgba(255, 136, 0, 0.5)")
        self.assertEqual((r, g, b), (255, 136, 0))
        self.assertAlmostEqual(a, 0.5)

    def test_hsl_red(self):
        # hsl(0, 100%, 50%) = red
        r, g, b, a = parse_color("hsl(0, 100%, 50%)")
        self.assertEqual((r, g, b), (255, 0, 0))
        self.assertEqual(a, 1.0)

    def test_hsl_green(self):
        # hsl(120, 100%, 50%) = green
        r, g, b, _ = parse_color("hsl(120, 100%, 50%)")
        self.assertEqual((r, g, b), (0, 255, 0))

    def test_hsl_blue(self):
        # hsl(240, 100%, 50%) = blue
        r, g, b, _ = parse_color("hsl(240, 100%, 50%)")
        self.assertEqual((r, g, b), (0, 0, 255))

    def test_hsla_alpha(self):
        _, _, _, a = parse_color("hsla(0, 100%, 50%, 0.3)")
        self.assertAlmostEqual(a, 0.3)

    def test_invalid_returns_none(self):
        self.assertIsNone(parse_color(""))
        self.assertIsNone(parse_color("not-a-color"))
        self.assertIsNone(parse_color("#12"))          # too short
        self.assertIsNone(parse_color("#12345"))       # 5 chars
        self.assertIsNone(parse_color("rgb(1,2)"))     # too few

    def test_whitespace_tolerant(self):
        self.assertEqual(parse_color("  #FF8800  "), (255, 136, 0, 1.0))


class TestToHex(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(to_hex((255, 136, 0, 1.0)), "#FF8800")

    def test_ignores_alpha(self):
        self.assertEqual(to_hex((255, 136, 0, 0.5)), "#FF8800")

    def test_zero(self):
        self.assertEqual(to_hex((0, 0, 0, 1.0)), "#000000")


class TestColorDistance(unittest.TestCase):
    def test_identical(self):
        self.assertEqual(color_distance((0, 0, 0, 1), (0, 0, 0, 1)), 0.0)

    def test_max(self):
        d = color_distance((0, 0, 0, 1), (255, 255, 255, 1))
        self.assertAlmostEqual(d, (255 ** 2 * 3) ** 0.5)

    def test_ignores_alpha(self):
        # alpha 不同不影响距离
        d1 = color_distance((10, 20, 30, 1.0), (40, 50, 60, 1.0))
        d2 = color_distance((10, 20, 30, 0.1), (40, 50, 60, 0.9))
        self.assertEqual(d1, d2)


class TestExtractRootVars(unittest.TestCase):
    def test_simple_root_block(self):
        css = ":root { --primary: #f00; --ink: #000; }"
        out = extract_root_vars(css)
        self.assertEqual(out, {"--primary": "#f00", "--ink": "#000"})

    def test_root_selector_group(self):
        # :root 与 .sg-frame 共用声明块（benchmark 实际场景）
        css = ":root, .sg-frame { --primary: #f00; --ink: #000; }"
        out = extract_root_vars(css)
        self.assertEqual(out, {"--primary": "#f00", "--ink": "#000"})

    def test_root_with_newlines(self):
        css = ":root,\n.sg-frame {\n  --primary: #f00;\n  --ink: #000;\n}\n"
        out = extract_root_vars(css)
        self.assertEqual(out, {"--primary": "#f00", "--ink": "#000"})

    def test_multiple_root_blocks(self):
        css = ":root { --a: 1px; } :root { --b: 2px; }"
        out = extract_root_vars(css)
        self.assertEqual(out, {"--a": "1px", "--b": "2px"})

    def test_no_root_block(self):
        css = ".foo { color: red; }"
        self.assertEqual(extract_root_vars(css), {})

    def test_does_not_capture_non_root(self):
        # .foo { --local: 1px; } 不应被当 :root 变量提取
        css = ".foo { --local: 1px; } :root { --primary: #f00; }"
        out = extract_root_vars(css)
        self.assertNotIn("--local", out)
        self.assertEqual(out, {"--primary": "#f00"})


class TestExtractAllVars(unittest.TestCase):
    def test_captures_everywhere(self):
        css = ":root { --primary: #f00; } .foo { --local: 1px; }"
        out = extract_all_vars(css)
        self.assertEqual(out, {"--primary": "#f00", "--local": "1px"})

    def test_first_wins(self):
        css = ":root { --x: 1; } .foo { --x: 2; }"
        out = extract_all_vars(css)
        self.assertEqual(out, {"--x": "1"})


class TestSplitMediaBlocks(unittest.TestCase):
    def test_no_media(self):
        css = ".foo { color: red; } .bar { color: blue; }"
        blocks = split_media_blocks(css)
        # 无 @media，无 @ 规则 → 返回空列表
        self.assertEqual(blocks, [])

    def test_single_media(self):
        css = "@media (max-width: 500px) { .foo { color: red; } }"
        blocks = split_media_blocks(css)
        self.assertEqual(len(blocks), 1)
        query, body = blocks[0]
        self.assertIn("max-width: 500px", query)
        self.assertIn(".foo", body)

    def test_multiple_media(self):
        css = (
            "@media (max-width: 500px) { .a { color: red; } }"
            "@media (max-width: 320px) { .b { color: blue; } }"
        )
        blocks = split_media_blocks(css)
        self.assertEqual(len(blocks), 2)
        self.assertIn("500px", blocks[0][0])
        self.assertIn("320px", blocks[1][0])

    def test_nested_braces_in_media(self):
        # @media 内嵌 @media（虽不常见）或带括号的值
        css = "@media (max-width: 500px) { .a { content: \"{\"; } }"
        blocks = split_media_blocks(css)
        self.assertEqual(len(blocks), 1)
        self.assertIn(".a", blocks[0][1])

    def test_skips_comments(self):
        css = "/* comment */ @media (max-width: 500px) { .a { color: red; } }"
        blocks = split_media_blocks(css)
        self.assertEqual(len(blocks), 1)

    def test_keyframes_skipped_as_other_at_rule(self):
        # @keyframes 不是 @media，应被作为"其他 @ 规则"跳过，不当作 media 块
        css = "@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }"
        blocks = split_media_blocks(css)
        # 返回 1 个块但 query 为空（标记为非 media）
        self.assertEqual(len(blocks), 1)
        query, body = blocks[0]
        self.assertEqual(query, "")
        self.assertIn("keyframes", body)

    def test_mixed_media_and_keyframes(self):
        css = (
            "@keyframes spin { from { transform: rotate(0); } }"
            "@media (max-width: 500px) { .a { color: red; } }"
        )
        blocks = split_media_blocks(css)
        self.assertEqual(len(blocks), 2)
        # 第二个才是 media
        self.assertEqual(blocks[0][0], "")
        self.assertIn("500px", blocks[1][0])


class TestParseRules(unittest.TestCase):
    def test_single_rule(self):
        rules = parse_rules(".foo { color: red; }")
        self.assertEqual(len(rules), 1)
        sel, props = rules[0]
        self.assertEqual(sel, ".foo")
        self.assertEqual(props, {"color": "red"})

    def test_multiple_props(self):
        rules = parse_rules(".foo { color: red; background: blue; font-size: 14px; }")
        self.assertEqual(rules[0][1], {
            "color": "red", "background": "blue", "font-size": "14px"
        })

    def test_multiple_rules(self):
        rules = parse_rules(".a { color: red; } .b { color: blue; }")
        self.assertEqual(len(rules), 2)
        self.assertEqual(rules[0][0], ".a")
        self.assertEqual(rules[1][0], ".b")

    def test_skips_empty(self):
        rules = parse_rules(".foo { } .bar { color: red; }")
        self.assertEqual(len(rules), 1)
        self.assertEqual(rules[0][0], ".bar")

    def test_handles_colon_in_value(self):
        # background: url(http://...) 这种值含冒号
        rules = parse_rules(".foo { background: url(http://x.com/a.png); }")
        self.assertEqual(rules[0][1]["background"], "url(http://x.com/a.png)")

    def test_strips_whitespace(self):
        rules = parse_rules("  .foo   {   color  :  red  ;  }  ")
        self.assertEqual(rules[0][0], ".foo")
        self.assertEqual(rules[0][1], {"color": "red"})


class TestExtractGradients(unittest.TestCase):
    def test_linear_gradient(self):
        css = ".foo { background: linear-gradient(90deg, #f00, #00f); }"
        grads = extract_gradients(css)
        self.assertEqual(len(grads), 1)
        self.assertEqual(grads[0]["type"], "linear")
        self.assertIn("90deg", grads[0]["value"])
        self.assertEqual(len(grads[0]["stops"]), 2)

    def test_radial_gradient(self):
        css = ".foo { background: radial-gradient(circle, #f00, #00f); }"
        grads = extract_gradients(css)
        self.assertEqual(len(grads), 1)
        self.assertEqual(grads[0]["type"], "radial")

    def test_multiple_stops(self):
        css = ".foo { background: linear-gradient(90deg, #f00 0%, #0f0 50%, #00f 100%); }"
        grads = extract_gradients(css)
        self.assertEqual(len(grads[0]["stops"]), 3)

    def test_nested_function_parens(self):
        # 渐变里嵌 rgba()
        css = ".foo { background: linear-gradient(90deg, rgba(255,0,0,0.5), #00f); }"
        grads = extract_gradients(css)
        self.assertEqual(len(grads), 1)
        self.assertEqual(len(grads[0]["stops"]), 2)

    def test_no_gradient(self):
        css = ".foo { color: red; }"
        self.assertEqual(extract_gradients(css), [])


class TestSlugify(unittest.TestCase):
    def test_english(self):
        self.assertEqual(slugify("GlossaryExplorer"), "glossaryexplorer")

    def test_english_with_spaces(self):
        self.assertEqual(slugify("Hello World"), "hello-world")

    def test_chinese(self):
        self.assertEqual(slugify("黄月英"), "黄月英")

    def test_mixed(self):
        self.assertEqual(slugify("Glossary 术语表"), "glossary-术语表")

    def test_strips_version_suffix(self):
        self.assertEqual(slugify("case_v2"), "case")
        self.assertEqual(slugify("case_v12"), "case")

    def test_special_chars_to_dash(self):
        self.assertEqual(slugify("a.b/c"), "a-b-c")

    def test_strips_leading_trailing_dash(self):
        self.assertEqual(slugify("---abc---"), "abc")

    def test_empty_returns_case(self):
        self.assertEqual(slugify(""), "case")
        self.assertEqual(slugify("___"), "case")


class TestInferColorRoles(unittest.TestCase):
    def test_text_role(self):
        css = ".foo { color: var(--ink); }"
        self.assertEqual(infer_color_roles(css, "--ink"), ["text"])

    def test_background_role(self):
        css = ".foo { background: var(--paper); } .bar { background-color: var(--paper); }"
        # background 与 background-color 都归到 background
        self.assertEqual(infer_color_roles(css, "--paper"), ["background"])

    def test_border_role(self):
        css = ".foo { border: 1px solid var(--line); } .bar { border-bottom-color: var(--line); }"
        self.assertEqual(infer_color_roles(css, "--line"), ["border"])

    def test_multiple_roles(self):
        css = (
            ".a { color: var(--primary); } "
            ".b { background: var(--primary); } "
            ".c { border-color: var(--primary); }"
        )
        roles = infer_color_roles(css, "--primary")
        self.assertIn("text", roles)
        self.assertIn("background", roles)
        self.assertIn("border", roles)

    def test_dedup_same_role(self):
        # 同一角色多次出现只记一次
        css = ".a { color: var(--ink); } .b { color: var(--ink); }"
        self.assertEqual(infer_color_roles(css, "--ink"), ["text"])

    def test_shadow_role(self):
        css = ".foo { box-shadow: 0 2px 4px var(--ink); }"
        self.assertEqual(infer_color_roles(css, "--ink"), ["shadow"])

    def test_fill_stroke(self):
        css = ".icon { fill: var(--primary); stroke: var(--accent); }"
        self.assertEqual(infer_color_roles(css, "--primary"), ["icon-fill"])
        self.assertEqual(infer_color_roles(css, "--accent"), ["icon-stroke"])

    def test_no_usage_returns_empty(self):
        css = ".foo { color: red; }"
        self.assertEqual(infer_color_roles(css, "--unused"), [])

    def test_var_with_whitespace(self):
        # var( --ink ) 带空格也能匹配
        css = ".foo { color: var( --ink ); }"
        self.assertEqual(infer_color_roles(css, "--ink"), ["text"])

    def test_does_not_match_substring_var(self):
        # --ink 不应匹配 --ink-dark
        css = ".foo { color: var(--ink-dark); }"
        self.assertEqual(infer_color_roles(css, "--ink"), [])


class TestQueryRules(unittest.TestCase):
    SAMPLE = (
        ".sg-member { color: var(--ink); background: var(--paper); } "
        ".sg-member-grid { grid-template-columns: repeat(2, 1fr); display: grid; } "
        ".sg-frame { perspective: 900px; } "
        ".sg-tab.active { border-bottom: 2px solid var(--primary); }"
    )

    def test_selector_contains(self):
        out = query_rules(self.SAMPLE, selector_contains=".sg-member")
        # .sg-member 和 .sg-member-grid 都含 .sg-member 子串
        sels = [s for s, _ in out]
        self.assertIn(".sg-member", sels)
        self.assertIn(".sg-member-grid", sels)

    def test_selector_contains_case_insensitive(self):
        out = query_rules(self.SAMPLE, selector_contains=".SG-MEMBER")
        self.assertEqual(len(out), 2)

    def test_has_prop(self):
        out = query_rules(self.SAMPLE, has_prop="grid-template-columns")
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0][0], ".sg-member-grid")

    def test_has_prop_case_insensitive(self):
        out = query_rules(self.SAMPLE, has_prop="GRID-TEMPLATE-COLUMNS")
        self.assertEqual(len(out), 1)

    def test_prop_value_contains(self):
        # 查值含某子串的规则（900px 是 .sg-frame perspective 的值）
        out = query_rules(self.SAMPLE, prop_value_contains="900px")
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0][0], ".sg-frame")

    def test_combined_and(self):
        # selector + has_prop 组合（AND）
        out = query_rules(
            self.SAMPLE,
            selector_contains=".sg-member",
            has_prop="display",
        )
        # .sg-member-grid 含 display，.sg-member 不含
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0][0], ".sg-member-grid")

    def test_no_match_returns_empty(self):
        self.assertEqual(query_rules(self.SAMPLE, selector_contains=".nonexistent"), [])

    def test_no_filter_returns_all(self):
        # 不传任何条件，返回所有规则
        out = query_rules(self.SAMPLE)
        self.assertEqual(len(out), 4)

    def test_prop_value_in_var_reference(self):
        # 查含 var(--primary) 的规则
        out = query_rules(self.SAMPLE, prop_value_contains="var(--primary)")
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0][0], ".sg-tab.active")


class TestExtractDataContracts(unittest.TestCase):
    def test_array_of_objects(self):
        js = ["const members = [{name: 'Jisoo', role: '主唱', age: 28}];"]
        out = extract_data_contracts(js)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["name"], "members")
        self.assertEqual(out[0]["kind"], "array")
        self.assertEqual(out[0]["count"], 1)
        self.assertEqual(out[0]["fields"], {"name": "string", "role": "string", "age": "number"})

    def test_array_count(self):
        js = ["const nums = [1, 2, 3, 4, 5];"]
        out = extract_data_contracts(js)
        self.assertEqual(out[0]["count"], 5)
        self.assertEqual(out[0]["fields"], {})  # 纯值数组无字段

    def test_empty_array(self):
        js = ["const empty = [];"]
        out = extract_data_contracts(js)
        self.assertEqual(out[0]["count"], 0)
        self.assertEqual(out[0]["fields"], {})

    def test_object_literal(self):
        js = ["const config = {title: 'BP', count: 4, active: true};"]
        out = extract_data_contracts(js)
        self.assertEqual(out[0]["kind"], "object")
        self.assertEqual(out[0]["count"], 1)
        self.assertEqual(out[0]["fields"], {
            "title": "string", "count": "number", "active": "boolean"
        })

    def test_multiple_vars(self):
        js = ["const a = [1,2]; const b = {x: 1}; const c = [{k: 'v'}];"]
        out = extract_data_contracts(js)
        self.assertEqual(len(out), 3)
        names = [d["name"] for d in out]
        self.assertEqual(names, ["a", "b", "c"])

    def test_multiple_scripts(self):
        out = extract_data_contracts(["const a = [1];", "const b = [2];"])
        self.assertEqual(len(out), 2)

    def test_field_type_inference(self):
        js = ["""const d = [{
            s: 'str', n: 42, b: true, nl: null,
            arr: [1,2], obj: {x:1}, undef: undefined
        }];"""]
        out = extract_data_contracts(js)
        f = out[0]["fields"]
        self.assertEqual(f["s"], "string")
        self.assertEqual(f["n"], "number")
        self.assertEqual(f["b"], "boolean")
        self.assertEqual(f["nl"], "null")
        self.assertEqual(f["arr"], "array")
        self.assertEqual(f["obj"], "object")
        self.assertEqual(f["undef"], "undefined")

    def test_nested_array_in_object(self):
        # 对象里有数组字段，逗号不应误分割
        js = ["const d = {relations: [['a','b'], ['c','d']], name: 'x'};"]
        out = extract_data_contracts(js)
        self.assertEqual(out[0]["fields"]["relations"], "array")
        self.assertEqual(out[0]["fields"]["name"], "string")

    def test_string_with_comma_not_split(self):
        # 字符串里的逗号不应当作分隔符
        js = ["const d = {desc: 'a, b, c', n: 1};"]
        out = extract_data_contracts(js)
        self.assertEqual(len(out[0]["fields"]), 2)
        self.assertEqual(out[0]["fields"]["desc"], "string")

    def test_quoted_keys(self):
        js = ['const d = {"kebab-case": 1, "中文键": "v"};']
        out = extract_data_contracts(js)
        self.assertIn("kebab-case", out[0]["fields"])
        self.assertIn("中文键", out[0]["fields"])

    def test_no_decls(self):
        self.assertEqual(extract_data_contracts(["console.log(1);"]), [])

    def test_unclosed_bracket_skipped(self):
        # 未闭合的字面量应被跳过，不崩溃
        js = ["const bad = [1, 2, 3;"]
        out = extract_data_contracts(js)
        self.assertEqual(out, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
