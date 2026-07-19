"""UI-IR v2 转换、关系提升和完整性验证测试。"""

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "src"))

from ui_dismantler.uiir.extraction.css_media import extract_css_media_blocks, parse_css_media_blocks  # noqa: E402
from ui_dismantler.cli.manifest_to_uiir import main as convert_main  # noqa: E402
from ui_dismantler.uiir.runtime.runtime_refs import observe_runtime_references  # noqa: E402
from ui_dismantler.uiir.extraction.source_refs import extract_source_references, resolve_dom_selector  # noqa: E402
from ui_dismantler.cli.uiir_diff import main as diff_main  # noqa: E402
from ui_dismantler.cli.uiir_to_compact import main as compact_main  # noqa: E402
from ui_dismantler.cli.uiir_to_expanded import main as expanded_main  # noqa: E402
from ui_dismantler.cli.uiir_to_manifest import main as reverse_main  # noqa: E402
from ui_dismantler.uiir.model import (  # noqa: E402
    NODE_TYPES,
    RELATION_TYPES,
    diff_uiir_observation,
    expand_uiir_evidence,
    manifest_to_uiir,
    parse_responsive_change,
    uiir_to_compact_observation,
    uiir_to_expanded_observation,
    uiir_to_manifest,
    validate_uiir,
)

_ROOT = Path(__file__).resolve().parents[2]
_BASELINES = _ROOT / "docs" / "baselines" / "manifests"


def _load(name):
    return json.loads((_BASELINES / name).read_text(encoding="utf-8"))


def _typed_nodes(uiir, node_type):
    type_index = uiir["nodeTypes"].index(node_type)
    return [node for node in uiir["nodes"] if node[1] == type_index]


def _typed_edges(uiir, relation):
    relation_index = uiir["relationTypes"].index(relation)
    return [edge for edge in uiir["edges"] if edge[1] == relation_index]


class TestCSSMediaExtraction(unittest.TestCase):
    def test_parses_direct_property_changes_and_source_spans(self):
        css = """
        .card { display: grid; gap: 12px; background: url(data:image/svg+xml;a:b); }
        @media (max-width: 500px) {
          .card { display: block; gap: 8px; color: red; }
        }
        @keyframes pulse { from { opacity: 0; } to { opacity: 1; } }
        """
        blocks = parse_css_media_blocks(css, source="case.css")
        self.assertEqual(len(blocks), 1)
        changes = {item["property"]: item for item in blocks[0]["changes"]}
        self.assertEqual(changes["display"]["from"], "grid")
        self.assertEqual(changes["display"]["to"], "block")
        self.assertEqual(changes["gap"]["from"], "12px")
        self.assertIsNone(changes["color"]["from"])
        self.assertEqual(changes["color"]["confidence"], 0.85)
        start, end = changes["display"]["sourceSpan"]
        self.assertIn("display: block", css[start:end])
        self.assertNotIn("opacity", changes)

    def test_extracts_inline_and_local_linked_stylesheets(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "site.css").write_text(
                ".x{display:flex}@media (max-width:400px){.x{display:block}}",
                encoding="utf-8",
            )
            html = root / "index.html"
            html.write_text(
                '<link rel="stylesheet" href="site.css">'
                '<style>.y{font-size:16px}@media (max-width:300px){.y{font-size:12px}}</style>',
                encoding="utf-8",
            )
            blocks, warnings = extract_css_media_blocks(html)
            self.assertEqual(warnings, [])
            self.assertEqual([block["breakpoint"] for block in blocks], [
                "(max-width:400px)", "(max-width:300px)"
            ])
            self.assertEqual(blocks[0]["changes"][0]["from"], "flex")
            start, end = blocks[1]["changes"][0]["sourceSpan"]
            self.assertIn("font-size:12px", html.read_text(encoding="utf-8")[start:end])

    def test_shares_default_context_across_linked_and_inline_css(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "base.css").write_text(".shell { display: grid; }", encoding="utf-8")
            html = root / "index.html"
            html.write_text(
                '<link rel="stylesheet" href="base.css">'
                '<style>@supports (display:grid) {'
                '@media (max-width:600px) {.shell { display:block }}'
                '}</style>',
                encoding="utf-8",
            )
            blocks, warnings = extract_css_media_blocks(html)
            self.assertEqual(warnings, [])
            self.assertEqual(len(blocks), 1)
            change = blocks[0]["changes"][0]
            self.assertEqual((change["from"], change["to"]), ("grid", "block"))
            self.assertEqual(change["confidence"], 1.0)
            self.assertTrue(blocks[0]["source"].endswith("index.html"))
            self.assertTrue(change["defaultSourceSpan"])

    def test_root_relative_stylesheet_resolves_against_nearest_project_ancestor(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "shared").mkdir()
            (root / "pages").mkdir()
            (root / "shared" / "site.css").write_text(
                ".shell{display:grid}@media(max-width:640px){.shell{display:block}}",
                encoding="utf-8",
            )
            html = root / "pages" / "index.html"
            html.write_text('<link rel="stylesheet" href="/shared/site.css">', encoding="utf-8")
            blocks, warnings = extract_css_media_blocks(html)
            self.assertEqual(warnings, [])
            self.assertEqual(len(blocks), 1)
            self.assertEqual(blocks[0]["changes"][0]["from"], "grid")
            self.assertTrue(blocks[0]["source"].endswith("/shared/site.css"))

    def test_missing_local_stylesheet_warns_without_blocking_inline_css(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text(
                '<link rel="stylesheet" href="missing.css">'
                '<style>@media print {.x { display:none }}</style>',
                encoding="utf-8",
            )
            blocks, warnings = extract_css_media_blocks(html)
            self.assertEqual(len(blocks), 1)
            self.assertEqual(blocks[0]["breakpoint"], "print")
            self.assertEqual(blocks[0]["changes"][0]["to"], "none")
            self.assertEqual(len(warnings), 1)
            self.assertIn("missing.css", warnings[0])


class TestSourceReferenceExtraction(unittest.TestCase):
    def test_extracts_dom_spans_local_js_selectors_and_event_chains(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            script = root / "app.js"
            script.write_text(
                'const save = document.getElementById("save");\n'
                'save.addEventListener("click", function(){});\n'
                'document.querySelectorAll(".item").forEach(function(item){'
                'item.onfocus=function(){};});',
                encoding="utf-8",
            )
            html = root / "index.html"
            html.write_text(
                '<button id="save" class="primary" onclick="submitForm()">保存</button>'
                '<div class="item"></div><script src="app.js"></script>',
                encoding="utf-8",
            )
            index, warnings = extract_source_references(html)
            self.assertEqual(warnings, [])
            save = resolve_dom_selector(index["elements"], "#save")
            self.assertEqual(len(save["matches"]), 1)
            start, end = save["matches"][0]["sourceSpan"]
            self.assertIn('id="save"', html.read_text(encoding="utf-8")[start:end])

            selectors = {item["selector"] for item in index["selectorReferences"]}
            self.assertEqual(selectors, {"#save", ".item"})
            bindings = {(item["selector"], item["event"], item["api"])
                        for item in index["eventBindings"]}
            self.assertIn(("#save", "click", "html-event-attribute"), bindings)
            self.assertIn(("#save", "click", "variable.addEventListener"), bindings)
            self.assertIn((".item", "focus", "querySelectorAll.forEach-event"), bindings)
            js_binding = next(
                item for item in index["eventBindings"]
                if item["api"] == "variable.addEventListener"
            )
            js_text = script.read_text(encoding="utf-8")
            start, end = js_binding["sourceSpan"]
            self.assertIn('save.addEventListener("click"', js_text[start:end])

    def test_array_from_and_spread_collections_resolve_foreach_bindings(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text(
                '<button class="filter"></button><a class="toc"></a><script>'
                'const filters=Array.from(document.querySelectorAll(".filter"));'
                'filters.forEach(button=>button.addEventListener("click",()=>{}));'
                'const links=[...document.querySelectorAll(".toc")];'
                'links.forEach(link=>link.onclick=()=>{});'
                '</script>',
                encoding="utf-8",
            )
            index, warnings = extract_source_references(html)
            self.assertEqual(warnings, [])
            bindings = {
                (item["selector"], item["event"], item["api"])
                for item in index["eventBindings"]
            }
            self.assertIn((".filter", "click", "variable.forEach-event"), bindings)
            self.assertIn((".toc", "click", "variable.forEach-event"), bindings)

    def test_variable_bindings_use_latest_preceding_static_assignment(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text(
                '<button id="first"></button><button id="second"></button><script>'
                'let target=document.getElementById("first");target.onclick=function(){};'
                'target=document.getElementById("second");target.onfocus=function(){};'
                '</script>',
                encoding="utf-8",
            )
            index, warnings = extract_source_references(html)
            self.assertEqual(warnings, [])
            bindings = {
                (item["selector"], item["event"])
                for item in index["eventBindings"]
                if item["api"] == "variable.on-property"
            }
            self.assertEqual(bindings, {("#first", "click"), ("#second", "focus")})

    def test_selector_resolution_supports_id_class_attribute_and_scoped_tail(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text(
                '<nav class="nav"><button id="home" class="n active" data-p="home"></button>'
                '<button class="n" data-p="story"></button></nav>',
                encoding="utf-8",
            )
            index, _ = extract_source_references(html)
            self.assertEqual(len(resolve_dom_selector(index["elements"], "home")["matches"]), 1)
            self.assertEqual(len(resolve_dom_selector(index["elements"], ".n")["matches"]), 2)
            scoped = resolve_dom_selector(index["elements"], '.nav [data-p="story"]')
            self.assertEqual(len(scoped["matches"]), 1)
            self.assertEqual(scoped["confidence"], 0.85)

    def test_conversion_adds_source_only_interactions_without_breaking_roundtrip(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text(
                '<button id="save">保存</button><script>'
                'document.getElementById("save").addEventListener("click",()=>{});'
                '</script>',
                encoding="utf-8",
            )
            manifest = {
                "schemaVersion": "1.0",
                "meta": {"title": "case", "source": str(html)},
                "theme": {"tokens": [], "gradients": []},
                "structure": {
                    "pattern": "single", "tabs": [], "views": [],
                    "modals": [], "storyPanels": [],
                },
                "data": {}, "interactions": [], "responsive": [],
                "a11y": {}, "warnings": [],
            }
            uiir = manifest_to_uiir(manifest)
            self.assertEqual(validate_uiir(uiir), [])
            source_states = [
                node for node in _typed_nodes(uiir, "state")
                if node[3].get("sourceOnly")
            ]
            self.assertEqual(len(source_states), 1)
            trigger = next(edge for edge in _typed_edges(uiir, "triggers")
                           if edge[2] == source_states[0][0])
            target = uiir["nodes"][trigger[0]]
            self.assertEqual(target[3]["reference"], "#save")
            observations = expand_uiir_evidence(uiir)[str(target[0])]["observations"]
            self.assertTrue(any(item["method"] == "dom-static" for item in observations))
            self.assertTrue(any(item["method"] == "js-selector-static" for item in observations))
            self.assertEqual(uiir_to_manifest(uiir), manifest)
            self.assertEqual(uiir["diagnostics"]["sourceReferences"]["eventBindings"], 1)

            no_refs = manifest_to_uiir(manifest, use_source_refs=False)
            self.assertFalse(any(node[3].get("sourceOnly")
                                 for node in _typed_nodes(no_refs, "state")))
            self.assertNotIn("sourceReferences", no_refs["diagnostics"])

    def test_root_relative_script_resolves_against_nearest_project_ancestor(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "shared").mkdir()
            (root / "pages").mkdir()
            script = root / "shared" / "nav.js"
            script.write_text(
                'document.getElementById("menu").addEventListener("click",()=>{});',
                encoding="utf-8",
            )
            html = root / "pages" / "index.html"
            html.write_text(
                '<button id="menu"></button><script src="/shared/nav.js"></script>',
                encoding="utf-8",
            )
            index, warnings = extract_source_references(html)
            self.assertEqual(warnings, [])
            binding = index["eventBindings"][0]
            self.assertEqual((binding["selector"], binding["event"]), ("#menu", "click"))
            self.assertEqual(binding["source"], str(script.resolve()))

    def test_missing_local_script_is_warning_not_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text('<script src="missing.js"></script>', encoding="utf-8")
            index, warnings = extract_source_references(html)
            self.assertEqual(index["selectorReferences"], [])
            self.assertEqual(len(warnings), 1)
            self.assertIn("missing.js", warnings[0])


class TestRuntimeReferenceObservation(unittest.TestCase):
    @staticmethod
    def _manifest(source):
        return {
            "schemaVersion": "1.0",
            "meta": {"title": "runtime case", "source": str(source)},
            "theme": {"tokens": [], "gradients": []},
            "structure": {
                "pattern": "single", "tabs": [], "views": [],
                "modals": [], "storyPanels": [],
            },
            "data": {}, "interactions": [], "responsive": [],
            "a11y": {}, "warnings": [],
        }

    def test_browser_observes_listener_source_and_bounded_invocation(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text(
                '<button id="save">保存</button>\n'
                '<script>\n'
                'const button = document.getElementById("save");\n'
                'button.addEventListener("click", () => { window.hit = (window.hit || 0) + 1; });\n'
                '</script>\n',
                encoding="utf-8",
            )
            result, warnings = observe_runtime_references(
                html, exercise=True, timeout_ms=5000, settle_ms=0, max_exercises=4
            )
            if not result.get("browser"):
                self.skipTest("Playwright 浏览器不可用：" + " | ".join(warnings))
            self.assertEqual(warnings, [])
            registration = next(
                item for item in result["registrations"]
                if item["selector"] == "#save" and item["event"] == "click"
            )
            self.assertEqual(registration["api"], "addEventListener")
            self.assertGreaterEqual(registration["invocationCount"], 1)
            self.assertGreaterEqual(result["exercised"], 1)
            start, end = registration["sourceSpan"]
            self.assertIn(
                'button.addEventListener("click"',
                html.read_text(encoding="utf-8")[start:end],
            )

    def test_browser_fulfills_root_relative_local_resources_from_project_ancestor(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "shared").mkdir()
            (root / "pages").mkdir()
            (root / "shared" / "app.js").write_text(
                'document.getElementById("open").addEventListener("click",()=>{'
                'document.getElementById("panel").hidden=false;});',
                encoding="utf-8",
            )
            html = root / "pages" / "index.html"
            html.write_text(
                '<button id="open">打开</button><div id="panel" hidden>面板</div>'
                '<script src="/shared/app.js"></script>',
                encoding="utf-8",
            )
            result, warnings = observe_runtime_references(
                html,
                actions=[{"action": "click", "selector": "#open", "assertions": [
                    {"assertion": "visible", "selector": "#panel"}
                ]}],
            )
            if not result.get("browser"):
                self.skipTest("Playwright 浏览器不可用：" + " | ".join(warnings))
            self.assertEqual(warnings, [])
            self.assertEqual(result["errors"], [])
            self.assertEqual(result["coverage"]["assertions"]["passed"], 1)
            self.assertTrue(any(
                item["selector"] == "#open" and item["event"] == "click"
                for item in result["registrations"]
            ))

    def test_trusted_actions_invoke_listener_and_property_handlers(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text(
                '<button id="save">保存</button><input id="title">'
                '<script>window.hits=0;'
                'const save=document.getElementById("save");'
                'save.onclick=()=>window.hits++;'
                'save.addEventListener("click",()=>window.hits++);'
                'document.getElementById("title").addEventListener("input",()=>window.hits++);'
                '</script>',
                encoding="utf-8",
            )
            result, warnings = observe_runtime_references(
                html,
                actions=[
                    {"action": "click", "selector": "#save"},
                    {"action": "fill", "selector": "#title", "value": "private value"},
                ],
            )
            if not result.get("browser"):
                self.skipTest("Playwright 浏览器不可用：" + " | ".join(warnings))
            self.assertEqual(warnings, [])
            self.assertEqual(result["trustedActions"], 2)
            self.assertEqual(result["failedActions"], 0)
            self.assertTrue(all(item["status"] == "completed" for item in result["actions"]))
            self.assertNotIn("private value", json.dumps(result["actions"], ensure_ascii=False))
            registrations = {
                (item["selector"], item["event"], item["api"]): item
                for item in result["registrations"]
            }
            self.assertGreaterEqual(
                registrations[("#save", "click", "addEventListener")]["invocationCount"], 1
            )
            self.assertGreaterEqual(
                registrations[("#save", "click", "property-handler")]["invocationCount"], 1
            )
            self.assertGreaterEqual(
                registrations[("#title", "input", "addEventListener")]["invocationCount"], 1
            )
            self.assertTrue(all(
                item["runtimeMode"] == "trusted-replay"
                for item in result["registrations"]
            ))

    def test_trusted_action_path_tracks_dynamically_created_property_handler(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text(
                '<button id="open">打开</button><div id="host"></div><script>'
                'document.getElementById("open").onclick=()=>{'
                'const late=document.createElement("button");late.id="late";'
                'late.onclick=()=>{window.lateHit=true};late.textContent="后续";'
                'document.getElementById("host").appendChild(late);};'
                '</script>',
                encoding="utf-8",
            )
            result, warnings = observe_runtime_references(
                html,
                actions=[
                    {"action": "click", "selector": "#open"},
                    {"action": "click", "selector": "#late"},
                ],
            )
            if not result.get("browser"):
                self.skipTest("Playwright 浏览器不可用：" + " | ".join(warnings))
            self.assertEqual(warnings, [])
            self.assertEqual(result["trustedActions"], 2)
            late = next(
                item for item in result["registrations"]
                if item["selector"] == "#late"
                and item["event"] == "click"
                and item["api"] == "property-handler"
            )
            self.assertGreaterEqual(late["invocationCount"], 1)

    def test_scenarios_conditions_assertions_and_coverage_are_isolated(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text(
                '<button id="go">Go</button><div id="done" hidden>Done</div>'
                '<script>go.onclick=()=>{done.hidden=false;done.className="ready"}</script>',
                encoding="utf-8",
            )
            result, warnings = observe_runtime_references(
                html,
                settle_ms=0,
                scenarios=[
                    {
                        "id": "open",
                        "when": {"condition": "visible", "selector": "#go"},
                        "actions": [{
                            "action": "click",
                            "selector": "#go",
                            "assertions": [
                                {"assertion": "visible", "selector": "#done"},
                                {
                                    "assertion": "attribute", "selector": "#done",
                                    "name": "class", "equals": "ready",
                                },
                            ],
                        }],
                        "assertions": [{
                            "assertion": "text", "selector": "#done", "contains": "Done",
                        }],
                    },
                    {
                        "id": "fresh-context",
                        "assertions": [{"assertion": "hidden", "selector": "#done"}],
                    },
                    {
                        "id": "not-applicable",
                        "when": {"condition": "exists", "selector": "#missing"},
                        "actions": [{"action": "click", "selector": "#go"}],
                    },
                ],
            )
            if not result.get("browser"):
                self.skipTest("Playwright 浏览器不可用：" + " | ".join(warnings))
            self.assertEqual(warnings, [])
            scenarios = {item["id"]: item for item in result["scenarios"]}
            self.assertEqual(scenarios["open"]["status"], "completed")
            self.assertEqual(scenarios["fresh-context"]["status"], "completed")
            self.assertEqual(scenarios["not-applicable"]["status"], "skipped")
            self.assertEqual(result["coverage"]["scenarios"], {
                "total": 3, "completed": 2, "failed": 0, "skipped": 1,
            })
            self.assertEqual(result["coverage"]["assertions"], {
                "total": 4, "passed": 4, "failed": 0,
            })
            self.assertEqual(result["coverage"]["conditions"], {
                "total": 2, "passed": 1, "failed": 1,
            })
            registration = next(
                item for item in result["registrations"]
                if item["selector"] == "#go" and item["event"] == "click"
            )
            self.assertEqual(
                registration["scenarioIds"],
                ["fresh-context", "not-applicable", "open"],
            )
            self.assertEqual(registration["invokedScenarioIds"], ["open"])

    def test_scenario_failure_replay_is_value_redacted(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text('<input id="name"><div id="result"></div>', encoding="utf-8")
            secret = "do-not-copy-this-value"
            result, warnings = observe_runtime_references(
                html,
                settle_ms=0,
                scenarios=[{
                    "id": "failed-form",
                    "stopOnFailure": True,
                    "actions": [{
                        "action": "fill", "selector": "#name", "value": secret,
                        "assertions": [{"assertion": "visible", "selector": "#missing"}],
                    }],
                }],
            )
            if not result.get("browser"):
                self.skipTest("Playwright 浏览器不可用：" + " | ".join(warnings))
            self.assertEqual(warnings, [])
            self.assertEqual(result["scenarios"][0]["status"], "failed")
            self.assertEqual(result["failedAssertions"], 1)
            self.assertEqual(result["failureReplay"][0]["scenarioId"], "failed-form")
            self.assertEqual(result["failureReplay"][0]["kind"], "action-assertion")
            self.assertTrue(result["failureReplay"][0]["requiresOriginalInput"])
            self.assertNotIn(secret, json.dumps(result, ensure_ascii=False))

    def test_failed_fill_redacts_value_from_playwright_error(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text('<input id="name" hidden>', encoding="utf-8")
            secret = 'never-"emit"\nthis-secret'
            result, warnings = observe_runtime_references(
                html,
                settle_ms=0,
                actions=[{
                    "action": "fill", "selector": "#name", "value": secret,
                    "timeoutMs": 100,
                }],
            )
            if not result.get("browser"):
                self.skipTest("Playwright 浏览器不可用：" + " | ".join(warnings))
            serialized = json.dumps(result, ensure_ascii=False)
            self.assertNotIn("never-", serialized)
            self.assertNotIn("this-secret", serialized)
            self.assertIn("[REDACTED]", serialized)

    def test_action_condition_can_skip_without_becoming_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text('<button id="go">Go</button>', encoding="utf-8")
            result, warnings = observe_runtime_references(
                html,
                settle_ms=0,
                scenarios=[{
                    "id": "conditional",
                    "actions": [{
                        "action": "click", "selector": "#go",
                        "when": {"condition": "exists", "selector": "#missing"},
                    }],
                }],
            )
            if not result.get("browser"):
                self.skipTest("Playwright 浏览器不可用：" + " | ".join(warnings))
            self.assertEqual(warnings, [])
            self.assertEqual(result["scenarios"][0]["status"], "completed")
            self.assertEqual(result["actions"][0]["status"], "skipped")
            self.assertEqual(result["skippedActions"], 1)
            self.assertEqual(result["failedActions"], 0)

    def test_invalid_conditions_fail_instead_of_being_treated_as_skips(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text('<button id="go">Go</button>', encoding="utf-8")
            result, warnings = observe_runtime_references(
                html,
                settle_ms=0,
                scenarios=[
                    {
                        "id": "bad-scenario-condition",
                        "when": {"condition": "visible"},
                        "actions": [{"action": "click", "selector": "#go"}],
                    },
                    {
                        "id": "bad-action-condition",
                        "actions": [{
                            "action": "click",
                            "selector": "#go",
                            "when": {"condition": "unknown", "selector": "#go"},
                        }],
                    },
                ],
            )
            if not result.get("browser"):
                self.skipTest("Playwright 浏览器不可用：" + " | ".join(warnings))
            self.assertEqual(warnings, [])
            scenarios = {item["id"]: item for item in result["scenarios"]}
            self.assertEqual(scenarios["bad-scenario-condition"]["status"], "failed")
            self.assertEqual(scenarios["bad-action-condition"]["status"], "failed")
            self.assertEqual(result["actions"][0]["status"], "failed")
            self.assertEqual(
                {item["kind"] for item in result["failureReplay"]},
                {"condition", "action-condition"},
            )

    def test_duplicate_scenario_ids_and_rule_limit_fail_explicitly(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text('<button id="go">Go</button>', encoding="utf-8")
            result, warnings = observe_runtime_references(
                html,
                settle_ms=0,
                max_assertions=1,
                scenarios=[
                    {
                        "id": "same",
                        "assertions": [{"assertion": "visible", "selector": "#go"}],
                    },
                    {"id": "same"},
                    {
                        "id": "limited",
                        "assertions": [{"assertion": "exists", "selector": "#go"}],
                    },
                ],
            )
            if not result.get("browser"):
                self.skipTest("Playwright 浏览器不可用：" + " | ".join(warnings))
            self.assertTrue(any("断言受总上限限制" in warning for warning in warnings))
            self.assertEqual(
                [item["status"] for item in result["scenarios"]],
                ["completed", "failed", "failed"],
            )
            self.assertEqual(result["coverage"]["scenarios"]["failed"], 2)
            self.assertEqual(result["coverage"]["assertions"], {
                "total": 2, "passed": 1, "failed": 1,
            })
            self.assertEqual(
                [item["kind"] for item in result["failureReplay"]],
                ["scenario", "assertion"],
            )

    def test_invalid_trusted_actions_are_bounded_failures(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text('<button class="duplicate"></button><button class="duplicate"></button>', encoding="utf-8")
            result, warnings = observe_runtime_references(
                html,
                actions=[
                    {"action": "eval", "selector": "body"},
                    {"action": "click", "selector": ".missing"},
                    {"action": "click", "selector": ".duplicate", "index": 1},
                ],
                max_actions=2,
            )
            if not result.get("browser"):
                self.skipTest("Playwright 浏览器不可用：" + " | ".join(warnings))
            self.assertEqual(result["trustedActions"], 0)
            self.assertEqual(result["failedActions"], 2)
            self.assertEqual(len(result["actions"]), 2)
            self.assertTrue(any("仅执行前 2 条" in warning for warning in warnings))
            self.assertTrue(any("不支持" in item.get("error", "") for item in result["actions"]))
            self.assertTrue(any("仅命中 0 个" in item.get("error", "") for item in result["actions"]))

    def test_page_script_error_is_captured_without_failing_collection(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text(
                '<main></main><script>setTimeout(() => { throw new Error("runtime boom"); }, 0)</script>',
                encoding="utf-8",
            )
            result, warnings = observe_runtime_references(
                html, timeout_ms=5000, settle_ms=50
            )
            if not result.get("browser"):
                self.skipTest("Playwright 浏览器不可用：" + " | ".join(warnings))
            self.assertEqual(warnings, [])
            self.assertTrue(any("runtime boom" in error for error in result["errors"]))

    def test_candidate_inventory_and_state_graph_are_bounded_and_value_free(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text(
                '<style>[hidden]{display:none}</style>'
                '<button id="toggle" aria-expanded="false">切换</button>'
                '<input id="query" type="search"><input id="secret" type="password">'
                '<a id="next" href="#next">下一页</a><div id="panel" hidden></div>'
                '<script>document.getElementById("toggle").addEventListener("click",()=>{'
                'document.getElementById("panel").hidden=false;'
                'document.getElementById("toggle").setAttribute("aria-expanded","true");});'
                '</script>',
                encoding="utf-8",
            )
            result, warnings = observe_runtime_references(
                html,
                actions=[
                    {"action": "fill", "selector": "#query", "value": "private-query"},
                    {"action": "fill", "selector": "#secret", "value": "private-secret"},
                    {"action": "click", "selector": "#toggle"},
                ],
                max_candidates=4,
            )
            if not result.get("browser"):
                self.skipTest("Playwright 浏览器不可用：" + " | ".join(warnings))
            self.assertEqual(warnings, [])
            self.assertEqual(len(result["candidates"]), 4)
            candidates = {(item["selector"], item["action"]): item for item in result["candidates"]}
            self.assertTrue(candidates[("#query", "fill")]["requiresInput"])
            self.assertTrue(candidates[("#secret", "fill")]["sensitiveInput"])
            self.assertTrue(candidates[("#next", "click")]["navigationRisk"])
            self.assertEqual(result["coverage"]["candidates"]["discovered"], 4)
            self.assertGreaterEqual(len(result["stateGraph"]["nodes"]), 3)
            self.assertEqual(len(result["stateGraph"]["edges"]), 3)
            self.assertTrue(result["actions"][-1]["stateChanged"])
            self.assertNotEqual(
                result["scenarios"][0]["initialState"],
                result["scenarios"][0]["finalState"],
            )
            serialized = json.dumps(result, ensure_ascii=False)
            self.assertNotIn("private-query", serialized)
            self.assertNotIn("private-secret", serialized)

    def test_invalid_timeout_and_missing_source_degrade_to_warnings(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text("<main></main>", encoding="utf-8")
            result, warnings = observe_runtime_references(html, timeout_ms=50)
            self.assertIsNone(result["browser"])
            self.assertEqual(result["registrations"], [])
            self.assertTrue(any("timeout_ms" in warning for warning in warnings))

            missing_result, missing_warnings = observe_runtime_references(Path(temp) / "missing.html")
            self.assertIsNone(missing_result["browser"])
            self.assertTrue(any("不存在" in warning for warning in missing_warnings))

    def test_runtime_registration_merges_static_state_and_preserves_roundtrip(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text(
                '<button id="save">保存</button><script>\n'
                'document.getElementById("save").addEventListener("click",()=>{});\n'
                '</script>',
                encoding="utf-8",
            )
            manifest = self._manifest(html)
            runtime = {
                "source": str(html), "browser": "chromium", "domCount": 4,
                "registrations": [{
                    "selector": "#save", "event": "click", "api": "addEventListener",
                    "source": str(html), "sourceSpan": [45, 112],
                    "runtimeLine": 2, "runtimeColumn": 1, "options": {"capture": False},
                    "invocationCount": 1, "runtimeMode": "trusted-replay",
                    "scenarioIds": ["save-flow"],
                    "invokedScenarioIds": ["save-flow"],
                }],
                "errors": [], "exercised": 1,
                "actions": [{"index": 0, "action": "click", "selector": "#save", "status": "completed", "matched": 1, "scenarioId": "save-flow"}],
                "scenarios": [{
                    "id": "save-flow", "status": "completed", "conditions": [],
                    "actions": [], "assertions": [], "trustedActions": 1,
                    "failedActions": 0, "skippedActions": 0,
                    "passedAssertions": 1, "failedAssertions": 0,
                    "registrations": 1, "invokedRegistrations": 1, "errors": [],
                }],
                "trustedActions": 1, "failedActions": 0, "skippedActions": 0,
                "passedAssertions": 1, "failedAssertions": 0,
                "failureReplay": [],
                "candidates": [{
                    "selector": "#save", "action": "click", "tag": "button",
                    "type": "", "role": "", "visible": True, "disabled": False,
                    "requiresInput": False, "sensitiveInput": False,
                    "navigationRisk": False, "inlineHandler": False,
                    "events": ["click"], "scenarioIds": ["save-flow"],
                }],
                "stateGraph": {
                    "nodes": [{
                        "id": "state:before", "activeSelector": "", "locationHash": "",
                        "visibleCandidates": 1, "checkedCandidates": 0,
                        "disabledCandidates": 0, "expandedCandidates": 0,
                        "scenarioIds": ["save-flow"], "observations": 1,
                    }],
                    "edges": [],
                },
                "coverage": {
                    "scenarios": {"total": 1, "completed": 1, "failed": 0, "skipped": 0},
                    "actions": {"total": 1, "completed": 1, "failed": 0, "skipped": 0},
                    "assertions": {"total": 1, "passed": 1, "failed": 0},
                    "conditions": {"total": 0, "passed": 0, "failed": 0},
                    "registrations": {"registered": 1, "invoked": 1, "ratio": 1.0},
                },
            }
            with patch("ui_dismantler.uiir.conversion.manifest_to_uiir.observe_runtime_references", return_value=(runtime, [])):
                uiir = manifest_to_uiir(
                    manifest, use_runtime_refs=True, runtime_exercise=True
                )
                repeated = manifest_to_uiir(
                    manifest, use_runtime_refs=True, runtime_exercise=True
                )
            self.assertEqual(uiir, repeated)
            self.assertEqual(validate_uiir(uiir), [])
            states = [
                node for node in _typed_nodes(uiir, "state")
                if node[3].get("sourceOnly") and node[3].get("trigger") == "click"
            ]
            self.assertEqual(len(states), 1)
            state = states[0]
            self.assertTrue(state[3]["runtimeObserved"])
            self.assertTrue(state[3]["runtimeInvoked"])
            self.assertFalse(state[3].get("runtimeOnly", False))
            observations = expand_uiir_evidence(uiir)[str(state[0])]["observations"]
            methods = {item["method"] for item in observations}
            self.assertIn("browser-listener-registration", methods)
            self.assertIn("browser-event-invocation", methods)
            runtime_observation = next(
                item for item in observations
                if item["method"] == "browser-listener-registration"
            )
            self.assertEqual(runtime_observation["runtimeMatch"], "selector-exact")
            self.assertEqual(runtime_observation["invocationCount"], 1)
            self.assertEqual(runtime_observation["runtimeMode"], "trusted-replay")
            self.assertEqual(runtime_observation["runtimeScenarios"], ["save-flow"])
            self.assertEqual(runtime_observation["invokedRuntimeScenarios"], ["save-flow"])
            self.assertEqual(uiir["diagnostics"]["runtimeReferences"]["registrations"], 1)
            self.assertEqual(uiir["diagnostics"]["runtimeReferences"]["trustedActions"], 1)
            self.assertEqual(uiir["diagnostics"]["runtimeReferences"]["failedActions"], 0)
            self.assertEqual(uiir["diagnostics"]["runtimeReferences"]["invokedRegistrations"], 1)
            runtime_diagnostics = uiir["diagnostics"]["runtimeReferences"]
            self.assertEqual(runtime_diagnostics["passedAssertions"], 1)
            self.assertEqual(runtime_diagnostics["coverage"]["registrations"]["ratio"], 1.0)
            self.assertEqual(runtime_diagnostics["candidates"][0]["selector"], "#save")
            self.assertEqual(runtime_diagnostics["stateGraph"]["nodes"][0]["id"], "state:before")
            self.assertEqual(runtime_diagnostics["scenarios"][0]["id"], "save-flow")
            self.assertEqual(uiir_to_manifest(uiir), manifest)

    def test_same_selector_event_registrations_match_distinct_static_source_spans(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            source_text = (
                '<script>\n'
                'window.addEventListener("resize", () => { window.first = true; });\n'
                'window.addEventListener("resize", () => { window.second = true; });\n'
                '</script>\n'
            )
            html.write_text(source_text, encoding="utf-8")
            first_start = source_text.index('window.addEventListener')
            first_end = source_text.index('\n', first_start) + 1
            second_start = source_text.index('window.addEventListener', first_end)
            second_end = source_text.index('\n', second_start) + 1
            manifest = self._manifest(html)
            runtime = {
                "source": str(html), "browser": "chromium", "domCount": 3,
                "registrations": [
                    {
                        "selector": "window", "event": "resize", "api": "addEventListener",
                        "source": str(html), "sourceSpan": [first_start, first_end],
                        "runtimeLine": 2, "runtimeColumn": 1, "options": {},
                        "invocationCount": 0,
                    },
                    {
                        "selector": "window", "event": "resize", "api": "addEventListener",
                        "source": str(html), "sourceSpan": [second_start, second_end],
                        "runtimeLine": 3, "runtimeColumn": 1, "options": {},
                        "invocationCount": 0,
                    },
                ],
                "errors": [], "exercised": 0,
            }
            with patch("ui_dismantler.uiir.conversion.manifest_to_uiir.observe_runtime_references", return_value=(runtime, [])):
                uiir = manifest_to_uiir(manifest, use_runtime_refs=True)
            states = [
                node for node in _typed_nodes(uiir, "state")
                if node[3].get("sourceOnly") and node[3].get("trigger") == "resize"
            ]
            self.assertEqual(len(states), 2)
            self.assertTrue(all(node[3].get("runtimeObserved") for node in states))
            expanded = expand_uiir_evidence(uiir)
            registration_spans = []
            for state in states:
                observations = expanded[str(state[0])]["observations"]
                runtime_observations = [
                    item for item in observations
                    if item["method"] == "browser-listener-registration"
                ]
                self.assertEqual(len(runtime_observations), 1)
                registration_spans.append(runtime_observations[0]["sourceSpan"])
            self.assertEqual(
                sorted(registration_spans),
                sorted([[first_start, first_end], [second_start, second_end]]),
            )

    def test_runtime_only_state_is_excluded_from_compatibility_projections(self):
        with tempfile.TemporaryDirectory() as temp:
            html = Path(temp) / "index.html"
            html.write_text('<button class="dynamic">动态</button>', encoding="utf-8")
            manifest = self._manifest(html)
            runtime = {
                "source": str(html), "browser": "chromium", "domCount": 2,
                "registrations": [{
                    "selector": ".dynamic", "event": "click", "api": "on-property",
                    "source": str(html), "options": {}, "invocationCount": 0,
                }],
                "errors": [], "exercised": 0,
            }
            with patch("ui_dismantler.uiir.conversion.manifest_to_uiir.observe_runtime_references", return_value=(runtime, [])):
                uiir = manifest_to_uiir(manifest, use_runtime_refs=True)
            states = [
                node for node in _typed_nodes(uiir, "state")
                if node[3].get("runtimeOnly")
            ]
            self.assertEqual(len(states), 1)
            self.assertEqual(validate_uiir(uiir), [])
            self.assertEqual(uiir_to_manifest(uiir), manifest)
            compact = uiir_to_compact_observation(uiir)
            self.assertNotIn("runtimeOnly", json.dumps(compact, ensure_ascii=False))


class TestUIIRV2Conversion(unittest.TestCase):
    def test_baselines_convert_to_valid_deterministic_uiir(self):
        for name in ("manifest_huang-yueying.json", "manifest_zhishang-tanbing.json"):
            with self.subTest(name=name):
                manifest = _load(name)
                first = manifest_to_uiir(manifest)
                second = manifest_to_uiir(manifest)
                self.assertEqual(first, second)
                self.assertEqual(validate_uiir(first), [])
                self.assertEqual(first["nodeTypes"], list(NODE_TYPES))
                self.assertEqual(first["relationTypes"], list(RELATION_TYPES))
                keys = [node[3]["key"] for node in first["nodes"]]
                self.assertEqual(len(keys), len(set(keys)))

    def test_cause_chain_is_promoted_to_event_reference_edges(self):
        uiir = manifest_to_uiir(_load("manifest_huang-yueying.json"))
        references = [
            edge for edge in _typed_edges(uiir, "references")
            if len(edge) == 4 and edge[3].get("dataset") == "causeChain"
        ]
        self.assertEqual(len(references), 6)
        node_by_id = {node[0]: node for node in uiir["nodes"]}
        first_source = node_by_id[references[0][0]][3]
        first_target = node_by_id[references[0][2]][3]
        self.assertEqual(first_source["label"], "名士之女")
        self.assertEqual(first_target["label"], "才冠乡里")
        self.assertEqual(references[0][3]["label"], "家世→熏陶")

    def test_tabs_control_views_and_views_bind_datasets(self):
        uiir = manifest_to_uiir(_load("manifest_zhishang-tanbing.json"))
        controls = _typed_edges(uiir, "controls")
        # tabId 与 ariaControls 同时出现时，重复边会被去重。
        self.assertEqual(len(controls), 4)

        nodes = {node[0]: node for node in uiir["nodes"]}
        bindings = _typed_edges(uiir, "binds")
        pairs = {
            (nodes[edge[0]][3].get("kind"), nodes[edge[2]][3].get("name"))
            for edge in bindings
        }
        self.assertIn(("graph", "graphNodes"), pairs)
        self.assertIn(("quiz", "quiz"), pairs)
        self.assertTrue(all(edge[3].get("inferred") for edge in bindings))

    def test_dataset_rows_use_field_table_instead_of_repeating_item_objects(self):
        uiir = manifest_to_uiir(_load("manifest_zhishang-tanbing.json"))
        data_nodes = _typed_nodes(uiir, "data")
        quiz_dataset = next(node for node in data_nodes if node[3].get("name") == "quiz")
        props = quiz_dataset[3]
        self.assertEqual(props["storage"], "table")
        self.assertEqual(props["fields"], ["t", "o", "a", "fb"])
        self.assertEqual(len(props["rows"]), 5)
        self.assertFalse(any(node[3].get("dataset") == "quiz" for node in data_nodes))

    def test_schema_document_is_valid_json_and_tracks_fixed_enums(self):
        schema = json.loads(
            (_ROOT / "src" / "skill" / "references" / "uiir_v2_schema.json").read_text(encoding="utf-8")
        )
        self.assertEqual(schema["properties"]["nodeTypes"]["const"], list(NODE_TYPES))
        self.assertEqual(schema["properties"]["relationTypes"]["const"], list(RELATION_TYPES))
        self.assertTrue(schema["properties"]["strings"]["uniqueItems"])
        evidence_properties = schema["$defs"]["evidenceObservation"]["properties"]
        self.assertEqual(evidence_properties["method"]["$ref"], "#/$defs/stringRef")
        for field in ("api", "event", "binding", "scope", "variable", "runtimeMatch", "runtimeMode"):
            self.assertEqual(evidence_properties[field]["$ref"], "#/$defs/stringRef")
        for field in ("runtimeScenarios", "invokedRuntimeScenarios"):
            self.assertEqual(
                evidence_properties[field]["items"]["$ref"],
                "#/$defs/stringRef",
            )

    def test_tokens_and_breakpoints_become_typed_nodes(self):
        uiir = manifest_to_uiir(_load("manifest_zhishang-tanbing.json"))
        manifest = _load("manifest_zhishang-tanbing.json")
        expected_tokens = len(manifest["theme"]["tokens"]) + len(manifest["theme"]["gradients"])
        self.assertEqual(len(_typed_nodes(uiir, "token")), expected_tokens)
        self.assertEqual(len(_typed_nodes(uiir, "breakpoint")), len(manifest["responsive"]))

    def test_responsive_change_parser_accepts_string_and_structured_forms(self):
        self.assertEqual(
            parse_responsive_change("nav .n font-size: 13.5px → 12.5px"),
            {
                "target": "nav .n",
                "property": "font-size",
                "from": "13.5px",
                "to": "12.5px",
            },
        )
        self.assertEqual(
            parse_responsive_change(
                {
                    "selector": ".card:hover",
                    "property": "--card-gap",
                    "from": "12px",
                    "to": "8px",
                }
            ),
            {
                "target": ".card:hover",
                "property": "--card-gap",
                "from": "12px",
                "to": "8px",
            },
        )
        self.assertIsNone(parse_responsive_change("无法解析的备注"))

    def test_all_baseline_css_media_changes_become_grouped_responds_edges(self):
        for name in ("manifest_huang-yueying.json", "manifest_zhishang-tanbing.json"):
            with self.subTest(name=name):
                manifest = _load(name)
                uiir = manifest_to_uiir(manifest)
                breakpoints = _typed_nodes(uiir, "breakpoint")
                responds = _typed_edges(uiir, "responds")
                expected_changes = sum(node[3].get("cssChangeCount", 0) for node in breakpoints)
                actual_changes = sum(len(edge[3].get("changes") or []) for edge in responds)
                manifest_change_count = sum(
                    len(item.get("changes") or []) for item in manifest["responsive"]
                )
                self.assertEqual(actual_changes, expected_changes)
                self.assertGreater(actual_changes, manifest_change_count)
                self.assertTrue(responds)
                self.assertTrue(
                    all(edge[3].get("method") == "css-media-static" for edge in responds)
                )
                self.assertTrue(
                    all(node[3].get("responsiveSource") == "css-media" for node in breakpoints)
                )
                self.assertFalse(any(node[3].get("changesStructured") for node in breakpoints))

    def test_can_disable_source_css_and_use_manifest_fallback(self):
        manifest = _load("manifest_zhishang-tanbing.json")
        uiir = manifest_to_uiir(manifest, use_source_css=False)
        expected = sum(len(item.get("changes") or []) for item in manifest["responsive"])
        responds = _typed_edges(uiir, "responds")
        actual = sum(len(edge[3].get("changes") or []) for edge in responds)
        self.assertEqual(actual, expected)
        self.assertTrue(all(edge[3].get("inferred") for edge in responds))
        self.assertTrue(
            all(edge[3].get("method") == "responsive-change-parser" for edge in responds)
        )
        self.assertTrue(
            all(
                node[3].get("responsiveSource") == "manifest-fallback"
                for node in _typed_nodes(uiir, "breakpoint")
            )
        )
        self.assertEqual(uiir_to_manifest(uiir), manifest)

    def test_css_evidence_merges_repeated_responsive_targets_with_source_spans(self):
        manifest = _load("manifest_zhishang-tanbing.json")
        uiir = manifest_to_uiir(manifest)
        nav_node = next(
            node for node in _typed_nodes(uiir, "element")
            if node[3].get("reference") == ".nav .n"
        )
        evidence = expand_uiir_evidence(uiir)[str(nav_node[0])]
        self.assertEqual(evidence["source"], manifest["meta"]["source"])
        css_observations = [
            item for item in evidence["observations"]
            if item.get("method") == "css-media-static"
        ]
        self.assertEqual(len(css_observations), 3)
        self.assertTrue(all(item["confidence"] == 1.0 for item in css_observations))
        self.assertEqual(
            {item["mediaQuery"] for item in css_observations},
            {
                "(max-width:520px)",
                "(min-width:396px) and (max-width:520px)",
                "(max-width:330px)",
            },
        )
        source_text = Path(evidence["source"]).read_text(encoding="utf-8")
        for observation in css_observations:
            start, end = observation["sourceSpan"]
            self.assertIn("font-size", source_text[start:end])

    def test_repeated_evidence_strings_are_interned_and_expand_losslessly(self):
        for name in ("manifest_huang-yueying.json", "manifest_zhishang-tanbing.json"):
            with self.subTest(name=name):
                uiir = manifest_to_uiir(_load(name))
                strings = uiir.get("strings") or []
                self.assertTrue(strings)
                self.assertEqual(len(strings), len(set(strings)))
                self.assertEqual(validate_uiir(uiir), [])

                encoded_source = next(iter(uiir["evidence"].values()))["source"]
                self.assertIsInstance(encoded_source, int)
                expanded = expand_uiir_evidence(uiir)
                self.assertTrue(all(
                    isinstance(record.get("source"), str)
                    for record in expanded.values()
                    if "source" in record
                ))

                expanded_document = json.loads(json.dumps(uiir, ensure_ascii=False))
                expanded_document["evidence"] = expanded
                expanded_document.pop("strings", None)
                encoded_size = len(json.dumps(
                    uiir, ensure_ascii=False, separators=(",", ":")
                ).encode("utf-8"))
                expanded_size = len(json.dumps(
                    expanded_document, ensure_ascii=False, separators=(",", ":")
                ).encode("utf-8"))
                self.assertLess(encoded_size, expanded_size * 0.85)

    def test_cli_compact_output_and_check_mode(self):
        source = _BASELINES / "manifest_zhishang-tanbing.json"
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "result.uiir.json"
            self.assertEqual(convert_main([str(source), "-o", str(output)]), 0)
            content = output.read_text(encoding="utf-8")
            self.assertNotIn("\n  ", content)
            self.assertEqual(validate_uiir(json.loads(content)), [])
            self.assertEqual(convert_main([str(source), "--check"]), 0)
            self.assertEqual(convert_main([str(source), "--check", "--no-source-css"]), 0)
            self.assertEqual(convert_main([
                str(source), "--check", "--runtime-observe", "--runtime-timeout", "50"
            ]), 0)
            actions = Path(temp) / "actions.json"
            actions.write_text(
                json.dumps({"actions": [{"action": "focus", "selector": "body"}]}),
                encoding="utf-8",
            )
            self.assertEqual(convert_main([
                str(source), "--check", "--runtime-actions", str(actions)
            ]), 0)
            scenarios = Path(temp) / "scenarios.json"
            scenarios.write_text(json.dumps({"scenarios": [
                {
                    "id": "body-visible",
                    "when": {"condition": "visible", "selector": "body"},
                    "actions": [{"action": "focus", "selector": "body"}],
                    "assertions": [{"assertion": "visible", "selector": "body"}],
                },
                {"id": "not-selected", "actions": []},
            ]}), encoding="utf-8")
            self.assertEqual(convert_main([
                str(source), "--check", "--runtime-actions", str(scenarios),
                "--runtime-scenario", "body-visible",
            ]), 0)
            self.assertEqual(convert_main([
                str(source), "--check", "--runtime-actions", str(scenarios),
                "--runtime-scenario", "missing",
            ]), 1)


class TestUIIRV2Projections(unittest.TestCase):
    def test_baselines_have_exact_manifest_roundtrip(self):
        for name in ("manifest_huang-yueying.json", "manifest_zhishang-tanbing.json"):
            with self.subTest(name=name):
                manifest = _load(name)
                restored = uiir_to_manifest(manifest_to_uiir(manifest))
                self.assertEqual(restored, manifest)

    def test_roundtrip_preserves_null_scalar_mixed_rows_and_unknown_extensions(self):
        manifest = {
            "schemaVersion": "1.0",
            "meta": {
                "source": "/tmp/example.html",
                "title": "混合数据",
                "templateId": None,
                "canvas": {"pc": [800, 600], "wise": None},
            },
            "theme": {
                "tokens": [{"name": "primary", "value": None, "usage": []}],
                "gradients": [],
                "customThemeField": {"mode": "test"},
            },
            "structure": {
                "pattern": None,
                "tabs": [],
                "views": [],
                "modals": [],
                "storyPanels": [],
                "customStructureField": [1, 2],
            },
            "data": {
                "mixed": ["plain", {"value": "object"}, None],
                "single": {"nullable": None},
            },
            "interactions": [{"type": "custom", "target": None, "enabled": False}],
            "responsive": [{"breakpoint": None, "changes": []}],
            "a11y": {"hasDialog": False},
            "warnings": [None, "warning"],
            "customTopField": {"preserve": True},
        }
        restored = uiir_to_manifest(manifest_to_uiir(manifest))
        self.assertEqual(restored, manifest)

    def test_unparsed_responsive_changes_remain_lossless_without_edges(self):
        manifest = {
            "schemaVersion": "1.0",
            "meta": {"source": "/tmp/example.html", "title": "responsive"},
            "theme": {"tokens": [], "gradients": []},
            "structure": {
                "pattern": "test", "tabs": [], "views": [], "modals": [], "storyPanels": []
            },
            "data": {},
            "interactions": [],
            "responsive": [
                {"breakpoint": "(max-width: 400px)", "changes": ["保留这条无法解析的说明"]}
            ],
            "a11y": {},
            "warnings": [],
        }
        uiir = manifest_to_uiir(manifest)
        breakpoint = _typed_nodes(uiir, "breakpoint")[0]
        self.assertEqual(breakpoint[3]["unparsedChangeIndexes"], [0])
        self.assertEqual(_typed_edges(uiir, "responds"), [])
        self.assertEqual(uiir_to_manifest(uiir), manifest)

    def test_compact_observation_is_small_and_explicitly_lossy(self):
        for name in ("manifest_huang-yueying.json", "manifest_zhishang-tanbing.json"):
            with self.subTest(name=name):
                manifest = _load(name)
                compact = uiir_to_compact_observation(manifest_to_uiir(manifest))
                source_bytes = len(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode())
                compact_bytes = len(json.dumps(compact, ensure_ascii=False, separators=(",", ":")).encode())
                self.assertTrue(compact["lossy"])
                self.assertLess(compact_bytes, source_bytes * 0.5)
                self.assertIn("entities", compact)
                self.assertIn("relations", compact)
                self.assertNotIn("responds", [edge[1] for edge in compact["relations"]])
                self.assertNotIn("rows", json.dumps(compact, ensure_ascii=False))

    def test_expanded_observation_is_semantic_and_evidence_is_readable(self):
        manifest = _load("manifest_zhishang-tanbing.json")
        uiir = manifest_to_uiir(manifest)
        expanded = uiir_to_expanded_observation(uiir)
        self.assertFalse(expanded["lossy"])
        self.assertEqual(expanded["projection"], "expanded")
        self.assertEqual(len(expanded["entities"]), len(uiir["nodes"]))
        self.assertEqual(len(expanded["relations"]), len(uiir["edges"]))
        self.assertEqual(expanded["counts"]["evidenceRecords"], len(uiir["evidence"]))
        self.assertIn("responds", {item["relation"] for item in expanded["relations"]})
        self.assertTrue(all(isinstance(item["type"], str) for item in expanded["entities"]))

        evidenced = next(item for item in expanded["entities"] if item.get("evidence"))
        self.assertIsInstance(evidenced["evidence"]["source"], str)
        for observation in evidenced["evidence"]["observations"]:
            self.assertIsInstance(observation["method"], str)

    def test_diff_uses_stable_keys_and_ignores_node_id_shifts(self):
        before_manifest = _load("manifest_zhishang-tanbing.json")
        after_manifest = json.loads(json.dumps(before_manifest, ensure_ascii=False))
        after_manifest["theme"]["tokens"].append({
            "name": "diff-only-token",
            "value": "#123456",
            "roles": ["accent"],
        })
        before = manifest_to_uiir(before_manifest)
        after = manifest_to_uiir(after_manifest)
        diff = diff_uiir_observation(before, after)
        self.assertTrue(diff["hasChanges"])
        self.assertEqual(diff["summary"]["entitiesAdded"], 1)
        self.assertEqual(diff["summary"]["entitiesRemoved"], 0)
        self.assertEqual(diff["summary"]["entitiesChanged"], 0)
        self.assertEqual(diff["summary"]["relationsRemoved"], 0)
        self.assertEqual(len(diff["entities"]["added"]), 1)
        self.assertIn("diff-only-token", diff["entities"]["added"][0]["key"])

        identical = diff_uiir_observation(before, before)
        self.assertFalse(identical["hasChanges"])
        self.assertTrue(all(
            value in (0, False) for value in identical["summary"].values()
        ))

    def test_projection_clis_write_valid_outputs(self):
        manifest = _load("manifest_zhishang-tanbing.json")
        uiir = manifest_to_uiir(manifest)
        with tempfile.TemporaryDirectory() as temp:
            uiir_path = Path(temp) / "case.uiir.json"
            manifest_path = Path(temp) / "case.manifest.json"
            compact_path = Path(temp) / "case.compact.json"
            expanded_path = Path(temp) / "case.expanded.json"
            after_uiir_path = Path(temp) / "case-after.uiir.json"
            diff_path = Path(temp) / "case.diff.json"
            uiir_path.write_text(json.dumps(uiir, ensure_ascii=False), encoding="utf-8")

            self.assertEqual(reverse_main([str(uiir_path), "-o", str(manifest_path)]), 0)
            self.assertEqual(json.loads(manifest_path.read_text(encoding="utf-8")), manifest)
            self.assertEqual(reverse_main([str(uiir_path), "--check"]), 0)

            self.assertEqual(compact_main([str(uiir_path), "-o", str(compact_path)]), 0)
            compact = json.loads(compact_path.read_text(encoding="utf-8"))
            self.assertEqual(compact["schemaVersion"], "2.0-compact")
            self.assertEqual(compact_main([str(uiir_path), "--check"]), 0)

            self.assertEqual(expanded_main([str(uiir_path), "-o", str(expanded_path)]), 0)
            expanded = json.loads(expanded_path.read_text(encoding="utf-8"))
            self.assertEqual(expanded["schemaVersion"], "2.0-expanded")
            self.assertFalse(expanded["lossy"])
            self.assertEqual(expanded_main([str(uiir_path), "--check"]), 0)

            changed_manifest = json.loads(json.dumps(manifest, ensure_ascii=False))
            changed_manifest["meta"]["title"] = "changed title"
            after_uiir_path.write_text(
                json.dumps(manifest_to_uiir(changed_manifest), ensure_ascii=False),
                encoding="utf-8",
            )
            self.assertEqual(diff_main([
                str(uiir_path), str(after_uiir_path), "-o", str(diff_path)
            ]), 0)
            diff = json.loads(diff_path.read_text(encoding="utf-8"))
            self.assertEqual(diff["schemaVersion"], "2.0-diff")
            self.assertTrue(diff["hasChanges"])
            self.assertEqual(diff_main([
                str(uiir_path), str(after_uiir_path), "--check"
            ]), 0)


class TestUIIRV2Validation(unittest.TestCase):
    def _minimal(self):
        return {
            "schemaVersion": "2.0",
            "format": "ui-ir",
            "sourceSchemaVersion": "1.0",
            "nodeTypes": list(NODE_TYPES),
            "relationTypes": list(RELATION_TYPES),
            "nodes": [[0, 0, None, {"key": "page:main"}]],
            "edges": [],
        }

    def test_rejects_dangling_edge(self):
        document = self._minimal()
        document["edges"] = [[0, 0, 99]]
        self.assertTrue(any("target" in error for error in validate_uiir(document)))

    def test_rejects_parent_cycle(self):
        document = self._minimal()
        document["nodes"] = [
            [0, 0, 1, {"key": "page:main"}],
            [1, 1, 0, {"key": "region:main"}],
        ]
        self.assertTrue(any("循环" in error for error in validate_uiir(document)))

    def test_rejects_missing_or_multiple_page_nodes(self):
        missing = self._minimal()
        missing["nodes"] = [[0, 1, None, {"key": "region:main"}]]
        self.assertTrue(any("一个 page" in error for error in validate_uiir(missing)))

        duplicate = self._minimal()
        duplicate["nodes"].append([1, 0, None, {"key": "page:second"}])
        self.assertTrue(any("一个 page" in error for error in validate_uiir(duplicate)))

    def test_malformed_parent_and_edge_types_return_errors_instead_of_crashing(self):
        document = self._minimal()
        document["nodes"].append([1, 1, [0], {"key": "region:main"}])
        document["edges"] = [[[0], 0, {"bad": "target"}]]
        errors = validate_uiir(document)
        self.assertTrue(any("parentId" in error for error in errors))
        self.assertTrue(any("source 必须" in error for error in errors))
        self.assertTrue(any("target 必须" in error for error in errors))

    def test_rejects_duplicate_edges(self):
        document = self._minimal()
        document["nodes"].append([1, 1, 0, {"key": "region:main"}])
        document["edges"] = [[0, 0, 1], [0, 0, 1]]
        self.assertTrue(any("重复" in error for error in validate_uiir(document)))

    def test_rejects_invalid_or_duplicate_string_table_entries(self):
        document = self._minimal()
        document["strings"] = ["css-media-static", "css-media-static", ""]
        document["evidence"] = {
            "0": {
                "source": 9,
                "observations": [
                    {"manifestPath": 0, "method": True, "confidence": 1.0}
                ],
            }
        }
        errors = validate_uiir(document)
        self.assertTrue(any("字符串重复" in error for error in errors))
        self.assertTrue(any("strings[2]" in error for error in errors))
        self.assertTrue(any("source" in error for error in errors))
        self.assertTrue(any("method" in error for error in errors))
        with self.assertRaises(ValueError):
            expand_uiir_evidence(document)

    def test_accepts_backward_compatible_uninterned_evidence(self):
        document = self._minimal()
        document["evidence"] = {
            "0": {
                "source": "index.html",
                "observations": [
                    {
                        "manifestPath": "theme.tokens[0]",
                        "method": "manifest-v1",
                        "confidence": 1.0,
                    }
                ],
            }
        }
        self.assertEqual(validate_uiir(document), [])
        self.assertEqual(expand_uiir_evidence(document), document["evidence"])

    def test_validates_runtime_grounding_and_runtime_field_types(self):
        valid = self._minimal()
        valid["evidence"] = {
            "0": {
                "source": "index.html",
                "observations": [{
                    "method": "browser-listener-registration",
                    "confidence": 1.0,
                    "runtimeObserved": True,
                    "runtimeMatch": "selector-exact",
                    "runtimeLine": 2,
                    "runtimeColumn": 0,
                    "options": {"capture": False},
                    "invocationCount": 1,
                }],
            }
        }
        self.assertEqual(validate_uiir(valid), [])

        invalid = self._minimal()
        invalid["evidence"] = {
            "0": {
                "source": "index.html",
                "observations": [{
                    "method": "browser-listener-registration",
                    "confidence": 1.0,
                    "runtimeObserved": "yes",
                    "runtimeLine": 0,
                    "runtimeColumn": -1,
                    "options": [],
                    "invocationCount": -1,
                }],
            }
        }
        errors = validate_uiir(invalid)
        for field in (
            "runtimeObserved", "runtimeLine", "runtimeColumn", "options", "invocationCount"
        ):
            self.assertTrue(any(field in error for error in errors), field)
        self.assertTrue(any("manifestPath、sourceSpan" in error for error in errors))

    def test_rejects_malformed_evidence(self):
        document = self._minimal()
        document["evidence"] = {
            "0": {
                "source": "",
                "observations": [
                    {"manifestPath": "", "method": "", "confidence": 1.5, "selector": 3}
                ],
            }
        }
        errors = validate_uiir(document)
        self.assertTrue(any("source" in error for error in errors))
        self.assertTrue(any("manifestPath" in error for error in errors))
        self.assertTrue(any("confidence" in error for error in errors))
        self.assertTrue(any("selector" in error for error in errors))


if __name__ == "__main__":
    unittest.main(verbosity=2)
