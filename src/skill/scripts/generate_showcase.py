#!/usr/bin/env python3
"""generate_showcase.py - 设计系统展示页生成器

从组件库 CSS 自动提取设计令牌和组件类，生成自包含 HTML 展示页。
与组件库永远同步，零维护。

用法：
  python3 generate_showcase.py <组件库目录> --out showcase.html
  python3 generate_showcase.py out/kzk-about --out out/kzk-about/showcase.html
"""
from __future__ import annotations
import argparse
import re
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import extract_root_vars, split_media_blocks, extract_gradients, parse_rules


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


def _text_color_for(color_val: str) -> str:
    """根据背景色亮度返回 #fff 或 #1d1d1f（保证色块上的文字可读）。

    rgba 半透明色按白底叠加计算等效亮度：
    等效色 = 前景色 * alpha + 白底 * (1 - alpha)
    """
    v = color_val.strip()
    r, g, b = 255, 255, 255  # 默认白底
    # 解析 hex 6 位
    m = re.match(r"^#([0-9a-fA-F]{6})$", v)
    if m:
        h = m.group(1)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    else:
        m3 = re.match(r"^#([0-9a-fA-F]{3})$", v)
        if m3:
            h = "".join(c * 2 for c in m3.group(1))
            r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        else:
            # rgba：提取 alpha 做白底叠加
            rm = re.match(r"rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)", v)
            if rm:
                cr, cg, cb = float(rm.group(1)), float(rm.group(2)), float(rm.group(3))
                alpha = float(rm.group(4)) if rm.group(4) else 1.0
                # 白底叠加：等效色 = 前景 * alpha + 255 * (1 - alpha)
                r = cr * alpha + 255 * (1 - alpha)
                g = cg * alpha + 255 * (1 - alpha)
                b = cb * alpha + 255 * (1 - alpha)
            else:
                return "#1d1d1f"
    lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return "#ffffff" if lum < 0.55 else "#1d1d1f"


def is_color_var(name: str, value: str) -> bool:
    """判断变量是否是颜色值。"""
    v = value.strip()
    return bool(re.match(r"^#[0-9a-fA-F]{3,8}$", v) or v.startswith("rgba") or v.startswith("rgb") or v.startswith("hsl"))


def generate_showcase(lib_dir: Path) -> str:
    """生成自包含 HTML 展示页。"""
    css_files = list(lib_dir.glob("src/*.css"))
    if not css_files:
        return "<html><body>未找到 CSS 文件</body></html>"
    css_text = "\n".join(f.read_text(encoding="utf-8") for f in css_files)
    css_filename = css_files[0].name if css_files else "lib.css"
    lib_name = lib_dir.name

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

    # 5. 生成 HTML
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
            short_name = name.replace("--sg-", "")
            tc = _text_color_for(value)
            chips += (
                f'<div class="ds-chip" style="background:{value};color:{tc}">'
                f'<span class="ds-chip-name">{short_name}</span>'
                f'<span class="ds-chip-val">{value}</span></div>'
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
            short = name.replace("--sg-", "")
            font_html += f'<span class="ds-font-chip" style="font-family:{value}">{short}<small>{value}</small></span>'
        font_html += '</div></div>'
        token_parts.append(font_html)
        token_count += len(font_vars)
    radius_vars = groups.get("圆角 Radius", [])
    if radius_vars:
        radius_html = '<div class="ds-tokens-row"><div class="ds-tokens-label"><span>圆角</span><small>Radius</small></div><div class="ds-tokens-chips">'
        for name, value in radius_vars:
            short = name.replace("--sg-", "")
            radius_html += f'<span class="ds-token-chip"><span class="ds-radius-box" style="border-radius:{value}"></span><span>{short}<small>{value}</small></span></span>'
        radius_html += '</div></div>'
        token_parts.append(radius_html)
        token_count += len(radius_vars)
    shadow_vars = groups.get("阴影 Shadow", [])
    if shadow_vars:
        shadow_html = '<div class="ds-tokens-row"><div class="ds-tokens-label"><span>阴影</span><small>Elevation</small></div><div class="ds-tokens-chips">'
        for name, value in shadow_vars:
            short = name.replace("--sg-", "")
            shadow_html += f'<span class="ds-token-chip"><span class="ds-shadow-box" style="box-shadow:{value}"></span><span>{short}<small>{value}</small></span></span>'
        shadow_html += '</div></div>'
        token_parts.append(shadow_html)
        token_count += len(shadow_vars)
    if gradients:
        visible_gradients = gradients[:12]
        grad_html = '<div class="ds-tokens-row"><div class="ds-tokens-label"><span>渐变</span><small>Gradients</small></div><div class="ds-tokens-chips ds-gradient-list">'
        for index, g in enumerate(visible_gradients, 1):
            grad_html += f'<span class="ds-gradient-token"><span class="ds-grad-chip" style="background:{g["value"]}"></span><small>Gradient {index:02d}</small></span>'
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
            bp_html += f'<tr><td><span class="ds-bp-rule">{direction}</span></td><td><strong>{symbol} {val}px</strong></td><td><code>{query.strip()[:80]}</code></td></tr>'
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
    nav_html = "".join(nav_items)

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
<title>{lib_name} · 设计系统 Design System</title>
<!-- 先加载组件库，再由 showcase 宿主样式接管页面级布局 -->
<link rel="stylesheet" href="src/{css_files[0].name if css_files else 'lib.css'}" />
<style>
/* === Showcase host: 与被预览组件库的全局 html/body 规则隔离 === */
:root {{
  --ds-accent: var(--sg-primary, #6478ff);
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
  background:
    radial-gradient(circle at 12% -10%, rgba(100, 120, 255, 0.14), transparent 32rem),
    radial-gradient(circle at 92% 8%, rgba(160, 176, 255, 0.11), transparent 26rem),
    linear-gradient(180deg, #f7f7f8 0%, var(--ds-canvas) 28rem);
}}
.ds-shell {{ position: relative; z-index: 1; width: min(1280px, calc(100% - 48px)); margin: 0 auto; padding: 36px 0 72px; }}

/* Hero */
.ds-hero {{
  position: relative !important; inset: auto !important; width: auto !important; height: auto !important;
  display: block !important; overflow: hidden; padding: 30px 36px 22px;
  color: #fff; border: 1px solid rgba(255,255,255,0.1); border-radius: var(--ds-radius-lg);
  background: linear-gradient(135deg, #121419 0%, #1a1d25 58%, #22283a 100%);
  box-shadow: 0 28px 80px rgba(14, 17, 24, 0.2);
}}
.ds-hero::before {{
  content: ""; position: absolute; width: 380px; height: 380px; right: -110px; top: -220px;
  border-radius: 50%; background: var(--ds-accent); opacity: 0.24; filter: blur(4px);
}}
.ds-hero::after {{
  content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.28;
  background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
  background-size: 36px 36px; mask-image: linear-gradient(to bottom, #000, transparent 72%);
}}
.ds-hero-main, .ds-meta, .ds-nav {{ position: relative; z-index: 1; }}
.ds-hero h1 {{ margin: 0 !important; color: #fff !important; font-size: clamp(2rem, 4vw, 3.4rem) !important; line-height: 1.08 !important; letter-spacing: -.045em; font-weight: 760 !important; }}
.ds-hero h1 small {{ margin-left: .28em; color: rgba(255,255,255,.52); font-size: .42em; font-weight: 520; letter-spacing: -.01em; }}
.ds-meta {{ display: grid !important; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 22px; }}
.ds-meta > span {{ min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; border: 1px solid rgba(255,255,255,.1); border-radius: 14px; background: rgba(255,255,255,.055); backdrop-filter: blur(10px); }}
.ds-meta strong {{ color: #fff; font-size: 1.25rem; line-height: 1.2; font-variant-numeric: tabular-nums; }}
.ds-meta small {{ color: rgba(255,255,255,.46); font-size: .67rem; letter-spacing: .06em; text-transform: uppercase; }}
.ds-nav {{ display: flex; flex-wrap: wrap; gap: 4px; margin-top: 20px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.08); }}
.ds-nav a {{ color: rgba(255,255,255,.58); text-decoration: none; font-size: .78rem; font-weight: 650; padding: 7px 12px; border-radius: 999px; transition: .2s ease; }}
.ds-nav a:hover {{ color: #fff; background: rgba(255,255,255,.09); }}

/* Main sections */
.ds-main {{ display: block !important; }}
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

@media (max-width: 820px) {{
  .ds-shell {{ width: min(100% - 28px, 1280px); padding-top: 14px; }}
  .ds-hero {{ padding: 26px 22px 18px; border-radius: 22px; }}
  .ds-meta {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
  .ds-section {{ padding: 21px !important; border-radius: 22px !important; }}
  .ds-section-head {{ flex-direction: column; gap: 12px; }}
  .ds-tokens-grid {{ grid-template-columns: 1fr; }}
  .ds-interact-list {{ grid-template-columns: 1fr; }}
}}
@media (max-width: 520px) {{
  .ds-shell {{ width: min(100% - 20px, 1280px); }}
  .ds-hero h1 small {{ display: block; margin: .42em 0 0; }}
  .ds-meta > span {{ padding: 11px 12px; }}
  .ds-nav {{ overflow-x: auto; flex-wrap: nowrap; padding-bottom: 2px; }}
  .ds-nav a {{ flex: 0 0 auto; }}
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
<header class="ds-hero">
  <div class="ds-hero-main">
    <h1>{lib_name}<small>设计系统</small></h1>
  </div>
  <div class="ds-meta" aria-label="设计系统统计">
    <span><strong>{len(root_vars)}</strong><small>Variables / 变量</small></span>
    <span><strong>{len(component_classes)}</strong><small>Components / 组件类</small></span>
    <span><strong>{len(breakpoints)}</strong><small>Breakpoints / 断点</small></span>
    <span><strong>{len(gradients)}</strong><small>Gradients / 渐变</small></span>
  </div>
  <nav class="ds-nav" aria-label="页面分区">{nav_html}</nav>
</header>
<main class="ds-main">
{sections_html}
</main>
<footer class="ds-footer"><code>{css_filename}</code></footer>
</div>
"""
    html = html_head + ds_js + "\n</body>\n</html>"
    return html



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



def main():
    ap = argparse.ArgumentParser(description="设计系统展示页生成器")
    ap.add_argument("lib_dir", help="组件库目录")
    ap.add_argument("--out", help="输出 HTML 路径（默认 <lib_dir>/showcase.html）")
    args = ap.parse_args()
    lib_dir = Path(args.lib_dir).resolve()
    if not lib_dir.is_dir():
        print(f"ERROR: 目录不存在: {lib_dir}", file=sys.stderr)
        sys.exit(1)
    html = generate_showcase(lib_dir)
    out_path = Path(args.out) if args.out else lib_dir / "showcase.html"
    out_path.write_text(html, encoding="utf-8")
    print(f"展示页已生成: {out_path} ({len(html)} bytes)")


if __name__ == "__main__":
    main()
