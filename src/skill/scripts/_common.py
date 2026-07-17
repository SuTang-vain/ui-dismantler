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
GRADIENT_RE = re.compile(r"(linear|radial|conic)-gradient\s*\(", re.IGNORECASE)


def extract_gradients(css: str) -> list[dict[str, str]]:
    """提取所有 gradient(...)。返回 [{type, value, stops: [...]}]。

    stops 仅含颜色停点，方向参数（90deg / to top / circle 等）已排除。
    用括号计数法匹配完整 gradient，支持内部嵌套 rgba()/hsla() 等。
    """
    out: list[dict[str, str]] = []
    for m in GRADIENT_RE.finditer(css):
        gtype = m.group(1).lower()
        # 从 m.end()-1（指向 '('）开始用括号计数匹配到对应 ')'
        open_idx = m.end() - 1
        close_idx = _match_paren(css, open_idx)
        if close_idx is None:
            continue
        inner = css[open_idx + 1:close_idx]  # 括号内内容
        value = css[m.start():close_idx + 1]  # 完整 gradient(...)
        stops = _split_gradient_stops(inner)
        stops = _strip_direction(stops, gtype)
        out.append({"type": gtype, "value": value, "stops": stops})
    return out


def _match_paren(s: str, open_idx: int) -> int | None:
    """s[open_idx] == '('，返回对应 ')' 的索引。考虑字符串边界。"""
    depth = 0
    in_str = None
    i = open_idx
    while i < len(s):
        ch = s[i]
        if in_str:
            if ch == "\\":
                i += 2
                continue
            if ch == in_str:
                in_str = None
        else:
            if ch in ("'", '"', "`"):
                in_str = ch
            elif ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return None


# 方向参数模式：to <side>、Ndeg、circle/ellipse + 可选位置
_DIRECTION_RE = re.compile(
    r"^(to\s+\w|[-\d.]+deg|circle|ellipse|closest|farthest|at\s+)",
    re.IGNORECASE,
)


def _strip_direction(stops: list[str], gtype: str) -> list[str]:
    """若首段是方向参数（非颜色），移除它。"""
    if not stops:
        return stops
    first = stops[0].strip()
    # 颜色特征：#hex、rgb()/rgba()/hsl()/hsla()、transparent、currentColor、命名颜色
    if _looks_like_color(first):
        return stops
    if _DIRECTION_RE.match(first):
        return stops[1:]
    return stops


_COLOR_HINT_RE = re.compile(
    r"^(#|rgba?|hsla?|transparent|currentColor)", re.IGNORECASE
)


def _looks_like_color(s: str) -> bool:
    return bool(_COLOR_HINT_RE.match(s.strip()))


def _split_gradient_stops(body: str) -> list[str]:
    """按顶层逗号分割渐变内容。"""
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
    # 非字母数字中文 → 连字符（\w 含下划线，故单独把下划线也当分隔符）
    name = re.sub(r"[^\w\u4e00-\u9fff]+|_", "-", name, flags=re.UNICODE)
    name = name.strip("-").lower()
    return name or "case"


def safe_json_dump(obj: Any) -> str:
    """JSON 序列化，保证中文可读。"""
    import json
    return json.dumps(obj, ensure_ascii=False, indent=2, default=str)


# ============================================================
# 6. 颜色语义角色推断（P2-1）
# ============================================================
# CSS 属性 → 语义角色映射。用于推断一个 --var 在原页面扮演什么角色，
# 帮助 agent 准确归一化（如用作 border 的色 → --sg-line）。
_PROP_ROLE_MAP: list[tuple[str, str]] = [
    # 顺序敏感：更具体的属性先匹配
    (r"^background(-color)?$", "background"),
    (r"^border(-color)?(-top|-right|-bottom|-left)?$", "border"),
    (r"^outline(-color)?$", "border"),
    (r"^color$", "text"),
    (r"^fill$", "icon-fill"),
    (r"^stroke$", "icon-stroke"),
    (r"^box-shadow$", "shadow"),
    (r"^text-shadow$", "shadow"),
    (r"^caret-color$", "text"),
    (r"^accent-color$", "accent"),
    (r"^column-rule(-color)?$", "border"),
    (r"^text-decoration(-color)?$", "decoration"),
]


def _prop_to_role(prop: str) -> str | None:
    """CSS 属性名 → 语义角色。无匹配返回 None。"""
    p = prop.strip().lower()
    for pat, role in _PROP_ROLE_MAP:
        if re.match(pat, p):
            return role
    return None


def infer_color_roles(css: str, var_name: str) -> list[str]:
    """扫描 CSS，推断某 --var 被用作哪些语义角色。

    返回去重后的角色列表，如 ["text", "background"]。
    用于帮 agent 判断：一个色值在原页面是文字色、背景色、还是边框色。
    """
    roles: list[str] = []
    seen: set[str] = set()
    pat = re.compile(r"var\(\s*" + re.escape(var_name) + r"\s*\)")
    for sel, props in parse_rules(css):
        for prop, val in props.items():
            if pat.search(val):
                role = _prop_to_role(prop)
                if role and role not in seen:
                    seen.add(role)
                    roles.append(role)
    return roles


# ============================================================
# 7. CSS 规则结构化查询（P2-2）
# ============================================================
def query_rules(
    css: str,
    selector_contains: str | None = None,
    has_prop: str | None = None,
    prop_value_contains: str | None = None,
) -> list[tuple[str, dict[str, str]]]:
    """按条件查询 CSS 规则，给 agent 快速定位样式细节。

    参数（均可选，组合为 AND）：
    - selector_contains: 选择器包含该子串（大小写不敏感）
    - has_prop: 规则含该属性（大小写不敏感）
    - prop_value_contains: 某属性的值包含该子串（大小写不敏感）

    返回 [(selector, {prop: value}), ...]。
    例：query_rules(css, selector_contains='.member', has_prop='grid-template-columns')
        → 查 .member 相关的布局规则
    """
    out: list[tuple[str, dict[str, str]]] = []
    for sel, props in parse_rules(css):
        if selector_contains and selector_contains.lower() not in sel.lower():
            continue
        if has_prop:
            if not any(has_prop.lower() == k.lower() for k in props):
                continue
        if prop_value_contains:
            pvc = prop_value_contains.lower()
            if not any(pvc in v.lower() for v in props.values()):
                continue
        out.append((sel, props))
    return out


# ============================================================
# 8. 数据契约提取（P2-3）
# ============================================================
# 扫描 JS 中 const/let/var NAME = [...] / {...}，提取数据契约速览。
# 给 agent 一份"原页面有哪些数据、字段是什么"的参考，减少通读 JS 的负担。
_VAR_DECL_RE = re.compile(
    r"(?:const|let|var)\s+(\w+)\s*=\s*([\[\{])", re.MULTILINE
)


def _match_bracket_in(s: str, start: int, open_ch: str, close_ch: str) -> int | None:
    """s[start] == open_ch，返回对应 close_ch 的索引。考虑字符串边界。"""
    depth = 0
    in_str = None
    i = start
    while i < len(s):
        ch = s[i]
        if in_str:
            if ch == "\\":
                i += 2
                continue
            if ch == in_str:
                in_str = None
        else:
            if ch in ("'", '"', "`"):
                in_str = ch
            elif ch == open_ch:
                depth += 1
            elif ch == close_ch:
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return None


def _infer_field_type(value_str: str) -> str:
    """从值的字符串形式推断类型。"""
    v = value_str.strip()
    if not v:
        return "string"
    if v[0] in ("'", '"', "`"):
        return "string"
    if v in ("true", "false"):
        return "boolean"
    if v == "null":
        return "null"
    if v == "undefined":
        return "undefined"
    if v.startswith("["):
        return "array"
    if v.startswith("{"):
        return "object"
    # 数字
    if re.match(r"^[-\d.]+$", v):
        return "number"
    # 裸标识符（可能是变量引用或枚举）
    return "string"


def _extract_object_fields(obj_text: str) -> dict[str, str]:
    """从对象字面量文本（含外层 { }）提取 {field: type}。"""
    # 去掉外层 {}
    inner = obj_text.strip()
    if inner.startswith("{"):
        inner = inner[1:]
    if inner.endswith("}"):
        inner = inner[:-1]
    fields: dict[str, str] = {}
    # 按顶层逗号分割（考虑嵌套）
    parts: list[str] = []
    depth = 0
    in_str = None
    cur: list[str] = []
    i = 0
    while i < len(inner):
        ch = inner[i]
        if in_str:
            cur.append(ch)
            if ch == "\\":
                if i + 1 < len(inner):
                    cur.append(inner[i + 1])
                    i += 2
                    continue
            elif ch == in_str:
                in_str = None
            i += 1
            continue
        if ch in ("'", '"', "`"):
            in_str = ch
            cur.append(ch)
        elif ch in "[{(":
            depth += 1
            cur.append(ch)
        elif ch in "]})":
            depth -= 1
            cur.append(ch)
        elif ch == "," and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
        i += 1
    if cur:
        parts.append("".join(cur))
    # 解析每个 part 的 key: value
    for part in parts:
        part = part.strip()
        if not part:
            continue
        # key 可能是裸标识符或带引号
        m = re.match(r"^(?:'([^']*)'|\"([^\"]*)\"|`([^`]*)`|(\w+))\s*:\s*(.+)$", part, re.DOTALL)
        if not m:
            continue
        key = m.group(1) or m.group(2) or m.group(3) or m.group(4)
        val = m.group(5).strip().rstrip(",").strip()
        fields[key] = _infer_field_type(val)
    return fields


def _count_array_elements(arr_text: str) -> int:
    """估算数组元素数（按顶层逗号 + 1，空数组返回 0）。"""
    inner = arr_text.strip()
    if inner.startswith("["):
        inner = inner[1:]
    if inner.endswith("]"):
        inner = inner[:-1]
    inner = inner.strip()
    if not inner:
        return 0
    count = 1
    depth = 0
    in_str = None
    for ch in inner:
        if in_str:
            if ch == "\\":
                continue
            if ch == in_str:
                in_str = None
            continue
        if ch in ("'", '"', "`"):
            in_str = ch
        elif ch in "[{(":
            depth += 1
        elif ch in "]})":
            depth -= 1
        elif ch == "," and depth == 0:
            count += 1
    return count


def extract_data_contracts(scripts: list[str]) -> list[dict]:
    """扫描 JS 脚本列表，提取数据契约速览。

    返回 [{name, kind, count, fields}]：
    - name: 变量名
    - kind: 'array' | 'object'
    - count: 数组元素数（object 为 1）
    - fields: 首元素的字段→类型映射（对象数组取首元素；纯值数组 fields 为空）

    给 agent 当数据契约参考，知道原页面有哪些数据、字段是什么。
    """
    out: list[dict] = []
    for script in scripts:
        for m in _VAR_DECL_RE.finditer(script):
            name = m.group(1)
            bracket = m.group(2)
            start = m.end() - 1
            open_ch, close_ch = ("[", "]") if bracket == "[" else ("{", "}")
            end = _match_bracket_in(script, start, open_ch, close_ch)
            if end is None:
                continue
            literal = script[start:end + 1]
            kind = "array" if bracket == "[" else "object"
            if kind == "array":
                count = _count_array_elements(literal)
                # 取首元素的字段（若是对象数组）
                fields: dict[str, str] = {}
                inner = literal[1:-1].strip()
                if inner.startswith("{"):
                    first_end = _match_bracket_in(inner, 0, "{", "}")
                    if first_end is not None:
                        fields = _extract_object_fields(inner[:first_end + 1])
                out.append({"name": name, "kind": kind, "count": count, "fields": fields})
            else:
                fields = _extract_object_fields(literal)
                out.append({"name": name, "kind": kind, "count": 1, "fields": fields})
    return out
