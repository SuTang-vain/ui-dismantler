"""HTML/JavaScript 静态来源索引。

目标不是实现完整 DOM 或 JavaScript 解析器，而是为 UI-IR 提供可复核的：
- HTML 起始标签 sourceSpan；
- document selector API 的静态字符串引用；
- 常见 addEventListener / on* 事件绑定链。

所有结果都保留 method/confidence，无法静态确定的动态表达式不会被猜测。
"""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import re
from typing import Any
from urllib.parse import urlparse

from .local_refs import resolve_local_reference


_EVENT_ATTRIBUTE_RE = re.compile(r"^on([a-z][\w:-]*)$", re.IGNORECASE)
_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][\w:-]*$")
_SELECTOR_CALL_RE = re.compile(
    r"(?P<object>document|[A-Za-z_$][\w$]*)\s*\.\s*"
    r"(?P<api>querySelectorAll|querySelector|getElementById|getElementsByClassName)"
    r"\s*\(\s*(?P<quote>['\"])(?P<value>(?:\\.|(?!['\"]).)*)(?P=quote)\s*\)",
    re.DOTALL,
)
_DIRECT_LISTENER_RE = re.compile(
    _SELECTOR_CALL_RE.pattern
    + r"\s*\.\s*addEventListener\s*\(\s*(?P<event_quote>['\"])"
      r"(?P<event>(?:\\.|(?!['\"]).)*)(?P=event_quote)",
    re.DOTALL,
)
_DIRECT_PROPERTY_RE = re.compile(
    _SELECTOR_CALL_RE.pattern + r"\s*\.\s*on(?P<event>[a-z][\w:-]*)\s*=",
    re.DOTALL | re.IGNORECASE,
)
_ASSIGNMENT_RE = re.compile(
    r"(?:\b(?:const|let|var)\s+)?(?P<variable>[A-Za-z_$][\w$]*)\s*=\s*$",
    re.DOTALL,
)
_COLLECTION_ASSIGNMENT_RE = re.compile(
    r"(?:\b(?:const|let|var)\s+)?(?P<variable>[A-Za-z_$][\w$]*)\s*=\s*"
    r"(?:Array\s*\.\s*from\s*\(|\[\s*\.\.\.\s*)$",
    re.DOTALL,
)
_VARIABLE_LISTENER_RE = re.compile(
    r"\b(?P<variable>[A-Za-z_$][\w$]*)\s*\.\s*addEventListener\s*\(\s*"
    r"(?P<quote>['\"])(?P<event>(?:\\.|(?!['\"]).)*)(?P=quote)",
    re.DOTALL,
)
_VARIABLE_PROPERTY_RE = re.compile(
    r"\b(?P<variable>[A-Za-z_$][\w$]*)\s*\.\s*on(?P<event>[a-z][\w:-]*)\s*=",
    re.IGNORECASE,
)
_ROOT_LISTENER_RE = re.compile(
    r"\b(?P<root>document|window)\s*\.\s*addEventListener\s*\(\s*"
    r"(?P<quote>['\"])(?P<event>(?:\\.|(?!['\"]).)*)(?P=quote)",
    re.DOTALL,
)
_SCRIPT_RE = re.compile(
    r"<script\b(?P<attrs>[^>]*)>(?P<body>.*?)</script\s*>",
    re.IGNORECASE | re.DOTALL,
)
_SCRIPT_SRC_RE = re.compile(
    r"\bsrc\s*=\s*(?P<quote>['\"])(?P<value>.*?)\1",
    re.IGNORECASE | re.DOTALL,
)


def _decode_js_string(value: str) -> str:
    """保守解码选择器中最常见的 JS 字符串转义。"""
    return re.sub(r"\\(['\"\\])", r"\1", value)


def _selector_for_api(api: str, value: str) -> str:
    value = _decode_js_string(value)
    if api == "getElementById":
        return f"#{value}"
    if api == "getElementsByClassName":
        classes = [part for part in value.split() if part]
        return "".join(f".{part}" for part in classes)
    return value


def _line_offsets(text: str) -> list[int]:
    offsets = [0]
    offsets.extend(match.end() for match in re.finditer(r"\n", text))
    return offsets


class _DOMIndexer(HTMLParser):
    def __init__(self, text: str, source: str) -> None:
        super().__init__(convert_charrefs=False)
        self.text = text
        self.source = source
        self.offsets = _line_offsets(text)
        self.elements: list[dict[str, Any]] = []
        self.inline_events: list[dict[str, Any]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._record_tag(tag, attrs)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._record_tag(tag, attrs)

    def _record_tag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        line, column = self.getpos()
        start = self.offsets[line - 1] + column
        raw = self.get_starttag_text() or ""
        end = start + len(raw)
        attributes = {name.lower(): value for name, value in attrs}
        classes = [part for part in (attributes.get("class") or "").split() if part]
        element = {
            "tag": tag.lower(),
            "id": attributes.get("id"),
            "classes": classes,
            "attributes": attributes,
            "source": self.source,
            "sourceSpan": [start, end],
        }
        self.elements.append(element)
        for name, value in attrs:
            event_match = _EVENT_ATTRIBUTE_RE.match(name)
            if not event_match:
                continue
            selector = f"#{attributes['id']}" if attributes.get("id") else None
            if selector is None and classes:
                selector = f"{tag.lower()}." + ".".join(classes)
            if selector is None:
                selector = tag.lower()
            self.inline_events.append({
                "selector": selector,
                "event": event_match.group(1).lower(),
                "api": "html-event-attribute",
                "binding": name.lower(),
                "source": self.source,
                "sourceSpan": [start, end],
                "handler": value,
                "confidence": 1.0,
            })


def _simple_selector_parts(selector: str) -> dict[str, Any] | None:
    selector = selector.strip()
    if not selector or any(char in selector for char in ",+~"):
        return None
    # 对后代/子代 selector 仅解析末端 compound；祖先约束降低 confidence。
    scoped = bool(re.search(r"\s|>", selector))
    compound = re.split(r"\s+|>", selector)[-1]
    compound = re.sub(r"::?[\w-]+(?:\([^)]*\))?", "", compound)
    attributes = re.findall(
        r"\[\s*([\w:-]+)(?:\s*=\s*(['\"]?)(.*?)\2)?\s*\]", compound
    )
    compound_without_attrs = re.sub(r"\[[^\]]+\]", "", compound)
    id_matches = re.findall(r"#([\w:-]+)", compound_without_attrs)
    classes = re.findall(r"\.([\w:-]+)", compound_without_attrs)
    tag_match = re.match(r"^([A-Za-z][\w:-]*|\*)", compound_without_attrs)
    tag = tag_match.group(1).lower() if tag_match and tag_match.group(1) != "*" else None
    if len(id_matches) > 1:
        return None
    if not (id_matches or classes or attributes or tag):
        return None
    return {
        "id": id_matches[0] if id_matches else None,
        "classes": classes,
        "attributes": [(name.lower(), value if value != "" else None) for name, _, value in attributes],
        "tag": tag,
        "scoped": scoped,
    }


def resolve_dom_selector(elements: list[dict[str, Any]], selector: str) -> dict[str, Any]:
    """把可静态判断的 CSS selector 映射到 HTML 起始标签。"""
    raw_selector = selector.strip()
    if _IDENTIFIER_RE.fullmatch(raw_selector):
        raw_selector = f"#{raw_selector}"
    parts = _simple_selector_parts(raw_selector)
    if parts is None:
        return {"selector": raw_selector, "matches": [], "confidence": 0.0}
    matches: list[dict[str, Any]] = []
    for element in elements:
        attrs = element.get("attributes") or {}
        if parts["id"] is not None and element.get("id") != parts["id"]:
            continue
        if parts["tag"] is not None and element.get("tag") != parts["tag"]:
            continue
        if any(name not in attrs or (value is not None and attrs.get(name) != value)
               for name, value in parts["attributes"]):
            continue
        classes = set(element.get("classes") or [])
        if not set(parts["classes"]).issubset(classes):
            continue
        matches.append(element)
    confidence = 1.0
    if parts["scoped"]:
        confidence = 0.85
    elif parts["id"] is None and len(matches) != 1:
        confidence = 0.95
    return {"selector": raw_selector, "matches": matches, "confidence": confidence}


def _script_units(html_path: Path, text: str) -> tuple[list[dict[str, Any]], list[str]]:
    units: list[dict[str, Any]] = []
    warnings: list[str] = []
    for match in _SCRIPT_RE.finditer(text):
        attrs = match.group("attrs") or ""
        src_match = _SCRIPT_SRC_RE.search(attrs)
        if src_match:
            src = src_match.group("value").strip()
            parsed = urlparse(src)
            if parsed.scheme or parsed.netloc or src.startswith("//"):
                continue
            script_path = resolve_local_reference(html_path, src)
            if script_path is None or not script_path.is_file():
                warnings.append(f"无法读取本地脚本：{script_path}")
                continue
            try:
                script_text = script_path.read_text(encoding="utf-8")
            except OSError as exc:
                warnings.append(f"无法读取本地脚本：{script_path} ({exc})")
                continue
            units.append({"source": str(script_path), "text": script_text, "offset": 0})
        else:
            units.append({
                "source": str(html_path),
                "text": match.group("body"),
                "offset": match.start("body"),
            })
    return units, warnings


def _extract_script_references(unit: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    text = unit["text"]
    source = unit["source"]
    offset = int(unit["offset"])
    references: list[dict[str, Any]] = []
    assignments: dict[str, list[dict[str, Any]]] = {}

    for match in _SELECTOR_CALL_RE.finditer(text):
        api = match.group("api")
        selector = _selector_for_api(api, match.group("value"))
        confidence = 1.0 if match.group("object") == "document" else 0.7
        reference = {
            "selector": selector,
            "api": api,
            "scope": match.group("object"),
            "source": source,
            "sourceSpan": [offset + match.start(), offset + match.end()],
            "confidence": confidence,
        }
        references.append(reference)
        prefix = text[max(0, match.start() - 160):match.start()]
        assignment = _ASSIGNMENT_RE.search(prefix) or _COLLECTION_ASSIGNMENT_RE.search(prefix)
        if assignment:
            assignments.setdefault(assignment.group("variable"), []).append({
                **reference, "scriptStart": match.start()
            })

    bindings: list[dict[str, Any]] = []

    def add_binding(selector: str, event: str, api: str, start: int, end: int,
                    confidence: float, **details: Any) -> None:
        if not selector or not event:
            return
        bindings.append({
            "selector": selector,
            "event": _decode_js_string(event).lower(),
            "api": api,
            "source": source,
            "sourceSpan": [offset + start, offset + end],
            "confidence": confidence,
            **details,
        })

    for match in _DIRECT_LISTENER_RE.finditer(text):
        add_binding(
            _selector_for_api(match.group("api"), match.group("value")),
            match.group("event"),
            f"{match.group('api')}.addEventListener",
            match.start(), match.end(),
            1.0 if match.group("object") == "document" else 0.75,
        )
    for match in _DIRECT_PROPERTY_RE.finditer(text):
        add_binding(
            _selector_for_api(match.group("api"), match.group("value")),
            match.group("event"),
            f"{match.group('api')}.on-property",
            match.start(), match.end(),
            1.0 if match.group("object") == "document" else 0.75,
        )
    for match in _ROOT_LISTENER_RE.finditer(text):
        add_binding(
            match.group("root"), match.group("event"),
            f"{match.group('root')}.addEventListener",
            match.start(), match.end(), 1.0,
        )

    for regex, suffix in (
        (_VARIABLE_LISTENER_RE, "addEventListener"),
        (_VARIABLE_PROPERTY_RE, "on-property"),
    ):
        for match in regex.finditer(text):
            variable = match.group("variable")
            candidates = [
                reference for reference in assignments.get(variable, [])
                if int(reference["scriptStart"]) < match.start()
            ]
            if not candidates:
                continue
            reference = candidates[-1]
            add_binding(
                reference["selector"], match.group("event"),
                f"variable.{suffix}", match.start(), match.end(),
                min(float(reference["confidence"]), 0.95), variable=variable,
            )

    # collectionVariable.forEach(item => item.onclick = ...) 引用其静态赋值 selector。
    for variable, variable_assignments in assignments.items():
        for_each = re.compile(
            rf"\b{re.escape(variable)}\s*\.\s*forEach\s*\(\s*"
            r"(?:function\s*\(\s*([A-Za-z_$][\w$]*)\s*\)|"
            r"\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>)",
        )
        for collection_match in for_each.finditer(text):
            candidates = [
                reference for reference in variable_assignments
                if int(reference["scriptStart"]) < collection_match.start()
            ]
            if not candidates:
                continue
            reference = candidates[-1]
            alias = collection_match.group(1) or collection_match.group(2)
            body = text[collection_match.end():collection_match.end() + 1200]
            event_match = re.search(
                rf"\b{re.escape(alias)}\s*\.\s*on([a-z][\w:-]*)\s*=|"
                rf"\b{re.escape(alias)}\s*\.\s*addEventListener\s*\(\s*(['\"])(.*?)\2",
                body,
                re.IGNORECASE | re.DOTALL,
            )
            if not event_match:
                continue
            event = event_match.group(1) or event_match.group(3)
            add_binding(
                reference["selector"], event, "variable.forEach-event",
                collection_match.start(),
                collection_match.end() + event_match.end(),
                min(float(reference["confidence"]), 0.9),
                variable=variable,
            )

    # querySelectorAll(...).forEach(function(item){ item.onclick=... }) 常见于单文件页面。
    for ref_match in _SELECTOR_CALL_RE.finditer(text):
        if ref_match.group("api") not in {"querySelectorAll", "getElementsByClassName"}:
            continue
        tail = text[ref_match.end():ref_match.end() + 1200]
        alias_match = re.match(
            r"\s*\.\s*forEach\s*\(\s*(?:function\s*\(\s*([A-Za-z_$][\w$]*)\s*\)|"
            r"\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>)",
            tail,
        )
        if not alias_match:
            continue
        alias = alias_match.group(1) or alias_match.group(2)
        body = tail[alias_match.end():]
        event_match = re.search(
            rf"\b{re.escape(alias)}\s*\.\s*on([a-z][\w:-]*)\s*=|"
            rf"\b{re.escape(alias)}\s*\.\s*addEventListener\s*\(\s*(['\"])(.*?)\2",
            body,
            re.IGNORECASE | re.DOTALL,
        )
        if not event_match:
            continue
        event = event_match.group(1) or event_match.group(3)
        end = ref_match.end() + alias_match.end() + event_match.end()
        add_binding(
            _selector_for_api(ref_match.group("api"), ref_match.group("value")),
            event,
            f"{ref_match.group('api')}.forEach-event",
            ref_match.start(), end,
            0.9 if ref_match.group("object") == "document" else 0.65,
            variable=alias,
        )

    def unique(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen: set[tuple[Any, ...]] = set()
        result: list[dict[str, Any]] = []
        for record in records:
            signature = (
                record.get("source"), tuple(record.get("sourceSpan") or []),
                record.get("selector"), record.get("event"), record.get("api"),
            )
            if signature not in seen:
                seen.add(signature)
                result.append(record)
        return result

    return unique(references), unique(bindings)


def extract_source_references(source_path: str | Path) -> tuple[dict[str, Any], list[str]]:
    """读取 HTML，返回 DOM 索引、selector 引用和静态事件绑定。"""
    path = Path(source_path).expanduser().resolve()
    if not path.is_file():
        return {"source": str(path), "elements": [], "selectorReferences": [], "eventBindings": []}, [
            f"来源文件不存在：{path}"
        ]
    if path.suffix.lower() not in {".html", ".htm"}:
        return {"source": str(path), "elements": [], "selectorReferences": [], "eventBindings": []}, []
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        return {"source": str(path), "elements": [], "selectorReferences": [], "eventBindings": []}, [
            f"无法读取来源 HTML：{path} ({exc})"
        ]

    parser = _DOMIndexer(text, str(path))
    warnings: list[str] = []
    try:
        parser.feed(text)
        parser.close()
    except Exception as exc:  # HTMLParser 对残缺输入通常容错；此处确保不阻断转换。
        warnings.append(f"HTML 静态索引不完整：{path} ({exc})")

    units, script_warnings = _script_units(path, text)
    warnings.extend(script_warnings)
    references: list[dict[str, Any]] = []
    bindings: list[dict[str, Any]] = list(parser.inline_events)
    for unit in units:
        unit_references, unit_bindings = _extract_script_references(unit)
        references.extend(unit_references)
        bindings.extend(unit_bindings)

    return {
        "source": str(path),
        "elements": parser.elements,
        "selectorReferences": references,
        "eventBindings": bindings,
    }, warnings
