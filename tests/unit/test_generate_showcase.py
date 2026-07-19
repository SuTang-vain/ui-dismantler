"""generate_showcase.py 单元与集成测试。"""

from html.parser import HTMLParser
from pathlib import Path
import re
import sys
import tempfile
import unittest

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "src"))

from ui_dismantler.generation.showcase import (  # noqa: E402
    _contrast_text,
    _parse_css_color,
    _pick_font,
    _pick_semantic_colors,
    _tonal_scale,
    build_bento_overview,
    generate_showcase,
)


class _StructureParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.stylesheets = []
        self.class_counts = {}

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get("id"):
            self.ids.append(values["id"])
        for cls in values.get("class", "").split():
            self.class_counts[cls] = self.class_counts.get(cls, 0) + 1
        if tag == "link" and values.get("rel") == "stylesheet":
            self.stylesheets.append(values.get("href"))


class TestColorHelpers(unittest.TestCase):
    def test_parse_common_color_syntaxes(self):
        self.assertEqual(_parse_css_color("#abc"), (170, 187, 204))
        self.assertEqual(_parse_css_color("#112233"), (17, 34, 51))
        self.assertEqual(_parse_css_color("rgb(1, 2, 3)"), (1, 2, 3))
        self.assertEqual(_parse_css_color("rgb(1 2 3)"), (1, 2, 3))
        self.assertEqual(_parse_css_color("hsl(0, 100%, 50%)"), (255, 0, 0))

    def test_alpha_is_composited_on_white(self):
        self.assertEqual(_parse_css_color("#00000080"), (127, 127, 127))
        self.assertEqual(_parse_css_color("rgba(0, 0, 0, 0.5)"), (128, 128, 128))
        self.assertEqual(_parse_css_color("hsl(0 0% 0% / 50%)"), (128, 128, 128))

    def test_invalid_or_indirect_color_returns_none(self):
        for value in ("", "red", "var(--brand)", "oklch(60% .2 20)", "#12"):
            with self.subTest(value=value):
                self.assertIsNone(_parse_css_color(value))

    def test_tonal_scale_is_stable_and_contains_base(self):
        scale = _tonal_scale("#6478ff")
        self.assertEqual(len(scale), 10)
        self.assertEqual(scale[5], "#6478FF")
        self.assertTrue(all(re.fullmatch(r"#[0-9A-F]{6}", value) for value in scale))

    def test_contrast_text(self):
        self.assertEqual(_contrast_text("#000000"), "#ffffff")
        self.assertEqual(_contrast_text("#ffffff"), "#111214")
        self.assertEqual(_contrast_text("not-a-color"), "#ffffff")


class TestOverviewSelection(unittest.TestCase):
    def test_semantic_colors_use_named_roles(self):
        colors = _pick_semantic_colors({
            "--sg-primary": "#6633ff",
            "--sg-ink": "#17181c",
            "--sg-orange": "#ff8800",
            "--sg-gray": "#777777",
        })
        self.assertEqual([item["name"] for item in colors], [
            "--sg-primary", "--sg-ink", "--sg-orange", "--sg-gray"
        ])

    def test_semantic_colors_have_four_fallbacks(self):
        colors = _pick_semantic_colors({})
        self.assertEqual(len(colors), 4)
        self.assertEqual([item["label"] for item in colors], ["Primary", "Secondary", "Tertiary", "Neutral"])
        self.assertTrue(all(_parse_css_color(item["value"]) for item in colors))

    def test_neutral_can_reuse_ink_for_sparse_palettes(self):
        colors = _pick_semantic_colors({"--sg-primary": "#6633ff", "--sg-ink": "#18191d"})
        self.assertEqual(colors[-1]["value"], "#18191d")

    def test_font_selection_prefers_role_then_falls_back(self):
        fonts = [("--sg-font-body", "Arial"), ("--sg-font-title", "Georgia")]
        self.assertEqual(_pick_font(fonts, ("title",), "sans-serif"), ("--sg-font-title", "Georgia"))
        self.assertEqual(_pick_font([], ("title",), "sans-serif"), ("System", "sans-serif"))

    def test_bento_overview_has_expected_information_density(self):
        overview, accent = build_bento_overview(
            {"--sg-primary": "#6633ff", "--sg-ink": "#17181c"},
            {}, ["sg-button"], [("max", 768, "(max-width: 768px)")], [],
        )
        self.assertEqual(accent, "#6633ff")
        self.assertEqual(overview.count('class="ds-palette-item"'), 4)
        self.assertEqual(overview.count("ds-type-card"), 3)
        self.assertIn('id="overview"', overview)
        self.assertNotIn("Design System Showcase", overview)


class TestGenerateShowcase(unittest.TestCase):
    def _make_library(self, name="demo-library", files=None):
        temp = tempfile.TemporaryDirectory()
        lib = Path(temp.name) / name
        src = lib / "src"
        src.mkdir(parents=True)
        for filename, css in (files or {}).items():
            (src / filename).write_text(css, encoding="utf-8")
        return temp, lib

    def test_missing_css_returns_clear_empty_result(self):
        temp, lib = self._make_library()
        self.addCleanup(temp.cleanup)
        self.assertIn("未找到 CSS 文件", generate_showcase(lib))

    def test_minimal_css_still_generates_overview(self):
        temp, lib = self._make_library(files={"library.css": ":root { --sg-primary: #3366ff; }"})
        self.addCleanup(temp.cleanup)
        output = generate_showcase(lib)
        parser = _StructureParser()
        parser.feed(output)
        self.assertEqual(parser.ids[0], "overview")
        self.assertEqual(parser.class_counts.get("ds-palette-item"), 4)
        self.assertEqual(parser.stylesheets, ["src/library.css"])
        self.assertNotIn("ds-hero", output)

    def test_complete_css_preserves_vertical_detail_order(self):
        css = """
        :root {
          --sg-primary: #6487fa;
          --sg-ink: #1e1f24;
          --sg-font-body: Inter, sans-serif;
          --sg-radius-md: 12px;
          --sg-shadow-card: 0 8px 30px rgba(0,0,0,.15);
        }
        html, body { display: flex; width: 100vw; overflow: hidden; }
        .sg-button { color: var(--sg-primary); }
        .sg-button:hover, .sg-button.active { opacity: .8; }
        .sg-panel { background: linear-gradient(90deg, #6487fa, #17c7d4); }
        @media (max-width: 768px) { .sg-panel { display: block; } }
        """
        temp, lib = self._make_library(files={"library.css": css})
        self.addCleanup(temp.cleanup)
        output = generate_showcase(lib)
        parser = _StructureParser()
        parser.feed(output)
        expected = ["overview", "colors", "tokens", "components", "breakpoints"]
        self.assertEqual([item for item in parser.ids if item in expected], expected)
        self.assertIn("html.ds-showcase-root {", output)
        self.assertIn("body.ds-showcase-body {", output)
        self.assertIn('grid-template-areas:', output)
        self.assertIn('"palette headline controls search"', output)
        self.assertIn('"palette"', output)
        self.assertIn("dsToggleAllStates", output)

    def test_all_css_files_are_loaded_in_deterministic_order(self):
        temp, lib = self._make_library(files={
            'z last.css': '.sg-last { color: red; }',
            'A & "first".css': ':root { --sg-primary: #123456; }',
        })
        self.addCleanup(temp.cleanup)
        output = generate_showcase(lib)
        parser = _StructureParser()
        parser.feed(output)
        self.assertEqual(parser.stylesheets, [
            "src/A%20%26%20%22first%22.css",
            "src/z%20last.css",
        ])
        self.assertIn("2 CSS files", output)
        self.assertIn("sg-last", output)

    def test_library_name_and_displayed_values_are_html_escaped(self):
        css = """
        :root {
          --sg-primary: #123456;
          --sg-font-body: 'A&<Font>';
          --sg-radius-md: 10px&quot; onclick=&quot;alert(1);
        }
        @media (max-width: 640px) and (width < 900px) { .sg-card { display:block; } }
        """
        temp, lib = self._make_library(name="demo & <unsafe>", files={"library.css": css})
        self.addCleanup(temp.cleanup)
        output = generate_showcase(lib)
        self.assertIn("demo &amp; &lt;unsafe&gt;", output)
        self.assertNotIn("<unsafe>", output)
        self.assertIn("A&amp;&lt;Font&gt;", output)
        self.assertIn("width &lt; 900px", output)


if __name__ == "__main__":
    unittest.main(verbosity=2)
