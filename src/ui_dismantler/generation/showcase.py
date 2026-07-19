#!/usr/bin/env python3
"""generate_showcase.py - 设计系统展示页生成器

从组件库 CSS 自动提取设计令牌和组件类，生成自包含 HTML 展示页。
与组件库永远同步，零维护。

用法：
  python3 generate_showcase.py <组件库目录> --out showcase.html
  python3 generate_showcase.py out/kzk-about --out out/kzk-about/showcase.html
"""
from __future__ import annotations
import colorsys
import html
import re
from pathlib import Path
from urllib.parse import quote

from ui_dismantler.core.common import (
    extract_gradients, extract_root_vars, parse_rules, split_media_blocks,
)


def classify_var(name: str, value: str) -> str:
    """把 --sg-* 变量按语义分组。"""
    n = name.lower()
    v = value.lower()
    if n.startswith("--sg-on-") or n in ("--sg-ink", "--sg-muted", "--sg-subtle"):
        return "文字色 Text"
    if n.startswith("--sg-font"):
        return "字体 Font"
    if n in ("--sg-paper", "--sg-stage", "--sg-soft", "--sg-soft-accent", "--sg-tint", "--sg-splash-tint"):
        return "背景色 Background"
    if n in ("--sg-line",):
        return "分割线 Border"
    if n.startswith("--sg-radius"):
        return "圆角 Radius"
    if n.startswith("--sg-shadow"):
        return "阴影 Shadow"
    if n.startswith("--sg-warm") or n in ("--sg-green", "--sg-orange", "--sg-red", "--sg-error"):
        return "状态色 Status"
    if n.startswith("--sg-footer"):
        return "页脚色 Footer"
    return "功能色 Functional"



def is_color_var(name: str, value: str) -> bool:
    """判断变量是否是当前展示器可安全渲染的常见颜色值。"""
    return _parse_css_color(value) is not None


def _parse_css_color(value: str) -> tuple[int, int, int] | None:
    """把常见 CSS 颜色转换为 RGB；半透明颜色按白底合成。"""
    v = value.strip().lower()
    match = re.fullmatch(r"#([0-9a-f]{3,8})", v)
    if match:
        raw = match.group(1)
        if len(raw) in (3, 4):
            raw = "".join(char * 2 for char in raw)
        if len(raw) not in (6, 8):
            return None
        red, green, blue = int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
        alpha = int(raw[6:8], 16) / 255 if len(raw) == 8 else 1.0
    else:
        rgb_match = re.fullmatch(
            r"rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+)%?)?\s*\)",
            v,
        )
        if rgb_match:
            red, green, blue = (float(rgb_match.group(i)) for i in range(1, 4))
            alpha = float(rgb_match.group(4)) if rgb_match.group(4) else 1.0
            if rgb_match.group(4) and "%" in v.split("/")[-1]:
                alpha /= 100
        else:
            hsl_match = re.fullmatch(
                r"hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%(?:\s*[,/]\s*([\d.]+)%?)?\s*\)",
                v,
            )
            if not hsl_match:
                return None
            hue = (float(hsl_match.group(1)) % 360) / 360
            saturation = max(0.0, min(1.0, float(hsl_match.group(2)) / 100))
            lightness = max(0.0, min(1.0, float(hsl_match.group(3)) / 100))
            red_f, green_f, blue_f = colorsys.hls_to_rgb(hue, lightness, saturation)
            red, green, blue = red_f * 255, green_f * 255, blue_f * 255
            alpha = float(hsl_match.group(4)) if hsl_match.group(4) else 1.0
            if hsl_match.group(4) and "%" in v.split("/")[-1]:
                alpha /= 100
    alpha = max(0.0, min(1.0, alpha))
    channels = (max(0.0, min(255.0, channel)) for channel in (red, green, blue))
    return tuple(round(channel * alpha + 255 * (1 - alpha)) for channel in channels)


def _rgb_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def _mix_rgb(rgb: tuple[int, int, int], target: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    amount = max(0.0, min(1.0, amount))
    return tuple(round(channel + (target_channel - channel) * amount) for channel, target_channel in zip(rgb, target))


def _tonal_scale(value: str) -> list[str]:
    """从单个代表色生成紧凑的深浅色阶，用于 Bento 总览。"""
    rgb = _parse_css_color(value) or (100, 120, 255)
    stops = [
        ("dark", .90), ("dark", .72), ("dark", .54), ("dark", .36), ("dark", .16),
        ("base", 0), ("light", .20), ("light", .42), ("light", .66), ("light", .84),
    ]
    colors = []
    for direction, amount in stops:
        if direction == "dark":
            mixed = _mix_rgb(rgb, (0, 0, 0), amount)
        elif direction == "light":
            mixed = _mix_rgb(rgb, (255, 255, 255), amount)
        else:
            mixed = rgb
        colors.append(_rgb_hex(mixed))
    return colors


def _contrast_text(value: str) -> str:
    rgb = _parse_css_color(value)
    if not rgb:
        return "#ffffff"
    red, green, blue = (channel / 255 for channel in rgb)
    luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    return "#111214" if luminance > .58 else "#ffffff"


def _pick_semantic_colors(root_vars: dict[str, str]) -> list[dict[str, str]]:
    """从命名不完全一致的变量中选择四个总览代表色。"""
    candidates = [(name, value) for name, value in root_vars.items() if name.startswith("--sg-") and is_color_var(name, value)]
    fallbacks = [
        ("--ds-primary", "#6478FF"),
        ("--ds-secondary", "#17181C"),
        ("--ds-tertiary", "#17C7D4"),
        ("--ds-neutral", "#111214"),
    ]
    roles = [
        ("Primary", ("primary", "accent", "brand", "main")),
        ("Secondary", ("secondary", "ink", "dark", "text")),
        ("Tertiary", ("tertiary", "cyan", "aqua", "blue", "green", "orange", "warm")),
        ("Neutral", ("neutral", "black", "gray", "grey")),
    ]
    picked: list[dict[str, str]] = []
    used: set[str] = set()
    for index, (label, keywords) in enumerate(roles):
        choice = None
        for keyword in keywords:
            choice = next(((name, value) for name, value in candidates if name not in used and keyword in name.lower()), None)
            if choice:
                break
        if choice is None and label == "Neutral":
            choice = next(((name, value) for name, value in candidates if "ink" in name.lower()), None)
            choice = choice or next(((name, value) for name, value in candidates if "dark" in name.lower()), None)
            choice = choice or fallbacks[index]
        if choice is None:
            choice = next(((name, value) for name, value in candidates if name not in used), fallbacks[index])
        used.add(choice[0])
        picked.append({"label": label, "name": choice[0], "value": choice[1]})
    return picked


def _pick_font(font_vars: list[tuple[str, str]], keywords: tuple[str, ...], fallback: str) -> tuple[str, str]:
    for keyword in keywords:
        for name, value in font_vars:
            if keyword in name.lower():
                return name, value
    return font_vars[0] if font_vars else ("System", fallback)


def _icon_svg(name: str) -> str:
    icons = {
        "palette": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0 0 18h1.2a1.8 1.8 0 0 0 0-3.6h-.8a1.6 1.6 0 0 1 0-3.2H15A6 6 0 0 0 21 8.2C21 5.3 17 3 12 3Z"/><circle cx="7.7" cy="10.2" r="1"/><circle cx="10.4" cy="7" r="1"/><circle cx="14.4" cy="6.8" r="1"/><circle cx="17.2" cy="9.5" r="1"/></svg>',
        "search": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
        "home": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 8-7 8 7v9H4Z"/><path d="M9 20v-6h6v6"/></svg>',
        "user": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 20c.7-4 3.1-6 7-6s6.3 2 7 6"/></svg>',
        "edit": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10.6-10.6-3.2-3.2L5 15.8Z"/><path d="m13.8 7 3.2 3.2"/></svg>',
        "spark": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5Z"/><path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8Z"/></svg>',
        "grid": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>',
        "tag": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v6l8 8 7-7-8-8Z"/><circle cx="8" cy="8" r="1"/></svg>',
        "trash": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 10v7M14 10v7"/></svg>',
    }
    return icons.get(name, icons["spark"])


def build_bento_overview(
    root_vars: dict[str, str],
    groups: dict[str, list[tuple[str, str]]],
    component_classes: list[str],
    breakpoints: list[tuple[str, int, str]],
    gradients: list[dict],
) -> tuple[str, str]:
    """生成参考 Bento 面板的设计语言总览，同时返回页面强调色。"""
    colors = _pick_semantic_colors(root_vars)
    accent = colors[0]["value"]
    palette_items = []
    for color in colors:
        shades = "".join(f'<span style="background:{shade}"></span>' for shade in _tonal_scale(color["value"]))
        safe_value = html.escape(color["value"], quote=True)
        safe_name = html.escape(color["name"].replace("--sg-", ""))
        palette_items.append(
            '<div class="ds-palette-item">'
            f'<div class="ds-palette-main" style="--role-color:{safe_value};--role-text:{_contrast_text(color["value"])}">'
            f'<strong>{color["label"]}</strong><span>{safe_value}</span><small>{safe_name}</small></div>'
            f'<div class="ds-palette-scale">{shades}</div></div>'
        )

    font_vars = groups.get("字体 Font", [])
    fallback_font = 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
    type_specs = [
        ("headline", "Headline", _pick_font(font_vars, ("display", "headline", "title", "serif"), fallback_font), "#F0F0F1"),
        ("body", "Body", _pick_font(font_vars, ("body", "text", "sans"), fallback_font), "color-mix(in srgb, var(--ds-accent) 38%, #F2F2F3)"),
        ("label", "Label", _pick_font(font_vars, ("label", "ui", "mono"), fallback_font), "color-mix(in srgb, var(--ds-accent) 38%, #F2F2F3)"),
    ]
    type_cards = []
    for area, label, (font_name, font_value), sample_color in type_specs:
        short_font = html.escape(font_name.replace("--sg-", ""))
        safe_font = html.escape(font_value, quote=True)
        type_cards.append(
            f'<article class="ds-bento-card ds-type-card ds-area-{area}" style="--sample-font:{safe_font};--sample-color:{sample_color}">'
            f'<div class="ds-card-label"><strong>{label}</strong><span>{short_font}</span></div>'
            '<div class="ds-type-sample">Aa</div></article>'
        )

    variable_score = min(96, max(34, 28 + len(root_vars) * 2))
    component_score = min(94, max(30, 24 + len(component_classes)))
    responsive_score = min(90, max(26, 32 + len(breakpoints) * 9 + len(gradients)))
    overview = f'''
<section id="overview" class="ds-overview" aria-label="设计系统视觉总览">
  <div class="ds-bento-grid">
    <article class="ds-bento-palette">{"".join(palette_items)}</article>
    {"".join(type_cards)}
    <article class="ds-bento-card ds-area-controls">
      <div class="ds-demo-buttons">
        <button type="button" class="ds-demo-btn ds-demo-primary">Primary</button>
        <button type="button" class="ds-demo-btn ds-demo-secondary">Secondary</button>
        <button type="button" class="ds-demo-btn ds-demo-inverted">Inverted</button>
        <button type="button" class="ds-demo-btn ds-demo-outlined">Outlined</button>
      </div>
    </article>
    <article class="ds-bento-card ds-area-search">
      <label class="ds-demo-search">{_icon_svg("search")}<input type="text" value="Search" readonly aria-label="搜索框样张" /></label>
    </article>
    <article class="ds-bento-card ds-area-metrics">
      <div class="ds-demo-metrics" aria-label="令牌覆盖度">
        <span><i style="--metric-width:{variable_score}%;--metric-color:color-mix(in srgb, var(--ds-accent) 58%, #FFB8C9)"></i></span>
        <span><i style="--metric-width:{component_score}%;--metric-color:#D8D8DB"></i></span>
        <span><i style="--metric-width:{responsive_score}%;--metric-color:color-mix(in srgb, var(--ds-accent) 54%, #18D1DB)"></i></span>
      </div>
    </article>
    <article class="ds-bento-card ds-area-navigation">
      <div class="ds-demo-nav" aria-label="导航组件样张">
        <button type="button" class="is-active" aria-label="主页">{_icon_svg("home")}</button>
        <button type="button" aria-label="搜索">{_icon_svg("search")}</button>
        <button type="button" aria-label="用户">{_icon_svg("user")}</button>
      </div>
    </article>
    <article class="ds-bento-card ds-area-actions">
      <button type="button" class="ds-round-action" aria-label="编辑">{_icon_svg("edit")}</button>
      <button type="button" class="ds-label-action">{_icon_svg("edit")}<span>Label</span></button>
    </article>
    <article class="ds-bento-card ds-area-icons">
      <div class="ds-icon-cluster">
        <button type="button" class="ds-icon-pink" aria-label="自动增强">{_icon_svg("spark")}</button>
        <button type="button" class="ds-icon-neutral" aria-label="组件网格">{_icon_svg("grid")}</button>
        <button type="button" class="ds-icon-cyan" aria-label="标签">{_icon_svg("tag")}</button>
        <button type="button" class="ds-icon-coral" aria-label="删除">{_icon_svg("trash")}</button>
      </div>
    </article>
  </div>
</section>'''
    return overview, accent


def generate_showcase(lib_dir: Path) -> str:
    """生成自包含 HTML 展示页。"""
    css_files = sorted(lib_dir.glob("src/*.css"), key=lambda path: path.name.lower())
    if not css_files:
        return "<html><body>未找到 CSS 文件</body></html>"
    css_text = "\n".join(f.read_text(encoding="utf-8") for f in css_files)
    css_filename = css_files[0].name if len(css_files) == 1 else f"{len(css_files)} CSS files"
    lib_name = lib_dir.name
    safe_lib_name = html.escape(lib_name)
    safe_css_filename = html.escape(css_filename)
    stylesheet_links = "\n".join(
        f'<link rel="stylesheet" href="src/{html.escape(quote(path.name), quote=True)}" />'
        for path in css_files
    )

    # 1. 提取变量
    root_vars = extract_root_vars(css_text)
    # 分组
    groups: dict[str, list[tuple[str, str]]] = {}
    for name, value in root_vars.items():
        if name.startswith("--sg-"):
            cat = classify_var(name, value)
            groups.setdefault(cat, []).append((name, value))

    # 2. 提取断点
    media_blocks = split_media_blocks(css_text)
    breakpoints = []
    for query, body in media_blocks:
        mw = re.search(r"max-width\s*:\s*(\d+)px", query)
        minw = re.search(r"min-width\s*:\s*(\d+)px", query)
        if mw:
            breakpoints.append(("max", int(mw.group(1)), query))
        elif minw:
            breakpoints.append(("min", int(minw.group(1)), query))

    # 3. 提取组件类名（主体选择器）
    component_classes: list[str] = []
    for sel, props in parse_rules(css_text):
        for part in sel.split(","):
            part = part.strip()
            if not part:
                continue
            subject = re.split(r"[\s>+~]+", part)[-1]
            for m in re.finditer(r"\.((?:sg-)[a-z][\w-]*)", subject):
                cls = m.group(1)
                if cls not in component_classes:
                    component_classes.append(cls)

    # 4. 提取渐变
    gradients = extract_gradients(css_text)

    # 5. 构建设计语言总览（代表色、字体样张与组件原型）
    overview_html, overview_accent = build_bento_overview(
        root_vars, groups, component_classes, breakpoints, gradients
    )

    # 6. 生成完整明细 HTML
    sections = []
    nav_items = []

    # --- 色卡（分类卡片 + 响应式色板）---
    color_cats = ["功能色 Functional", "文字色 Text", "背景色 Background", "分割线 Border", "状态色 Status", "页脚色 Footer"]
    color_rows = ""
    color_count = 0
    for cat in color_cats:
        if cat not in groups:
            continue
        vars_list = groups[cat]
        chips = ""
        row_count = 0
        for name, value in vars_list:
            if not is_color_var(name, value):
                continue
            short_name = html.escape(name.replace("--sg-", ""))
            safe_value = html.escape(value, quote=True)
            tc = _contrast_text(value)
            chips += (
                f'<div class="ds-chip" style="background:{safe_value};color:{tc}">'
                f'<span class="ds-chip-name">{short_name}</span>'
                f'<span class="ds-chip-val">{safe_value}</span></div>'
            )
            row_count += 1
        if chips:
            label = cat.split(" ")[0]
            english = cat.split(" ", 1)[1] if " " in cat else ""
            color_count += row_count
            color_rows += (
                '<div class="ds-color-row">'
                f'<div class="ds-color-label"><span>{label}</span><small>{english}</small>'
                f'<em>{row_count:02d}</em></div>'
                f'<div class="ds-chips">{chips}</div></div>'
            )
    if color_rows:
        nav_items.append('<a href="#colors">色彩</a>')
        sections.append(
            '<section id="colors" class="ds-section ds-section-colors">'
            '<div class="ds-section-head"><div>'
            '<span class="ds-section-kicker">01 / PALETTE</span>'
            '<h2 class="ds-section-title">色卡系统 <span>Color Tokens</span></h2>'
            f'</div><span class="ds-section-count">{color_count} COLORS</span></div>'
            f'<div class="ds-color-board">{color_rows}</div></section>'
        )

    # --- 令牌速览（字体 + 圆角 + 阴影 + 渐变）---
    token_parts = []
    token_count = 0
    font_vars = groups.get("字体 Font", [])
    if font_vars:
        font_html = '<div class="ds-tokens-row"><div class="ds-tokens-label"><span>字体</span><small>Typography</small></div><div class="ds-tokens-chips">'
        for name, value in font_vars:
            short = html.escape(name.replace("--sg-", ""))
            safe_value = html.escape(value, quote=True)
            font_html += f'<span class="ds-font-chip" style="font-family:{safe_value}">{short}<small>{safe_value}</small></span>'
        font_html += '</div></div>'
        token_parts.append(font_html)
        token_count += len(font_vars)
    radius_vars = groups.get("圆角 Radius", [])
    if radius_vars:
        radius_html = '<div class="ds-tokens-row"><div class="ds-tokens-label"><span>圆角</span><small>Radius</small></div><div class="ds-tokens-chips">'
        for name, value in radius_vars:
            short = html.escape(name.replace("--sg-", ""))
            safe_value = html.escape(value, quote=True)
            radius_html += f'<span class="ds-token-chip"><span class="ds-radius-box" style="border-radius:{safe_value}"></span><span>{short}<small>{safe_value}</small></span></span>'
        radius_html += '</div></div>'
        token_parts.append(radius_html)
        token_count += len(radius_vars)
    shadow_vars = groups.get("阴影 Shadow", [])
    if shadow_vars:
        shadow_html = '<div class="ds-tokens-row"><div class="ds-tokens-label"><span>阴影</span><small>Elevation</small></div><div class="ds-tokens-chips">'
        for name, value in shadow_vars:
            short = html.escape(name.replace("--sg-", ""))
            safe_value = html.escape(value, quote=True)
            shadow_html += f'<span class="ds-token-chip"><span class="ds-shadow-box" style="box-shadow:{safe_value}"></span><span>{short}<small>{safe_value}</small></span></span>'
        shadow_html += '</div></div>'
        token_parts.append(shadow_html)
        token_count += len(shadow_vars)
    if gradients:
        visible_gradients = gradients[:12]
        grad_html = '<div class="ds-tokens-row"><div class="ds-tokens-label"><span>渐变</span><small>Gradients</small></div><div class="ds-tokens-chips ds-gradient-list">'
        for index, g in enumerate(visible_gradients, 1):
            safe_gradient = html.escape(g["value"], quote=True)
            grad_html += f'<span class="ds-gradient-token"><span class="ds-grad-chip" style="background:{safe_gradient}"></span><small>Gradient {index:02d}</small></span>'
        grad_html += '</div></div>'
        token_parts.append(grad_html)
        token_count += len(visible_gradients)
    if token_parts:
        nav_items.append('<a href="#tokens">令牌</a>')
        sections.append(
            '<section id="tokens" class="ds-section">'
            '<div class="ds-section-head"><div>'
            '<span class="ds-section-kicker">02 / FOUNDATIONS</span>'
            '<h2 class="ds-section-title">令牌速览 <span>Foundation Tokens</span></h2>'
            f'</div><span class="ds-section-count">{token_count} TOKENS</span></div>'
            f'<div class="ds-tokens-grid">{"".join(token_parts)}</div></section>'
        )

    # --- 组件与交互态（完整清单 + 状态预览）---
    interactive_comps = extract_interactive_components(css_text, component_classes)
    if component_classes:
        comp_tags = '<div class="ds-comp-list">' + "".join(f'<span class="ds-comp-tag">{c}</span>' for c in component_classes) + '</div>'
        inventory_html = (
            '<details class="ds-inventory">'
            f'<summary><strong>组件类清单</strong><em>{len(component_classes)} ITEMS</em></summary>'
            f'{comp_tags}</details>'
        )
        if interactive_comps:
            interact_html = (
                '<div class="ds-interact-toolbar"><strong>状态预览</strong>'
                '<button class="ds-toggle-btn" type="button" aria-pressed="false" onclick="dsToggleAllStates(this)">'
                '<span class="ds-toggle-dot"></span><span class="ds-toggle-label">预览全部交互态</span></button></div>'
                '<div class="ds-interact-list">'
            )
            for comp in interactive_comps:
                cls = comp["cls"]
                states = comp["states"]
                previews = f'<div class="ds-interact-cell"><span class="ds-interact-mini-label">默认</span><div class="ds-interact-mini">{build_component_preview(cls, "default")}</div></div>'
                for st in states:
                    previews += f'<div class="ds-interact-cell"><span class="ds-interact-mini-label">{st}</span><div class="ds-interact-mini">{build_component_preview(cls, st)}</div></div>'
                interact_html += f'<article class="ds-interact-item"><span class="ds-interact-name">{cls}</span><div class="ds-interact-cells">{previews}</div></article>'
            interact_html += '</div>'
        else:
            interact_html = '<div class="ds-empty-state"><strong>暂无可识别交互态</strong></div>'
        nav_items.append('<a href="#components">组件</a>')
        sections.append(
            '<section id="components" class="ds-section">'
            '<div class="ds-section-head"><div>'
            '<span class="ds-section-kicker">03 / COMPONENTS</span>'
            '<h2 class="ds-section-title">组件与交互态 <span>Component States</span></h2>'
            f'</div><span class="ds-section-count">{len(interactive_comps)} / {len(component_classes)}</span></div>'
            f'{inventory_html}{interact_html}</section>'
        )

    # --- 响应式断点 ---
    if breakpoints:
        bp_html = '<div class="ds-table-wrap"><table class="ds-bp-table"><thead><tr><th>规则</th><th>断点</th><th>媒体查询</th></tr></thead><tbody>'
        for typ, val, query in sorted(breakpoints, key=lambda x: x[1]):
            direction = "最大宽度" if typ == "max" else "最小宽度"
            symbol = "≤" if typ == "max" else "≥"
            safe_query = html.escape(query.strip()[:80])
            bp_html += f'<tr><td><span class="ds-bp-rule">{direction}</span></td><td><strong>{symbol} {val}px</strong></td><td><code>{safe_query}</code></td></tr>'
        bp_html += '</tbody></table></div>'
        nav_items.append('<a href="#breakpoints">断点</a>')
        sections.append(
            '<section id="breakpoints" class="ds-section">'
            '<div class="ds-section-head"><div>'
            '<span class="ds-section-kicker">04 / RESPONSIVE</span>'
            '<h2 class="ds-section-title">响应式断点 <span>Breakpoints</span></h2>'
            f'</div><span class="ds-section-count">{len(breakpoints)} RULES</span></div>'
            f'{bp_html}</section>'
        )

    sections_html = "\n".join(sections)
    nav_html = '<a href="#overview">总览</a>' + "".join(nav_items)

    # JS 不能放 f-string 里（花括号冲突），用独立字符串
    ds_js = """<script>
(function() {
  var sheets = document.styleSheets;
  var hoverRules = [];
  for (var i = 0; i < sheets.length; i++) {
    try {
      var rules = sheets[i].cssRules || sheets[i].rules;
      for (var j = 0; j < rules.length; j++) {
        var r = rules[j];
        if (r.selectorText && r.selectorText.indexOf(':hover') > -1) {
          var newSel = r.selectorText.replace(/:hover/g, '.force-hover');
          hoverRules.push(newSel + ' { ' + r.style.cssText + ' }');
        }
      }
    } catch(e) {}
  }
  if (hoverRules.length) {
    var style = document.createElement('style');
    style.textContent = hoverRules.join('\\n');
    document.head.appendChild(style);
  }
})();
var dsToggleState = false;
function dsToggleAllStates(button) {
  dsToggleState = !dsToggleState;
  if (button) {
    button.setAttribute('aria-pressed', dsToggleState ? 'true' : 'false');
    var text = button.querySelector('.ds-toggle-label');
    if (text) text.textContent = dsToggleState ? '恢复默认状态' : '预览全部交互态';
  }
  document.querySelectorAll('.ds-interact-mini').forEach(function(stage) {
    var el = stage.firstElementChild;
    if (!el) return;
    var label = stage.parentElement.querySelector('.ds-interact-mini-label');
    var labelText = label ? label.textContent : '';
    if (dsToggleState) {
      el.classList.add('force-hover');
      ['active','open','on','picked','right','wrong'].forEach(function(s) {
        if (labelText.indexOf(s) > -1) el.classList.add(s);
      });
    } else {
      el.classList.remove('force-hover');
      ['active','open','on','picked','right','wrong'].forEach(function(s) { el.classList.remove(s); });
    }
  });
}
</script>"""

    html_head = f"""<!doctype html>
<html lang="zh-CN" class="ds-showcase-root">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<title>{safe_lib_name} · 设计系统 Design System</title>
<!-- 先加载组件库，再由 showcase 宿主样式接管页面级布局 -->
{stylesheet_links}
<style>
/* === Showcase host: 与被预览组件库的全局 html/body 规则隔离 === */
:root {{
  --ds-accent: {overview_accent};
  --ds-ink: #17181c;
  --ds-muted: #737681;
  --ds-subtle: #a3a6af;
  --ds-line: rgba(23, 24, 28, 0.09);
  --ds-surface: rgba(255, 255, 255, 0.92);
  --ds-canvas: #f1f2f4;
  --ds-radius-lg: 28px;
  --ds-radius-md: 18px;
  --ds-shadow: 0 24px 70px rgba(20, 24, 35, 0.08);
}}
* {{ box-sizing: border-box; }}
html.ds-showcase-root {{
  width: auto !important; height: auto !important; min-height: 100% !important;
  overflow: auto !important; display: block !important; scroll-behavior: smooth;
  background: var(--ds-canvas) !important;
}}
body.ds-showcase-body {{
  width: auto !important; height: auto !important; min-height: 100vh !important;
  overflow: auto !important; display: block !important;
  align-items: initial !important; justify-content: initial !important;
  margin: 0 !important; padding: 0 !important;
  color: var(--ds-ink) !important; background: var(--ds-canvas) !important;
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif !important;
  font-size: 16px; line-height: 1.6 !important; -webkit-font-smoothing: antialiased;
}}
body.ds-showcase-body::before {{
  content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image: radial-gradient(circle, rgba(105,109,120,.19) 1.2px, transparent 1.3px);
  background-position: 0 0; background-size: 26px 26px;
  mask-image: linear-gradient(to bottom, #000 0%, rgba(0,0,0,.72) 54%, transparent 100%);
}}
.ds-shell {{ position: relative; z-index: 1; width: min(1480px, calc(100% - 48px)); margin: 0 auto; padding: 32px 0 72px; }}

/* Header and compact navigation */
.ds-topbar {{ position: relative !important; inset: auto !important; width: auto !important; height: auto !important; display: flex !important; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 18px; padding: 0 4px; }}
.ds-brand {{ min-width: 0; display: flex !important; align-items: center; gap: 12px; }}
.ds-brand-mark {{ flex: 0 0 auto; width: 38px; height: 38px; display: grid; place-items: center; color: var(--ds-muted); border: 1px solid rgba(23,24,28,.1); border-radius: 12px; background: rgba(255,255,255,.72); box-shadow: 0 8px 22px rgba(20,24,35,.06); }}
.ds-brand-mark svg {{ width: 23px; height: 23px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }}
.ds-brand-copy {{ min-width: 0; display: flex; align-items: baseline; gap: 9px; }}
.ds-brand-copy h1 {{ max-width: 100%; margin: 0 !important; overflow: hidden; color: #686c77 !important; font-size: clamp(1.35rem, 2.5vw, 1.75rem) !important; font-weight: 580 !important; letter-spacing: -.035em; line-height: 1.1 !important; text-overflow: ellipsis; white-space: nowrap; }}
.ds-brand-copy small {{ color: var(--ds-subtle); font: 650 .63rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .06em; text-transform: uppercase; }}
.ds-top-tools {{ min-width: 0; display: flex !important; align-items: center; justify-content: flex-end; gap: 12px; }}
.ds-meta {{ display: flex !important; align-items: center; gap: 5px; }}
.ds-meta > span {{ min-width: 58px; display: flex; align-items: baseline; justify-content: center; gap: 4px; padding: 7px 9px; border: 1px solid rgba(23,24,28,.08); border-radius: 999px; background: rgba(255,255,255,.65); }}
.ds-meta strong {{ color: var(--ds-ink); font: 750 .72rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }}
.ds-meta small {{ color: var(--ds-subtle); font-size: .54rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }}
.ds-nav {{ display: flex !important; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 2px; }}
.ds-nav a {{ padding: 7px 10px; color: var(--ds-muted); border-radius: 999px; text-decoration: none; font-size: .68rem; font-weight: 680; transition: color .2s ease, background .2s ease; }}
.ds-nav a:hover {{ color: var(--ds-ink); background: rgba(255,255,255,.78); }}

/* Bento overview */
.ds-overview {{ position: relative !important; inset: auto !important; display: block !important; width: auto !important; height: auto !important; padding: 17px !important; overflow: hidden; scroll-margin-top: 18px; border: 4px solid color-mix(in srgb, var(--ds-accent) 78%, #5F50FF) !important; border-radius: 29px !important; background: #0F1012 !important; box-shadow: 0 28px 76px rgba(14,16,23,.23), 0 0 0 1px rgba(255,255,255,.08) inset, 0 0 32px color-mix(in srgb, var(--ds-accent) 18%, transparent); }}
.ds-bento-grid {{ display: grid !important; grid-template-columns: 1.03fr 1.12fr 1.12fr 1.12fr; grid-template-areas: "palette headline controls search" "palette body metrics navigation" "palette label actions icons"; grid-template-rows: repeat(3, minmax(170px, auto)); gap: 16px; }}
.ds-bento-card {{ min-width: 0; min-height: 170px; display: flex !important; align-items: center; justify-content: center; padding: 22px !important; overflow: hidden; border: 1px solid rgba(255,255,255,.025); border-radius: 23px !important; background: #1D1E20 !important; box-shadow: 0 1px 0 rgba(255,255,255,.025) inset; }}
.ds-bento-palette {{ grid-area: palette; min-width: 0; display: flex !important; flex-direction: column !important; gap: 12px; }}
.ds-palette-item {{ min-width: 0; flex: 1 1 0; display: flex !important; flex-direction: column !important; overflow: hidden; border-radius: 21px; background: #090A0B; box-shadow: 0 1px 0 rgba(255,255,255,.05) inset; }}
.ds-palette-main {{ min-height: 82px; flex: 1 1 auto; display: grid !important; grid-template-columns: 1fr auto; grid-template-rows: auto auto; align-content: center; gap: 3px 12px; padding: 18px 20px; color: var(--role-text); background: var(--role-color); }}
.ds-palette-main strong {{ align-self: end; font-size: .82rem; font-weight: 760; }}
.ds-palette-main span {{ align-self: end; font: 700 .72rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }}
.ds-palette-main small {{ grid-column: 1 / -1; max-width: 100%; overflow: hidden; opacity: .66; font: 560 .57rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }}
.ds-palette-scale {{ height: 36px; display: grid !important; grid-template-columns: repeat(10, minmax(0, 1fr)); overflow: hidden; }}
.ds-palette-scale span {{ min-width: 0; }}
.ds-area-headline {{ grid-area: headline; }}
.ds-area-body {{ grid-area: body; }}
.ds-area-label {{ grid-area: label; }}
.ds-area-controls {{ grid-area: controls; }}
.ds-area-search {{ grid-area: search; }}
.ds-area-metrics {{ grid-area: metrics; }}
.ds-area-navigation {{ grid-area: navigation; }}
.ds-area-actions {{ grid-area: actions; }}
.ds-area-icons {{ grid-area: icons; }}
.ds-type-card {{ position: relative; flex-direction: column !important; align-items: stretch !important; justify-content: space-between !important; }}
.ds-card-label {{ width: 100%; display: flex !important; align-items: center; justify-content: space-between; gap: 12px; color: #A98F97; }}
.ds-card-label strong, .ds-card-label span {{ overflow: hidden; font-size: .72rem; font-weight: 680; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }}
.ds-card-label span {{ opacity: .82; }}
.ds-type-sample {{ margin: auto 0; color: var(--sample-color); font-family: var(--sample-font) !important; font-size: clamp(4.7rem, 8vw, 7rem); font-weight: 470; letter-spacing: -.08em; line-height: .92; text-align: center; }}
.ds-overview button, .ds-overview input {{ font-family: inherit !important; }}
.ds-demo-buttons {{ width: min(100%, 310px); display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }}
.ds-demo-btn {{ min-width: 0 !important; min-height: 42px !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; margin: 0 !important; padding: 9px 13px !important; border: 0 !important; border-radius: 999px !important; box-shadow: none !important; cursor: default; font-size: .76rem !important; font-weight: 680 !important; line-height: 1 !important; transform: none !important; }}
.ds-demo-primary {{ color: #1C1015 !important; background: color-mix(in srgb, var(--ds-accent) 55%, #FFD0DD) !important; }}
.ds-demo-secondary {{ color: #DDBAC4 !important; background: #29292C !important; }}
.ds-demo-inverted {{ color: #252528 !important; background: #DEDEE0 !important; }}
.ds-demo-outlined {{ color: #E4BCC7 !important; border: 1px solid #A47783 !important; background: transparent !important; }}
.ds-demo-search {{ width: min(100%, 320px); min-height: 48px; display: flex !important; align-items: center; gap: 12px; padding: 0 16px; border: 1px solid color-mix(in srgb, var(--ds-accent) 36%, #765964); border-radius: 18px; background: #29292B; }}
.ds-demo-search svg {{ flex: 0 0 auto; width: 19px; height: 19px; fill: none; stroke: #B19099; stroke-width: 1.8; stroke-linecap: round; }}
.ds-demo-search input {{ position: static !important; inset: auto !important; min-width: 0 !important; width: 100% !important; height: auto !important; margin: 0 !important; padding: 0 !important; color: #DBB9C3 !important; border: 0 !important; outline: 0 !important; background: transparent !important; box-shadow: none !important; font-size: .8rem !important; }}
.ds-demo-metrics {{ width: min(100%, 330px); display: flex !important; flex-direction: column !important; gap: 15px; }}
.ds-demo-metrics span {{ height: 8px; display: block; overflow: hidden; border-radius: 999px; background: #2A2A2D; }}
.ds-demo-metrics i {{ width: var(--metric-width); height: 100%; display: block; border-radius: inherit; background: var(--metric-color); }}
.ds-demo-nav {{ width: min(100%, 320px); display: grid !important; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 10px; border-radius: 24px; background: #29292B; }}
.ds-demo-nav button {{ width: 48px !important; height: 48px !important; display: grid !important; place-items: center; justify-self: center; margin: 0 !important; padding: 0 !important; color: #DDB8C2 !important; border: 0 !important; border-radius: 50% !important; background: transparent !important; box-shadow: none !important; transform: none !important; }}
.ds-demo-nav button.is-active {{ color: #521528 !important; background: color-mix(in srgb, var(--ds-accent) 48%, #FFC5D4) !important; }}
.ds-overview svg {{ fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }}
.ds-demo-nav svg, .ds-round-action svg, .ds-label-action svg, .ds-icon-cluster svg {{ width: 20px; height: 20px; }}
.ds-area-actions {{ gap: 28px; }}
.ds-round-action, .ds-label-action, .ds-icon-cluster button {{ display: inline-flex !important; align-items: center !important; justify-content: center !important; margin: 0 !important; border: 0 !important; box-shadow: none !important; transform: none !important; }}
.ds-round-action {{ width: 56px !important; height: 56px !important; padding: 0 !important; color: #092C30 !important; border-radius: 19px !important; background: color-mix(in srgb, var(--ds-accent) 52%, #17CFD8) !important; }}
.ds-label-action {{ gap: 9px; min-height: 44px !important; padding: 9px 18px !important; color: #2D1020 !important; border-radius: 999px !important; background: color-mix(in srgb, var(--ds-accent) 66%, #FF4F91) !important; font-size: .78rem !important; font-weight: 700 !important; }}
.ds-icon-cluster {{ display: flex !important; align-items: center; justify-content: center; flex-wrap: wrap; gap: 12px; }}
.ds-icon-cluster button {{ width: 46px !important; height: 46px !important; padding: 0 !important; border-radius: 50% !important; }}
.ds-icon-pink {{ color: #5A1630 !important; background: color-mix(in srgb, var(--ds-accent) 48%, #FFC4D4) !important; }}
.ds-icon-neutral {{ color: #3B3B40 !important; background: #D2D2D4 !important; }}
.ds-icon-cyan {{ color: #05383D !important; background: color-mix(in srgb, var(--ds-accent) 40%, #0ED2DD) !important; }}
.ds-icon-coral {{ color: #7A2025 !important; background: #FFAAA5 !important; }}

/* Main sections */
.ds-main {{ position: relative !important; inset: auto !important; width: auto !important; height: auto !important; display: block !important; }}
.ds-section {{
  position: relative !important; inset: auto !important; transform: none !important; opacity: 1 !important;
  display: block !important; width: auto !important; height: auto !important; max-width: none !important;
  margin: 20px 0 0 !important; padding: 28px !important; overflow: hidden;
  scroll-margin-top: 20px; border: 1px solid rgba(255,255,255,.75); border-radius: var(--ds-radius-lg) !important;
  background: var(--ds-surface) !important; box-shadow: var(--ds-shadow) !important; backdrop-filter: blur(18px);
}}
.ds-section-head {{ display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 18px; }}
.ds-section-kicker {{ display: block; margin-bottom: 7px; color: var(--ds-accent); font-size: .66rem; font-weight: 800; letter-spacing: .14em; }}
.ds-section-title {{ margin: 0 !important; padding: 0 !important; border: 0 !important; color: var(--ds-ink) !important; font-size: clamp(1.35rem, 2.4vw, 1.85rem) !important; line-height: 1.2 !important; letter-spacing: -.025em; }}
.ds-section-title span {{ margin-left: .3em; color: var(--ds-subtle); font-size: .58em; font-weight: 520; letter-spacing: -.01em; }}
.ds-section-count {{ flex: 0 0 auto; padding: 7px 10px; color: var(--ds-muted); border: 1px solid var(--ds-line); border-radius: 999px; background: #f8f8fa; font: 700 .64rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .06em; }}

/* Colors */
.ds-color-board {{ display: flex; flex-direction: column; gap: 12px; }}
.ds-color-row {{ display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--ds-line); border-radius: var(--ds-radius-md); background: #f8f8fa; }}
.ds-color-label {{ display: flex; align-items: center; gap: 8px; min-height: 24px; color: var(--ds-ink); }}
.ds-color-label span {{ font-size: .8rem; font-weight: 750; }}
.ds-color-label small {{ color: var(--ds-subtle); font-size: .64rem; letter-spacing: .04em; text-transform: uppercase; }}
.ds-color-label em {{ margin-left: auto; color: var(--ds-subtle); font: normal 650 .66rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; }}
.ds-chips {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }}
.ds-chip {{ min-width: 0; min-height: 86px; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-end; gap: 3px; padding: 14px; overflow: hidden; border-radius: 13px; box-shadow: inset 0 0 0 1px rgba(15,18,25,.075); transition: transform .22s ease, box-shadow .22s ease; }}
.ds-chip:hover {{ transform: translateY(-2px); box-shadow: inset 0 0 0 1px rgba(15,18,25,.08), 0 12px 24px rgba(20,24,35,.1); }}
.ds-chip-name {{ max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 750 .76rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }}
.ds-chip-val {{ max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .72; font: 500 .65rem/1.25 ui-monospace, SFMono-Regular, Menlo, monospace; }}

/* Foundation tokens */
.ds-tokens-grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }}
.ds-tokens-row {{ min-width: 0; display: flex; flex-direction: column; gap: 16px; padding: 18px; border: 1px solid var(--ds-line); border-radius: var(--ds-radius-md); background: #f8f8fa; }}
.ds-tokens-label {{ display: flex; align-items: baseline; gap: 8px; }}
.ds-tokens-label span {{ color: var(--ds-ink); font-size: .82rem; font-weight: 750; }}
.ds-tokens-label small {{ color: var(--ds-subtle); font-size: .64rem; letter-spacing: .04em; text-transform: uppercase; }}
.ds-tokens-chips {{ display: flex; flex-wrap: wrap; align-items: stretch; gap: 10px; }}
.ds-font-chip, .ds-token-chip, .ds-gradient-token {{ min-width: 130px; display: flex; align-items: center; gap: 10px; padding: 10px 12px; color: #3f424b; border: 1px solid rgba(23,24,28,.075); border-radius: 12px; background: #fff; font-size: .76rem; }}
.ds-font-chip {{ flex-direction: column; align-items: flex-start; gap: 2px; font-size: .9rem; }}
.ds-font-chip small, .ds-token-chip small, .ds-gradient-token small {{ display: block; max-width: 190px; margin-top: 2px; overflow: hidden; color: var(--ds-subtle); font: 500 .6rem/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }}
.ds-radius-box {{ flex: 0 0 auto; width: 42px; height: 42px; display: inline-block; background: linear-gradient(135deg, var(--ds-accent), #a7b4ff); box-shadow: inset 0 0 0 1px rgba(255,255,255,.28); }}
.ds-shadow-box {{ flex: 0 0 auto; width: 48px; height: 38px; display: inline-block; border-radius: 9px; background: #fff; }}
.ds-gradient-list {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); width: 100%; }}
.ds-gradient-token {{ min-width: 0; flex-direction: column; align-items: stretch; gap: 7px; }}
.ds-grad-chip {{ width: 100%; height: 38px; display: block; border-radius: 9px; box-shadow: inset 0 0 0 1px rgba(15,18,25,.06); }}

/* Component inventory and previews */
.ds-inventory {{ overflow: hidden; margin-bottom: 14px; border: 1px solid var(--ds-line); border-radius: var(--ds-radius-md); background: #f8f8fa; }}
.ds-inventory summary {{ display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 15px 17px; cursor: pointer; list-style: none; user-select: none; }}
.ds-inventory summary::-webkit-details-marker {{ display: none; }}
.ds-inventory summary strong {{ color: var(--ds-ink); font-size: .8rem; }}
.ds-inventory summary em {{ color: var(--ds-muted); font: normal 700 .62rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; }}
.ds-inventory summary::after {{ content: "+"; order: 3; display: grid; place-items: center; width: 24px; height: 24px; color: var(--ds-muted); border: 1px solid var(--ds-line); border-radius: 50%; background: #fff; font-size: .9rem; }}
.ds-inventory[open] summary::after {{ content: "−"; }}
.ds-comp-list {{ display: flex; flex-wrap: wrap; gap: 6px; padding: 0 17px 17px; }}
.ds-comp-tag {{ padding: 5px 8px; color: #555966; border: 1px solid var(--ds-line); border-radius: 8px; background: #fff; font: 550 .64rem/1.25 ui-monospace, SFMono-Regular, Menlo, monospace; }}
.ds-interact-toolbar {{ display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 12px; padding: 12px 14px; border: 1px solid var(--ds-line); border-radius: 14px; background: #f8f8fa; }}
.ds-interact-toolbar strong {{ font-size: .8rem; }}
.ds-toggle-btn {{ appearance: none; display: inline-flex !important; align-items: center !important; justify-content: center !important; gap: 8px; min-height: 36px; padding: 8px 13px !important; color: #fff !important; border: 0 !important; border-radius: 999px !important; background: var(--ds-ink) !important; box-shadow: 0 8px 18px rgba(23,24,28,.14); cursor: pointer; font: 650 .7rem/1 sans-serif !important; transition: transform .2s ease, background .2s ease; }}
.ds-toggle-btn:hover {{ transform: translateY(-1px); background: #2d3038 !important; }}
.ds-toggle-btn[aria-pressed="true"] {{ background: var(--ds-accent) !important; }}
.ds-toggle-dot {{ width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 4px rgba(255,255,255,.13); }}
.ds-toggle-label {{ color: inherit !important; font-size: inherit !important; }}
.ds-interact-list {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 10px; }}
.ds-empty-state {{ display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 150px; padding: 24px; color: var(--ds-muted); border: 1px dashed var(--ds-line); border-radius: var(--ds-radius-md); background: #f8f8fa; text-align: center; }}
.ds-empty-state strong {{ color: var(--ds-ink); font-size: .82rem; }}
.ds-interact-item {{ min-width: 0; display: flex !important; flex-direction: column !important; gap: 11px; padding: 14px !important; overflow: hidden; border: 1px solid var(--ds-line); border-radius: 15px; background: #f8f8fa; }}
.ds-interact-name {{ color: #424650; font: 700 .7rem/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; }}
.ds-interact-cells {{ min-width: 0; display: flex; align-items: stretch; flex-wrap: wrap; gap: 7px; }}
.ds-interact-cell {{ min-width: 0; flex: 1 1 120px; display: flex; flex-direction: column; align-items: stretch; gap: 5px; }}
.ds-interact-mini-label {{ color: var(--ds-subtle); font: 700 .56rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; }}
.ds-interact-mini {{ min-width: 0; min-height: 74px; display: flex; align-items: center; justify-content: center; padding: 10px; overflow: hidden; contain: layout paint; position: relative; border: 1px solid rgba(23,24,28,.065); border-radius: 11px; background: #fff; }}
.ds-interact-mini > * {{ max-width: 100%; transform: scale(.86); transform-origin: center; }}
/* 隔离 absolute/fixed 组件，防止覆盖展示页 */
.ds-interact-mini .sg-modal-overlay, .ds-interact-mini .sg-splash, .ds-interact-mini .sg-cause-chain-svg,
.ds-interact-mini .sg-modal-content, .ds-interact-mini .sg-whatif-modal,
.ds-interact-mini .sg-progress-wrap, .ds-interact-mini .sg-timeline-nav > svg {{
  position: relative !important; inset: auto !important; top: auto !important; right: auto !important;
  left: auto !important; bottom: auto !important; z-index: auto !important;
  display: flex !important; opacity: 1 !important; transform: scale(.86) !important;
  width: auto !important; height: auto !important; max-width: 100% !important; min-height: 24px;
  padding: 6px 10px !important; overflow: hidden !important; border-radius: 8px !important;
  background: rgba(23,24,28,.045) !important; backdrop-filter: none !important;
}}
.ds-interact-mini .sg-modal-overlay.active, .ds-interact-mini .sg-splash.hide {{ display: flex !important; opacity: 1 !important; }}

/* Breakpoint table */
.ds-table-wrap {{ overflow-x: auto; border: 1px solid var(--ds-line); border-radius: var(--ds-radius-md); }}
.ds-bp-table {{ width: 100% !important; border-collapse: collapse !important; background: #fff; font-size: .78rem; }}
.ds-bp-table th {{ padding: 12px 16px; color: var(--ds-subtle); background: #f8f8fa; border-bottom: 1px solid var(--ds-line); font-size: .62rem; font-weight: 750; letter-spacing: .08em; text-align: left; text-transform: uppercase; }}
.ds-bp-table td {{ padding: 15px 16px; color: var(--ds-muted); border-bottom: 1px solid var(--ds-line); vertical-align: middle; }}
.ds-bp-table tr:last-child td {{ border-bottom: 0; }}
.ds-bp-table strong {{ color: var(--ds-ink); font-variant-numeric: tabular-nums; }}
.ds-bp-rule {{ display: inline-flex; padding: 5px 8px; color: #50545e; border-radius: 7px; background: #f1f2f4; font-size: .68rem; font-weight: 650; }}
.ds-bp-table code {{ color: #555a67; font: 550 .68rem/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: normal; word-break: break-word; }}

.ds-footer {{ display: flex; justify-content: flex-end; padding: 18px 8px 0; color: var(--ds-subtle); font-size: .65rem; }}
.ds-footer code {{ color: var(--ds-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }}

@media (max-width: 1160px) {{
  .ds-topbar {{ align-items: flex-start; }}
  .ds-top-tools {{ flex-direction: column; align-items: flex-end; gap: 7px; }}
  .ds-bento-grid {{
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-areas: "palette headline" "palette body" "palette label" "controls search" "metrics navigation" "actions icons";
    grid-template-rows: repeat(6, minmax(166px, auto));
  }}
}}
@media (max-width: 820px) {{
  .ds-shell {{ width: min(100% - 28px, 1480px); padding-top: 18px; }}
  .ds-topbar {{ flex-direction: column; gap: 12px; }}
  .ds-top-tools {{ width: 100%; align-items: stretch; }}
  .ds-meta {{ justify-content: flex-start; flex-wrap: wrap; }}
  .ds-nav {{ justify-content: flex-start; }}
  .ds-overview {{ padding: 12px !important; border-width: 3px !important; border-radius: 24px !important; }}
  .ds-bento-grid {{ gap: 12px; }}
  .ds-bento-card {{ padding: 18px !important; border-radius: 19px !important; }}
  .ds-section {{ padding: 21px !important; border-radius: 22px !important; }}
  .ds-section-head {{ flex-direction: column; gap: 12px; }}
  .ds-tokens-grid {{ grid-template-columns: 1fr; }}
  .ds-interact-list {{ grid-template-columns: 1fr; }}
}}
@media (max-width: 620px) {{
  .ds-shell {{ width: min(100% - 20px, 1480px); padding-top: 14px; }}
  .ds-brand-mark {{ width: 34px; height: 34px; }}
  .ds-brand-copy {{ align-items: flex-start; flex-direction: column; gap: 4px; }}
  .ds-meta > span {{ min-width: 0; padding: 7px 9px; }}
  .ds-nav {{ overflow-x: auto; flex-wrap: nowrap; justify-content: flex-start; padding-bottom: 2px; }}
  .ds-nav a {{ flex: 0 0 auto; }}
  .ds-bento-grid {{
    grid-template-columns: 1fr;
    grid-template-areas: "palette" "headline" "body" "label" "controls" "search" "metrics" "navigation" "actions" "icons";
    grid-template-rows: none;
  }}
  .ds-bento-palette {{ gap: 10px; }}
  .ds-palette-item {{ min-height: 118px; flex-basis: auto; }}
  .ds-bento-card {{ min-height: 158px; }}
  .ds-type-sample {{ font-size: clamp(4.5rem, 28vw, 6.2rem); }}
  .ds-section {{ padding: 17px !important; margin-top: 12px !important; }}
  .ds-section-title span {{ display: block; margin: .32em 0 0; }}
  .ds-chips {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
  .ds-chip {{ min-height: 78px; padding: 11px; }}
  .ds-interact-toolbar {{ align-items: flex-start; flex-direction: column; }}
  .ds-toggle-btn {{ width: 100%; }}
  .ds-interact-cell {{ flex-basis: 100%; }}
}}
@media (prefers-reduced-motion: reduce) {{
  html.ds-showcase-root {{ scroll-behavior: auto; }}
  *, *::before, *::after {{ transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }}
}}
</style>
</head>
<body class="ds-showcase-body">
<div class="ds-shell">
<header class="ds-topbar">
  <div class="ds-brand">
    <span class="ds-brand-mark">{_icon_svg("palette")}</span>
    <div class="ds-brand-copy"><h1>{safe_lib_name}</h1><small>{safe_css_filename}</small></div>
  </div>
  <div class="ds-top-tools">
    <div class="ds-meta" aria-label="设计系统统计">
      <span><strong>{len(root_vars)}</strong><small>Vars</small></span>
      <span><strong>{len(component_classes)}</strong><small>Classes</small></span>
      <span><strong>{len(breakpoints)}</strong><small>BP</small></span>
      <span><strong>{len(gradients)}</strong><small>Grad</small></span>
    </div>
    <nav class="ds-nav" aria-label="页面分区">{nav_html}</nav>
  </div>
</header>
{overview_html}
<main class="ds-main">
{sections_html}
</main>
<footer class="ds-footer"><code>{safe_css_filename}</code></footer>
</div>
"""
    output_html = html_head + ds_js + "\n</body>\n</html>"
    return output_html



def extract_interactive_components(css_text: str, all_classes: list[str]) -> list[dict]:
    """从 CSS 提取含交互态（:hover/.active/.open/.on）的组件。

    返回 [{cls: "sg-filter-btn", states: ["hover", "active"]}, ...]
    """
    interactive = {}
    # 扫描 :hover 和 .active/.open/.on/.picked/.right/.wrong
    for sel, props in parse_rules(css_text):
        for part in sel.split(","):
            part = part.strip()
            if not part:
                continue
            # 提取主体类
            subjects = re.findall(r"\.(sg-[a-z][\w-]*)", part)
            for cls in subjects:
                if cls not in all_classes:
                    continue
                # 检测交互态
                has_hover = ":hover" in part
                # .active/.open/.on 等状态类
                state_classes = re.findall(r"\.(active|open|on|picked|right|wrong|hide)\b", part)
                if has_hover or state_classes:
                    interactive.setdefault(cls, set())
                    if has_hover:
                        interactive[cls].add("hover")
                    for sc in state_classes:
                        if sc == "hide":
                            continue
                        interactive[cls].add(sc)
    # 按组件名排序
    return [{"cls": cls, "states": sorted(states)} for cls, states in sorted(interactive.items())]


def build_component_preview(cls: str, state: str) -> str:
    """为组件类生成一个预览 HTML，应用指定的交互态。

    state: "default" / "hover" / "active" / "open" / "on" 等
    """
    # 按组件名模式推断合适的预览内容
    name = cls.lower()
    # 状态类（非 hover）直接加到 class
    state_class = "" if state == "default" or state == "hover" else f" {state}"
    # hover 用 force-hover 类（由 JS 复制 :hover 规则）
    force_class = " force-hover" if state == "hover" else ""

    if "btn" in name or "button" in name or "cta" in name:
        label = {"active": "激活态", "on": "选中", "default": "按钮", "hover": "悬停"}.get(state, state)
        return f'<button class="{cls}{state_class}{force_class}">{label}</button>'
    if "link" in name:
        return f'<a class="{cls}{state_class}{force_class}" href="#">链接示例</a>'
    if "tag" in name or "badge" in name or "chip" in name:
        return f'<span class="{cls}{state_class}{force_class}">标签</span>'
    if "card" in name:
        return f'<div class="{cls}{state_class}{force_class}"><div style="padding:8px;font-size:0.875rem">卡片标题</div><div style="padding:0 8px 8px;font-size:0.75rem;opacity:0.7">卡片描述内容</div></div>'
    if "nav" in name or "tab" in name and "list" not in name:
        return f'<span class="{cls}{state_class}{force_class}">导航项</span>'
    if "node" in name:
        return f'<div class="{cls}{state_class}{force_class}" style="padding:6px 12px"><div style="font-size:0.8rem;font-weight:600">节点</div><div style="font-size:0.7rem;opacity:0.7">年份</div></div>'
    if "module" in name or "panel" in name or "item" in name:
        return f'<div class="{cls}{state_class}{force_class}" style="padding:8px 12px"><div style="font-size:0.8rem;font-weight:600">模块标题</div></div>'
    if "opt" in name:
        return f'<div class="{cls}{state_class}{force_class}"><span style="display:inline-block;width:20px;height:20px;background:rgba(100,135,250,0.2);border-radius:4px;text-align:center;line-height:20px;font-size:0.7rem;margin-right:6px">A</span>选项</div>'
    # 通用预览
    return f'<div class="{cls}{state_class}{force_class}" style="padding:8px 12px;font-size:0.85rem">{cls}</div>'
