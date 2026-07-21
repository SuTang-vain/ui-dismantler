"""可复用的语义 section inventory。

它不承担组件识别，只为 large/massive 页面提供有界的拆解边界，避免 agent
把整份 HTML 当作一个不可控上下文。输出不包含完整 HTML/业务文本，仅保留
selector、标题、规模和候选边界。
"""
from __future__ import annotations

from bs4 import BeautifulSoup
import re


_SEMANTIC_TAGS = {"header", "main", "footer", "section"}


def _slug(value: str, fallback: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return value or fallback


def _selector(node, index: int) -> str:
    if node.get("id"):
        return f"#{node['id']}"
    classes = [c for c in node.get("class", []) if re.match(r"^[A-Za-z_][\w-]*$", c)]
    if classes:
        return f"{node.name}." + ".".join(classes[:2])
    return f"{node.name}:nth-of-type({index + 1})"


def build_section_inventory(soup: BeautifulSoup, *, max_sections: int = 64) -> list[dict]:
    """返回页面级/主内容级 section 边界，按文档顺序稳定输出。"""
    body = soup.find("body") or soup
    candidates = []
    ordinal = 0
    for node in body.find_all(list(_SEMANTIC_TAGS), recursive=True):
        nearest = None
        for parent in node.parents:
            if getattr(parent, "name", None) in _SEMANTIC_TAGS:
                nearest = parent
                break
        # 保留页面主骨架；main 下直接/间接 section 是拆解单元。
        if node.name in {"header", "footer", "main"}:
            if nearest is not None and nearest.name != "main":
                continue
        elif node.name == "section":
            if nearest is not None and nearest.name != "main":
                continue
        text = " ".join(node.get_text(" ", strip=True).split())
        heading = node.find(["h1", "h2", "h3"])
        heading_text = " ".join(heading.get_text(" ", strip=True).split()) if heading else ""
        aria_label = node.get("aria-label") or node.get("aria-labelledby") or ""
        if not text and not heading_text and not aria_label:
            continue
        classes = [c for c in node.get("class", []) if c]
        candidates.append({
            "id": _slug(node.get("id") or heading_text or node.name, f"section-{ordinal + 1}"),
            "tag": node.name,
            "selector": _selector(node, ordinal),
            "heading": heading_text[:120],
            "aria": str(aria_label)[:120],
            "textChars": len(text),
            "estimatedTokens": max(1, round(len(text) / 3.0)),
            "childCount": len(node.find_all(recursive=False)),
            "classCount": len(classes),
            "classes": classes[:8],
        })
        ordinal += 1
        if len(candidates) >= max_sections:
            break
    return candidates
