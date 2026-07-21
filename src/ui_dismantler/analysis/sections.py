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
    """生成尽量稳定且唯一的 section selector。

    仅使用可直接放进 CSS selector 的 id/class；当同类节点重复时加入
    :nth-of-type，并向上保留到 header/main/footer 或带 id 的锚点。
    """
    parts: list[str] = []
    current = node
    while current is not None and getattr(current, "name", None) not in {None, "body", "html", "[document]"}:
        if current.get("id") and re.match(r"^[A-Za-z_][\w-]*$", current["id"]):
            parts.insert(0, f"#{current['id']}")
            break
        classes = [c for c in current.get("class", []) if re.match(r"^[A-Za-z_][\w-]*$", c)]
        piece = current.name
        if classes:
            piece += "." + ".".join(classes[:2])
        parent = current.parent
        if parent is not None:
            siblings = [child for child in parent.find_all(current.name, recursive=False)]
            if len(siblings) > 1:
                piece += f":nth-of-type({siblings.index(current) + 1})"
        parts.insert(0, piece)
        if current.name in {"header", "main", "footer"}:
            break
        current = parent
    return " > ".join(parts) if parts else f"{node.name}:nth-of-type({index + 1})"


def build_section_inventory(soup: BeautifulSoup, *, max_sections: int = 64) -> list[dict]:
    """返回页面级/主内容级 section 边界，按文档顺序稳定输出。"""
    body = soup.find("body") or soup
    candidates = []
    seen_ids: set[str] = set()
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
        if not text and (
            not heading_text
            or node.has_attr("aria-live")
            or "notification" in str(aria_label).lower()
        ):
            continue
        classes = [c for c in node.get("class", []) if c]
        base_id = _slug(node.get("id") or heading_text or node.name, f"section-{ordinal + 1}")
        section_id = base_id
        if section_id in seen_ids:
            section_id = f"{base_id}-{ordinal + 1}"
        seen_ids.add(section_id)
        candidates.append({
            "id": section_id,
            "tag": node.name,
            "chunkable": node.name != "main",
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
