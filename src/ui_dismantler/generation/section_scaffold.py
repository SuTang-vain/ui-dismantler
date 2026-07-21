"""Generate a runnable section-oriented scaffold from generation-input.json.

This output is deliberately a reviewable starting point. It preserves section
boundaries, required data fields, interaction candidates and CSS evidence, but
it does not claim visual fidelity or verified behavior.
"""
from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any

from bs4 import BeautifulSoup

from ui_dismantler.generation.showcase import generate_showcase


_ALLOWED_LAYOUT = {
    "display", "position", "width", "height", "gap", "grid-template-columns",
    "grid-template-rows", "flex-direction", "align-items", "justify-content",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "margin-top", "margin-right", "margin-bottom", "margin-left",
    "background-color", "border-radius", "z-index",
}


def _slug(value: str, fallback: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9_-]+", "-", value or "").strip("-").lower()
    return text or fallback


def _pascal(value: str, fallback: str = "Section") -> str:
    return "".join(part[:1].upper() + part[1:] for part in re.findall(r"[A-Za-z0-9]+", value or "")) or fallback


def _js(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _safe_css(value: Any) -> str:
    text = str(value)
    if any(token in text for token in ("{", "}", "</", "javascript:")):
        return ""
    return text.replace(";", "")




def _bounded_text(node, limit: int = 1200) -> str:
    if node is None:
        return ""
    text = " ".join(node.get_text(" ", strip=True).split())
    return text[:limit]


def _content_defaults(section: dict, generation_input: dict) -> dict:
    """从原 section chunk 提取 example options；不写入组件 JS 默认值。"""
    inventory = generation_input.get("inventory")
    chunk_file = section.get("chunkFile")
    if not inventory or not chunk_file:
        return {}
    chunk_path = Path(chunk_file)
    if not chunk_path.is_absolute():
        chunk_path = Path(inventory).resolve().parent / chunk_path
    if not chunk_path.is_file():
        return {}
    soup = BeautifulSoup(chunk_path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    result: dict[str, Any] = {}
    heading = soup.find(["h1", "h2", "h3"])
    if heading:
        result["title"] = _bounded_text(heading, 240)
        result["label"] = result["title"]
    result["description"] = _bounded_text(soup, 1200)

    tabs = []
    for index, button in enumerate(soup.select('[role="tab"]')):
        label = _bounded_text(button, 160)
        if not label:
            continue
        tab = {"id": button.get("id") or f"tab-{index + 1}", "label": label}
        panel_id = button.get("aria-controls")
        panel = soup.find(id=panel_id) if panel_id else None
        panel_text = _bounded_text(panel, 700)
        if panel_text:
            tab["title"] = panel_text
        tabs.append(tab)
    if tabs:
        result["tabs"] = tabs[:12]

    faq = []
    for details in soup.find_all("details"):
        summary = details.find("summary")
        q = _bounded_text(summary, 240)
        if not q:
            continue
        summary.extract()
        a = _bounded_text(details, 900)
        faq.append({"q": q, "a": a})
    if faq:
        result["faq"] = faq[:24]

    items = []
    candidates = soup.find_all("article")
    if len(candidates) < 3:
        candidates = soup.find_all("li")
    if len(candidates) < 3:
        candidates = soup.find_all("a")
    seen = set()
    for node in candidates:
        label = _bounded_text(node, 280)
        if not label or label in seen:
            continue
        seen.add(label)
        items.append({"label": label})
        if len(items) >= 24:
            break
    if items:
        result["items"] = items

    input_node = soup.find("input")
    if input_node and input_node.get("placeholder"):
        result["emailPlaceholder"] = input_node.get("placeholder")
    submit = soup.find("button", attrs={"type": "submit"})
    if submit:
        result["submitLabel"] = _bounded_text(submit, 120) or "Submit"
    return result


def _contract_defaults(section: dict) -> dict:
    contract = section.get("contract") or {}
    required = contract.get("props", {}).get("required", [])
    fields = contract.get("dataContract", {}).get("fields", [])
    return {
        "tabs": [{"id": "default", "label": section.get("heading") or "Default"}],
        "faq": [{"q": "Replace this question", "a": "Replace this answer"}],
        "items": [{"label": "Example item 1"}, {"label": "Example item 2"}, {"label": "Example item 3"}],
        "emailPlaceholder": "example@company.com",
        "required": required,
        "fields": fields,
    }


def _section_js(section: dict) -> str:
    sid = _slug(section.get("id", "section"), "section")
    component = section.get("contract", {}).get("component") or _pascal(sid)
    heading = component
    defaults = _contract_defaults(section)
    contract = section.get("contract") or {}
    required = set(contract.get("props", {}).get("required", []))
    interactions = contract.get("interactions", [])
    has_tabs = "tabs" in required or any(item.get("id") in {"tab-click", "tab-keyboard"} for item in interactions)
    has_faq = "faq" in required or any(item.get("id") == "native-details-toggle" for item in interactions)
    has_form = "form" in required or any(item.get("id") == "form-submit" for item in interactions)
    has_input = "inputValues" in required or any(item.get("id") == "input-change" for item in interactions)
    has_items = "items" in required
    lines = [
        "(function (global) {",
        "  var parts = global.__SectionParts = global.__SectionParts || {};",
        f"  parts[{_js(sid)}] = function (options) {{",
        f"    options = options || {{}};",
        "    var root = document.createElement('section');",
        f"    root.className = 'sg-section sg-section-{sid}';",
        f"    root.setAttribute('data-contract-component', {_js(component)});",
        f"    root.setAttribute('aria-label', options.label || {_js(heading)});",
        "    var title = document.createElement('h2');",
        "    title.className = 'sg-section-title';",
        f"    title.textContent = options.title || {_js(heading)};",
        "    root.appendChild(title);",
    ]
    if has_tabs:
        lines.extend([
            "    var tabs = options.tabs || " + _js(defaults["tabs"]) + ";",
            "    var tablist = document.createElement('div');",
            "    tablist.className = 'sg-section-tablist';",
            "    tablist.setAttribute('role', 'tablist');",
            "    var panel = document.createElement('div');",
            "    panel.className = 'sg-section-panel';",
            "    panel.setAttribute('role', 'tabpanel');",
            "    panel.setAttribute('aria-live', 'polite');",
            "    function selectTab(index) {",
            "      tabs.forEach(function (tab, tabIndex) {",
            "        var button = tablist.children[tabIndex];",
            "        if (!button) return;",
            "        var active = tabIndex === index;",
            "        button.setAttribute('aria-selected', active ? 'true' : 'false');",
            "        button.tabIndex = active ? 0 : -1;",
            "      });",
            "      panel.textContent = tabs[index] && (tabs[index].title || tabs[index].label) || '';",
            "    }",
            "    tabs.forEach(function (tab, index) {",
            "      var button = document.createElement('button');",
            "      button.type = 'button';",
            "      button.className = 'sg-section-tab';",
            "      button.setAttribute('role', 'tab');",
            "      button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');",
            "      button.tabIndex = index === 0 ? 0 : -1;",
            "      button.textContent = tab.label || ('Tab ' + (index + 1));",
            "      button.addEventListener('click', function () { selectTab(index); });",
            "      button.addEventListener('keydown', function (event) {",
            "        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;",
            "        event.preventDefault();",
            "        var next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;",
            "        tablist.children[next].focus();",
            "        selectTab(next);",
            "      });",
            "      tablist.appendChild(button);",
            "    });",
            "    root.appendChild(tablist);",
            "    root.appendChild(panel);",
            "    selectTab(0);",
        ])
    if has_faq:
        lines.extend([
            "    var faq = options.faq || " + _js(defaults["faq"]) + ";",
            "    var faqRoot = document.createElement('div');",
            "    faqRoot.className = 'sg-section-faq';",
            "    faq.forEach(function (item) {",
            "      var details = document.createElement('details');",
            "      var summary = document.createElement('summary');",
            "      summary.textContent = item.q || '';",
            "      var answer = document.createElement('p');",
            "      answer.textContent = item.a || '';",
            "      details.appendChild(summary); details.appendChild(answer); faqRoot.appendChild(details);",
            "    });",
            "    root.appendChild(faqRoot);",
        ])
    if has_items:
        lines.extend([
            "    var items = options.items || " + _js(defaults["items"]) + ";",
            "    var itemRoot = document.createElement('div');",
            "    itemRoot.className = 'sg-section-items';",
            "    items.forEach(function (item) {",
            "      var card = document.createElement('article');",
            "      card.className = 'sg-section-item';",
            "      card.textContent = item.label || item.title || '';",
            "      itemRoot.appendChild(card);",
            "    });",
            "    root.appendChild(itemRoot);",
        ])
    if has_form or has_input:
        lines.extend([
            "    var form = document.createElement('form');",
            "    form.className = 'sg-section-form';",
            "    var input = document.createElement('input');",
            "    input.type = 'email';",
            "    input.className = 'sg-section-input';",
            "    input.setAttribute('aria-label', 'Email address');",
            "    input.placeholder = options.emailPlaceholder || 'example@company.com';",
            "    var submit = document.createElement('button');",
            "    submit.type = 'submit';",
            "    submit.className = 'sg-section-submit';",
            "    submit.textContent = options.submitLabel || 'Submit';",
            "    form.appendChild(input); form.appendChild(submit);",
            "    form.addEventListener('submit', function (event) { event.preventDefault(); form.dataset.submitState = 'local-only'; });",
            "    root.appendChild(form);",
        ])
    if not (has_tabs or has_faq or has_items or has_form or has_input):
        lines.extend([
            "    var body = document.createElement('div');",
            "    body.className = 'sg-section-body';",
            "    body.setAttribute('aria-live', 'polite');",
            "    body.textContent = options.description || 'Section scaffold: replace with reviewed implementation.';",
            "    root.appendChild(body);",
        ])
    lines.extend([
        "    return root;",
        "  };",
        "})(window);",
        "",
    ])
    return "\n".join(lines)


def _section_css(section: dict) -> str:
    sid = _slug(section.get("id", "section"), "section")
    contract = section.get("contract") or {}
    layout = contract.get("layout") or {}
    lines = [f".sg-section-{sid} {{", "  box-sizing: border-box;", "  color: var(--sg-ink, #1e1f24);", "  background: var(--sg-paper, #fff);", "  padding: 24px;", "  display: block;"]
    for key, value in layout.items():
        if key not in _ALLOWED_LAYOUT:
            continue
        safe = _safe_css(value)
        if safe:
            lines.append(f"  {key}: {safe};")
    lines.extend([
        "}",
        f".sg-section-{sid} .sg-section-title {{ margin: 0 0 16px; font-size: clamp(24px, 4vw, 48px); }}",
        f".sg-section-{sid} .sg-section-tablist, .sg-section-{sid} .sg-section-items {{ display: flex; flex-wrap: wrap; gap: 12px; }}",
        f".sg-section-{sid} .sg-section-tab, .sg-section-{sid} .sg-section-submit {{ cursor: pointer; border: 1px solid var(--sg-line, #ecedf1); background: var(--sg-paper, #fff); padding: 10px 14px; border-radius: 8px; }}",
        f".sg-section-{sid} .sg-section-panel, .sg-section-{sid} .sg-section-item, .sg-section-{sid} details {{ margin-top: 16px; padding: 16px; border: 1px solid var(--sg-line, #ecedf1); border-radius: 10px; }}",
        f".sg-section-{sid} .sg-section-form {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }}",
        f".sg-section-{sid} .sg-section-input {{ min-width: 220px; flex: 1; padding: 10px; border: 1px solid var(--sg-line, #ecedf1); border-radius: 8px; }}",
        f"@media (max-width: 500px) {{ .sg-section-{sid} {{ padding: 16px; }} }}",
        f"@media (max-width: 320px) {{ .sg-section-{sid} {{ padding: 12px; }} }}",
        "",
    ])
    return "\n".join(lines)


def _assembly_js(sections: list[dict], lib_name: str) -> str:
    name = _pascal(lib_name, "SectionLibrary")
    section_ids = [section["id"] for section in sections]
    return "\n".join([
        "(function (global) {",
        f"  var {name} = {{}};",
        "  var parts = global.__SectionParts || {};",
        "  var sectionOrder = " + _js(section_ids) + ";",
        f"  {name}.version = '0.1.0-scaffold';",
        f"  {name}.create = function (options) {{",
        "    options = options || {};",
        "    var root = document.createElement('div');",
        "    root.className = 'sg-section-library';",
        "    root.setAttribute('aria-label', options.ariaLabel || 'Section component library');",
        "    root.setAttribute('aria-live', 'polite');",
        "    sectionOrder.forEach(function (id) {",
        "      if (typeof parts[id] === 'function') root.appendChild(parts[id](options[id] || options));",
        "    });",
        "    return root;",
        "  };",
        f"  {name}.mount = function (container, options) {{",
        f"    var root = {name}.create(options);",
        "    container.appendChild(root);",
        "    return root;",
        "  };",
        f"  global.{name} = {name};",
        "})(window);",
        "",
    ])


def _base_css() -> str:
    return """:root {
  --sg-primary: #6487FA;
  --sg-ink: #1E1F24;
  --sg-muted: #848691;
  --sg-line: #ECEDF1;
  --sg-paper: #FFFFFF;
  --sg-stage: #F8F8F8;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--sg-stage); font-family: ui-sans-serif, system-ui, sans-serif; }
.sg-section-library { width: 100%; max-width: 1440px; margin: 0 auto; }
.sg-section { box-sizing: border-box; color: var(--sg-ink); }
.sg-section-body, .sg-section-faq, .sg-section-items { width: 100%; }
@media (max-width: 500px) { .sg-section-library { padding: 16px; } }
@media (max-width: 320px) { .sg-section-library { padding: 12px; } }
"""


def _template_html(section_files: list[str], css_file: str, assembly: str, lib_name: str, options: dict) -> str:
    scripts = "\n".join(f'<script src="../src/sections/{name}"></script>' for name in section_files)
    styles = f'<link rel="stylesheet" href="../src/{css_file}">'
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{lib_name} · Section Scaffold</title>
<link rel="stylesheet" href="../src/base.css">
{styles}
</head>
<body>
<div id="mount"></div>
{scripts}
<script src="../src/{assembly}"></script>
<script>
(function () {{
  {lib_name}.mount(document.getElementById('mount'), {json.dumps(options, ensure_ascii=False, indent=2)});
}})();
</script>
</body>
</html>
"""


def generate_section_scaffold(generation_input: dict, out_dir: str | Path, lib_name: str = "section-library", *, generate_showcase_artifact: bool = False) -> dict:
    if generation_input.get("status") != "ready-for-agent":
        raise ValueError(f"generation input 不是 ready-for-agent: {generation_input.get('status')}")
    out = Path(out_dir).resolve()
    src = out / "src"
    sections_src = src / "sections"
    examples = out / "examples"
    docs = out / "docs"
    for path in (sections_src, examples, docs):
        path.mkdir(parents=True, exist_ok=True)
    sections = generation_input.get("sections", [])
    section_js = []
    section_css = []
    example_options: dict[str, Any] = {}
    template_options: dict[str, Any] = {}
    for section in sections:
        sid = _slug(section.get("id", "section"), "section")
        js_name = f"{sid}.js"
        css_name = f"{sid}.css"
        (sections_src / js_name).write_text(_section_js(section), encoding="utf-8")
        (sections_src / css_name).write_text(_section_css(section), encoding="utf-8")
        section_js.append(js_name)
        section_css.append(css_name)
        extracted = _content_defaults(section, generation_input)
        example_options[sid] = {
            "label": section.get("heading") or section.get("contract", {}).get("component", sid),
            **extracted,
        }
        placeholders = _contract_defaults(section)
        template_options[sid] = {
            "label": section.get("contract", {}).get("component", sid),
            "title": section.get("contract", {}).get("component", sid),
            "description": "Replace with reviewed section content.",
            "tabs": placeholders["tabs"],
            "faq": placeholders["faq"],
            "items": placeholders["items"],
            "emailPlaceholder": placeholders["emailPlaceholder"],
        }
    assembly_name = f"{_slug(lib_name, 'section-library')}.js"
    css_bundle_name = f"{_slug(lib_name, 'section-library')}.css"
    css_bundle = _base_css() + "\n" + "\n".join(_section_css(section) for section in sections)
    (src / "base.css").write_text(_base_css(), encoding="utf-8")
    (src / css_bundle_name).write_text(css_bundle, encoding="utf-8")
    (src / assembly_name).write_text(_assembly_js(sections, lib_name), encoding="utf-8")
    pascal = _pascal(lib_name, "SectionLibrary")
    template = _template_html(section_js, css_bundle_name, assembly_name, pascal, template_options)
    example = _template_html(section_js, css_bundle_name, assembly_name, pascal, example_options).replace("Section Scaffold", "Example")
    (examples / "template.html").write_text(template, encoding="utf-8")
    (examples / f"{_slug(lib_name, 'section-library')}.html").write_text(example, encoding="utf-8")
    (out / "generation-input.json").write_text(json.dumps(generation_input, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "README.md").write_text(
        f"# {pascal} section scaffold\n\n"
        "这是基于 section contract 的可审查脚手架，不是最终高保真组件库。\n\n"
        "- 每个 section 有独立 JS/CSS 文件。\n"
        "- `src/" + assembly_name + "` 负责 assembly 与 mount。\n"
        "- candidate 交互必须在 reference/library 双侧验证后才能晋级。\n\n"
        "## API\n\n"
        f"- `{pascal}.mount(container, options)`\n"
        f"- `{pascal}.create(options)`\n"
        f"- `{pascal}.version`\n\n"
        "## 数据契约\n\n"
        "section options 按 section id 注入；required props 来源于 generation-input.json。\n\n"
        "## 主题\n\n"
        "所有基础颜色通过 --sg-* 变量覆盖。\n",
        encoding="utf-8",
    )
    (docs / "设计规范.md").write_text(
        "# Section Scaffold 设计说明\n\n"
        "## 主题色\n\n通过 --sg-primary、--sg-ink、--sg-muted、--sg-line、--sg-paper、--sg-stage 覆盖。\n\n"
        "## 响应式\n\n支持 PC、max-width: 500px 和 max-width: 320px 三档。\n\n"
        "## A11y\n\nassembly 提供 aria-label/aria-live；Tab/FAQ/form section 根据 contract 补充语义属性。\n\n"
        "## 交互\n\n候选交互必须通过 reference/library 双侧断言后才能晋级。\n\n"
        "## 组件\n\n每个 section 独立 JS/CSS 文件，由 assembly 统一挂载。\n\n"
        "组件契约来自 DOM 与可选 Chromium CDP 证据，所有布局和交互仍需 Roundtrip 复核。\n",
        encoding="utf-8",
    )
    showcase_path = None
    if generate_showcase_artifact:
        showcase_path = out / "showcase.html"
        showcase_path.write_text(generate_showcase(out), encoding="utf-8")
    return {
        "status": "scaffold-generated",
        "outDir": str(out),
        "sections": len(sections),
        "sectionFiles": section_js,
        "assembly": str(src / assembly_name),
        "template": str(examples / "template.html"),
        "showcase": str(showcase_path) if showcase_path else None,
    }
