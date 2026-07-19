"""轻量 CSS @media 静态解析器。

不依赖浏览器或第三方 CSS AST；用于从原始 HTML/CSS 中提取 media query 内的
selector/property 变化及源码区间。解析失败时由调用方回退到 manifest 描述。
"""

from __future__ import annotations

from html import unescape
from pathlib import Path
import re
from typing import Any, Iterator
from .local_refs import resolve_local_reference


_STYLE_OR_LINK_RE = re.compile(
    r"<style\b(?P<style_attrs>[^>]*)>(?P<style_body>.*?)</style\s*>"
    r"|<link\b(?P<link_attrs>[^>]*)>",
    re.IGNORECASE | re.DOTALL,
)
_ATTR_RE = re.compile(
    r"(?P<name>[\w:-]+)(?:\s*=\s*(?P<value>\"[^\"]*\"|'[^']*'|[^\s>]+))?",
    re.DOTALL,
)
_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
_NESTED_STYLE_AT_RULES = ("@supports", "@layer", "@scope", "@container", "@document")


def _read_text_robust(path: Path) -> str:
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw[3:].decode("utf-8", errors="replace")
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16", errors="replace")
    head = raw[:4096]
    declared = None
    match = re.search(rb'<meta[^>]+charset=["\']?\s*([\w-]+)', head, re.IGNORECASE)
    if match:
        declared = match.group(1).decode("ascii", errors="ignore")
    for encoding in (declared, "utf-8", "gb18030"):
        if not encoding:
            continue
        try:
            return raw.decode(encoding)
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", errors="replace")


def _attributes(raw: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for match in _ATTR_RE.finditer(raw):
        name = match.group("name").lower()
        value = match.group("value") or ""
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        result[name] = unescape(value)
    return result


def _skip_space_and_comments(text: str, index: int, end: int) -> int:
    while index < end:
        if text[index].isspace():
            index += 1
            continue
        if text.startswith("/*", index):
            close = text.find("*/", index + 2, end)
            return end if close < 0 else _skip_space_and_comments(text, close + 2, end)
        break
    return index


def _scan_to_boundary(text: str, index: int, end: int) -> tuple[int, str | None]:
    quote: str | None = None
    paren_depth = 0
    bracket_depth = 0
    while index < end:
        if quote:
            if text[index] == "\\":
                index += 2
                continue
            if text[index] == quote:
                quote = None
            index += 1
            continue
        if text.startswith("/*", index):
            close = text.find("*/", index + 2, end)
            index = end if close < 0 else close + 2
            continue
        char = text[index]
        if char in "\"'":
            quote = char
        elif char == "(":
            paren_depth += 1
        elif char == ")" and paren_depth:
            paren_depth -= 1
        elif char == "[":
            bracket_depth += 1
        elif char == "]" and bracket_depth:
            bracket_depth -= 1
        elif not paren_depth and not bracket_depth and char in "{;}":
            return index, char
        index += 1
    return end, None


def _matching_brace(text: str, open_index: int, end: int) -> int | None:
    depth = 1
    index = open_index + 1
    quote: str | None = None
    while index < end:
        if quote:
            if text[index] == "\\":
                index += 2
                continue
            if text[index] == quote:
                quote = None
            index += 1
            continue
        if text.startswith("/*", index):
            close = text.find("*/", index + 2, end)
            index = end if close < 0 else close + 2
            continue
        char = text[index]
        if char in "\"'":
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
        index += 1
    return None


def _iter_blocks(text: str, start: int = 0, end: int | None = None) -> Iterator[dict[str, Any]]:
    end = len(text) if end is None else end
    index = start
    while index < end:
        index = _skip_space_and_comments(text, index, end)
        if index >= end or text[index] == "}":
            break
        prelude_start = index
        boundary, kind = _scan_to_boundary(text, index, end)
        if kind is None or kind == "}":
            break
        if kind == ";":
            index = boundary + 1
            continue
        close = _matching_brace(text, boundary, end)
        if close is None:
            break
        prelude = _COMMENT_RE.sub(" ", text[prelude_start:boundary]).strip()
        if prelude:
            yield {
                "prelude": prelude,
                "start": prelude_start,
                "open": boundary,
                "bodyStart": boundary + 1,
                "bodyEnd": close,
                "end": close + 1,
            }
        index = close + 1


def _split_declarations(text: str, start: int, end: int, source_offset: int) -> list[dict[str, Any]]:
    segments: list[tuple[int, int]] = []
    segment_start = start
    index = start
    quote: str | None = None
    paren_depth = 0
    bracket_depth = 0
    while index <= end:
        at_end = index == end
        char = "" if at_end else text[index]
        if quote:
            if char == "\\":
                index += 2
                continue
            if char == quote:
                quote = None
        elif not at_end and text.startswith("/*", index):
            close = text.find("*/", index + 2, end)
            index = end if close < 0 else close + 2
            continue
        elif char and char in "\"'":
            quote = char
        elif char == "(":
            paren_depth += 1
        elif char == ")" and paren_depth:
            paren_depth -= 1
        elif char == "[":
            bracket_depth += 1
        elif char == "]" and bracket_depth:
            bracket_depth -= 1
        elif at_end or (char == ";" and not paren_depth and not bracket_depth):
            segments.append((segment_start, index))
            segment_start = index + 1
        index += 1

    declarations: list[dict[str, Any]] = []
    for raw_start, raw_end in segments:
        while raw_start < raw_end and text[raw_start].isspace():
            raw_start += 1
        while raw_end > raw_start and text[raw_end - 1].isspace():
            raw_end -= 1
        if raw_start >= raw_end:
            continue
        segment = _COMMENT_RE.sub(" ", text[raw_start:raw_end])
        colon = _find_declaration_colon(segment)
        if colon is None:
            continue
        name = segment[:colon].strip()
        value = segment[colon + 1:].strip()
        if not name or not value:
            continue
        declarations.append({
            "property": name,
            "value": value,
            "sourceSpan": [source_offset + raw_start, source_offset + raw_end],
        })
    return declarations


def _find_declaration_colon(segment: str) -> int | None:
    quote: str | None = None
    paren_depth = 0
    bracket_depth = 0
    for index, char in enumerate(segment):
        if quote:
            if char == "\\":
                continue
            if char == quote:
                quote = None
            continue
        if char in "\"'":
            quote = char
        elif char == "(":
            paren_depth += 1
        elif char == ")" and paren_depth:
            paren_depth -= 1
        elif char == "[":
            bracket_depth += 1
        elif char == "]" and bracket_depth:
            bracket_depth -= 1
        elif char == ":" and not paren_depth and not bracket_depth:
            return index
    return None


def _normalize_selector(selector: str) -> str:
    selector = re.sub(r"\s+", " ", selector.strip())
    return re.sub(r"\s*([>+~])\s*", r"\1", selector)


def _style_rules(
    css: str,
    start: int,
    end: int,
    source_offset: int,
) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    for block in _iter_blocks(css, start, end):
        prelude = block["prelude"]
        lowered = prelude.lower()
        if prelude.startswith("@"):
            if lowered.startswith(_NESTED_STYLE_AT_RULES):
                rules.extend(_style_rules(css, block["bodyStart"], block["bodyEnd"], source_offset))
            continue
        declarations = _split_declarations(
            css, block["bodyStart"], block["bodyEnd"], source_offset
        )
        if declarations:
            rules.append({
                "selector": _normalize_selector(prelude),
                "declarations": declarations,
                "sourceSpan": [source_offset + block["start"], source_offset + block["end"]],
            })
    return rules


def _collect_stylesheet(
    css: str,
    start: int,
    end: int,
    source: str,
    source_offset: int,
    default_rules: list[dict[str, Any]],
    media: list[dict[str, Any]],
) -> None:
    for block in _iter_blocks(css, start, end):
        prelude = block["prelude"]
        lowered = prelude.lower()
        if lowered.startswith("@media"):
            query = prelude[len("@media"):].strip()
            media.append({
                "breakpoint": query,
                "source": source,
                "sourceSpan": [source_offset + block["start"], source_offset + block["end"]],
                "rules": _style_rules(css, block["bodyStart"], block["bodyEnd"], source_offset),
            })
        elif prelude.startswith("@"):
            if lowered.startswith(_NESTED_STYLE_AT_RULES):
                _collect_stylesheet(
                    css,
                    block["bodyStart"],
                    block["bodyEnd"],
                    source,
                    source_offset,
                    default_rules,
                    media,
                )
        else:
            declarations = _split_declarations(
                css, block["bodyStart"], block["bodyEnd"], source_offset
            )
            if declarations:
                default_rules.append({
                    "selector": _normalize_selector(prelude),
                    "declarations": declarations,
                    "sourceSpan": [source_offset + block["start"], source_offset + block["end"]],
                })


def _resolve_media_changes(
    defaults: list[dict[str, Any]],
    media: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """使用同一文档级默认声明上下文解析 media 中的属性变化。"""
    default_map: dict[tuple[str, str], dict[str, Any]] = {}
    for rule in defaults:
        for declaration in rule["declarations"]:
            default_map[(rule["selector"], declaration["property"])] = declaration

    result: list[dict[str, Any]] = []
    for media_index, block in enumerate(media):
        latest: dict[tuple[str, str], dict[str, Any]] = {}
        ordinal = 0
        for rule in block["rules"]:
            for declaration in rule["declarations"]:
                key = (rule["selector"], declaration["property"])
                default = default_map.get(key)
                if default and default["value"] == declaration["value"]:
                    continue
                latest[key] = {
                    "selector": rule["selector"],
                    "property": declaration["property"],
                    "from": default["value"] if default else None,
                    "to": declaration["value"],
                    "source": block["source"],
                    "sourceSpan": declaration["sourceSpan"],
                    "defaultSourceSpan": default["sourceSpan"] if default else None,
                    "confidence": 1.0 if default else 0.85,
                    "ordinal": ordinal,
                }
                ordinal += 1
        changes = sorted(latest.values(), key=lambda item: item.pop("ordinal"))
        result.append({
            "breakpoint": block["breakpoint"],
            "source": block["source"],
            "sourceSpan": block["sourceSpan"],
            "mediaIndex": media_index,
            "changes": changes,
        })
    return result


def parse_css_media_blocks(
    css: str,
    *,
    source: str = "<css>",
    source_offset: int = 0,
) -> list[dict[str, Any]]:
    """解析一段 CSS，返回带源码区间的 media block 与属性变化。"""
    defaults: list[dict[str, Any]] = []
    media: list[dict[str, Any]] = []
    _collect_stylesheet(css, 0, len(css), source, source_offset, defaults, media)
    return _resolve_media_changes(defaults, media)


def _local_stylesheet_path(html_path: Path, href: str) -> Path | None:
    return resolve_local_reference(html_path, href)


def extract_css_media_blocks(source_path: str | Path) -> tuple[list[dict[str, Any]], list[str]]:
    """从 CSS 文件或 HTML 内联/本地 linked CSS 提取 media 变化。"""
    source = Path(source_path).expanduser().resolve()
    if not source.is_file():
        return [], [f"CSS source 不存在：{source}"]
    text = _read_text_robust(source)
    if source.suffix.lower() == ".css":
        return parse_css_media_blocks(text, source=str(source)), []

    defaults: list[dict[str, Any]] = []
    media: list[dict[str, Any]] = []
    warnings: list[str] = []
    for match in _STYLE_OR_LINK_RE.finditer(text):
        style_body = match.group("style_body")
        if style_body is not None:
            _collect_stylesheet(
                style_body,
                0,
                len(style_body),
                str(source),
                match.start("style_body"),
                defaults,
                media,
            )
            continue
        attrs = _attributes(match.group("link_attrs") or "")
        rel = {item.lower() for item in attrs.get("rel", "").split()}
        href = attrs.get("href", "")
        if "stylesheet" not in rel or not href:
            continue
        css_path = _local_stylesheet_path(source, href)
        if css_path is None:
            continue
        if not css_path.is_file():
            warnings.append(f"linked stylesheet 不存在：{css_path}")
            continue
        css = _read_text_robust(css_path)
        _collect_stylesheet(
            css,
            0,
            len(css),
            str(css_path),
            0,
            defaults,
            media,
        )
    return _resolve_media_changes(defaults, media), warnings
