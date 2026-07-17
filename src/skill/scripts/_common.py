"""_common.py — html-to-component-lib skill 的共享工具

提供 CSS 解析、颜色解析、变量归一化等基础能力。
被 analyze_html.py / generate_lib.py / validate_lib.py 复用。
不依赖第三方包（bs4 仅在 analyze 中用）。
"""

from __future__ import annotations
import re
from typing import Any

# ============================================================
# 1. CSS 变量归一化映射（spec.md 第 2 节）
# ============================================================
# key: 匹配原变量名的正则（不区分大小写，不含 -- 前缀）
# value: 归一化后的 sg- 名（不含 --sg- 前缀）
VAR_NORMALIZE_MAP: list[tuple[str, str]] = [
    (r"^(primary|primary[-_]?color|marker[-_]?primary|brand)$", "primary"),
    (r"^(accent|accent[-_]?color|cause[-_]?color)$", "accent"),
    (r"^(ink|text[-_]?main|text[-_]?primary|color[-_]?text)$", "ink"),
    (r"^(muted|text[-_]?secondary|text[-_]?sub|text[-_]?muted)$", "muted"),
    (r"^(subtle|text[-_]?tertiary|text[-_]?light)$", "subtle"),
    (r"^(line|border|divider)$", "line"),
    (r"^(paper|bg[-_]?white|panel[-_]?bg|card[-_]?bg)$", "paper"),
    (r"^(stage|bg[-_]?gray|bg[-_]?color)$", "stage"),
    (r"^(soft|primary[-_]?l|primary[-_]?light)$", "soft"),
    (r"^(soft[-_]?pink|accent[-_]?l|accent[-_]?light)$", "soft-accent"),
    (r"^(accent[-_]?)?2$", "accent-2"),
    (r"^(primary[-_]?dark|primary[-_]?d)$", "primary-dark"),
]


def normalize_var_name(original: str) -> str:
    """把原 CSS 变量名归一化为 sg- 语义名（不含 --sg- 前缀）。

    例：--primary-color → primary；--text-main → ink；--xyz → xyz
    """
    if not original:
        return original
    # 去掉前缀 --
    name = original.lstrip("-").lower()
    for pat, norm in VAR_NORMALIZE_MAP:
        if re.match(pat, name, re.IGNORECASE):
            return norm
    # 未匹配：保留原名（去连字符变体）
    return name


# ============================================================
# 2. 颜色解析
# ============================================================
HEX_RE = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
RGB_RE = re.compile(r"^rgba?\(\s*([\d.]+)\s*,?\s*([\d.]+)\s*,?\s*([\d.]+)\s*,?\s*([\d.]*)\s*\)$")
HSL_RE = re.compile(r"^hsla?\(\s*([\d.]+)\s*,?\s*([\d.]+)%\s*,?\s*([\d.]+)%\s*,?\s*([\d.]*)\s*\)$")


def parse_color(value: str) -> tuple[int, int, int, float] | None:
    """解析颜色值为 (r,g,b,a)。无法解析返回 None。"""
    if not value:
        return None
    v = value.strip()
    m = HEX_RE.match(v)
    if m:
        h = m.group(1)
        if len(h) == 3:
            r, g, b = (int(c * 2, 16) for c in h)
            return (r, g, b, 1.0)
        if len(h) in (6, 8):
            r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
            a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
            return (r, g, b, a)
    m = RGB_RE.match(v)
    if m:
        r, g, b = int(float(m.group(1))), int(float(m.group(2))), int(float(m.group(3)))
        a = float(m.group(4)) if m.group(4) else 1.0
        return (r, g, b, a)
    m = HSL_RE.match(v)
    if m:
        h_val, s, l = float(m.group(1)), float(m.group(2)), float(m.group(3))
        a = float(m.group(4)) if m.group(4) else 1.0
        r, g, b = _hsl_to_rgb(h_val, s, l)
        return (r, g, b, a)
    return None


def _hsl_to_rgb(h: float, s: float, l: float) -> tuple[int, int, int]:
    """h: 0-360, s/l: 0-100。返回 0-255 整数。"""
    s /= 100.0
    l /= 100.0
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60.0) % 2 - 1))
    m = l - c / 2
    if h < 60:
        r1, g1, b1 = c, x, 0
    elif h < 120:
        r1, g1, b1 = x, c, 0
    elif h < 180:
        r1, g1, b1 = 0, c, x
    elif h < 240:
        r1, g1, b1 = 0, x, c
    elif h < 300:
        r1, g1, b1 = x, 0, c
    else:
        r1, g1, b1 = c, 0, x
    return (int((r1 + m) * 255), int((g1 + m) * 255), int((b1 + m) * 255))


def to_hex(rgba: tuple[int, int, int, float]) -> str:
    """(r,g,b,a) → #rrggbb（忽略 alpha，归一化用）。"""
    r, g, b, _ = rgba
    return f"#{r:02X}{g:02X}{b:02X}".upper()


def color_distance(c1: tuple, c2: tuple) -> float:
    """欧氏距离，用于聚合时找众数颜色。"""
    return sum((a - b) ** 2 for a, b in zip(c1[:3], c2[:3])) ** 0.5


# ============================================================
# 3. CSS 解析（轻量，不依赖 cssutils）
# ============================================================
# 提取 :root 变量声明
# 认 :root 单独块，也认 :root 作为选择器组成员（如 `:root,\n.sg-frame { ... }`）
ROOT_VAR_RE = re.compile(
    r"(?:^|[\s,])(?::root(?:\s*,\s*[^{]+?)?)\s*\{([^}]*)\}", re.DOTALL
)
# 单条变量声明：--name: value;
VAR_DECL_RE = re.compile(
    r"(--[\w-]+)\s*:\s*([^;]+);"
)
# @media 块
MEDIA_RE = re.compile(
    r"@media\s+([^{]+)\{", re.DOTALL
)


def extract_root_vars(css: str) -> dict[str, str]:
    """提取 :root { ... } 内所有变量声明。"""
    out: dict[str, str] = {}
    for m in ROOT_VAR_RE.finditer(css):
        body = m.group(1)
        for vm in VAR_DECL_RE.finditer(body):
            name = vm.group(1).strip()
            value = vm.group(2).strip()
            out[name] = value
    return out


def extract_all_vars(css: str) -> dict[str, str]:
    """提取 CSS 中所有 --var: value; 声明（含 :root 与其他位置）。"""
    out: dict[str, str] = {}
    for vm in VAR_DECL_RE.finditer(css):
        name = vm.group(1).strip()
        value = vm.group(2).strip()
        out.setdefault(name, value)
    return out


def split_media_blocks(css: str) -> list[tuple[str, str]]:
    """拆分 CSS 为 [(media_query, block_body), ...]。

    返回顶层 @media 块（不嵌套）。media_query 为空字符串表示默认（非 media）块。
    简化实现：用花括号计数。
    """
    blocks: list[tuple[str, str]] = []
    i = 0
    n = len(css)
    while i < n:
        # 跳过注释
        if css[i:i+2] == "/*":
            end = css.find("*/", i + 2)
            i = end + 2 if end != -1 else n
            continue
        # 查找 @media
        if css[i:i+6] == "@media":
            # 读 media query 到 {
            brace_start = css.find("{", i)
            if brace_start == -1:
                break
            query = css[i+6:brace_start].strip()
            # 匹配对应的 }
            depth = 1
            j = brace_start + 1
            while j < n and depth > 0:
                if css[j:j+2] == "/*":
                    end = css.find("*/", j + 2)
                    j = end + 2 if end != -1 else n
                    continue
                if css[j] == "{":
                    depth += 1
                elif css[j] == "}":
                    depth -= 1
                j += 1
            body = css[brace_start+1:j-1]
            blocks.append((query, body))
            i = j
        elif css[i] == "@":
            # 其他 @规则（@keyframes 等），跳到对应块结束
            brace_start = css.find("{", i)
            if brace_start == -1:
                break
            depth = 1
            j = brace_start + 1
            while j < n and depth > 0:
                if css[j:j+2] == "/*":
                    end = css.find("*/", j + 2)
                    j = end + 2 if end != -1 else n
                    continue
                if css[j] == "{":
                    depth += 1
                elif css[j] == "}":
                    depth -= 1
                j += 1
            blocks.append(("", css[i:brace_start] + " " + css[brace_start+1:j-1]))
            i = j
        else:
            i += 1
    return blocks


# 规则解析：选择器 { props }
RULE_RE = re.compile(r"([^{}]+)\{([^{}]*)\}")


def parse_rules(css_block: str) -> list[tuple[str, dict[str, str]]]:
    """解析 CSS 块为 [(selector, {prop: value}), ...]。"""
    rules: list[tuple[str, dict[str, str]]] = []
    for m in RULE_RE.finditer(css_block):
        selector = m.group(1).strip()
        body = m.group(2)
        props: dict[str, str] = {}
        for decl in body.split(";"):
            decl = decl.strip()
            if not decl or ":" not in decl:
                continue
            k, _, v = decl.partition(":")
            props[k.strip()] = v.strip()
        if selector and props:
            rules.append((selector, props))
    return rules


# ============================================================
# 4. 渐变解析
# ============================================================
GRADIENT_RE = re.compile(r"(linear|radial|conic)-gradient\s*\(([^)]+(?:\([^)]*\)[^)]*)*)\)", re.IGNORECASE)


def extract_gradients(css: str) -> list[dict[str, str]]:
    """提取所有 gradient(...)。返回 [{type, value, colors: [...]}]。"""
    out: list[dict[str, str]] = []
    for m in GRADIENT_RE.finditer(css):
        gtype = m.group(1).lower()
        value = m.group(0)
        # 提取颜色 stops（简化：按逗号分割，但跳过函数内逗号）
        stops = _split_gradient_stops(m.group(2))
        out.append({"type": gtype, "value": value, "stops": stops})
    return out


def _split_gradient_stops(body: str) -> list[str]:
    """按顶层逗号分割渐变 stops。"""
    stops: list[str] = []
    depth = 0
    cur = []
    for ch in body:
        if ch == "(":
            depth += 1
            cur.append(ch)
        elif ch == ")":
            depth -= 1
            cur.append(ch)
        elif ch == "," and depth == 0:
            stops.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    if cur:
        stops.append("".join(cur).strip())
    return stops


# ============================================================
# 5. 通用工具
# ============================================================
def slugify(name: str) -> str:
    """中英混合名 → slug（用于命名库）。"""
    # 去掉常见后缀标记
    name = re.sub(r"_v\d+", "", name)
    # 非字母数字中文 → 连字符
    name = re.sub(r"[^\w\u4e00-\u9fff]+", "-", name, flags=re.UNICODE)
    name = name.strip("-").lower()
    return name or "case"


def safe_json_dump(obj: Any) -> str:
    """JSON 序列化，保证中文可读。"""
    import json
    return json.dumps(obj, ensure_ascii=False, indent=2, default=str)
