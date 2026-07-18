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
    """根据背景色亮度返回 #fff 或 #1d1d1f（保证色块上的文字可读）。"""
    v = color_val.strip()
    # 解析 hex
    m = re.match(r"^#([0-9a-fA-F]{6})$", v)
    if not m:
        m = re.match(r"^#([0-9a-fA-F]{3})$", v)
        if m:
            h = "".join(c * 2 for c in m.group(1))
        else:
            # rgba：alpha 高则看 r,g,b
            rm = re.match(r"rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)", v)
            if rm:
                r, g, b = float(rm.group(1)), float(rm.group(2)), float(rm.group(3))
            else:
                return "#1d1d1f"
    else:
        h = m.group(1)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    # 相对亮度（简化 sRGB）
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

    # --- 色卡（紧凑聚合式）---
    color_cats = ["功能色 Functional", "文字色 Text", "背景色 Background", "分割线 Border", "状态色 Status", "页脚色 Footer"]
    color_rows = ""
    for cat in color_cats:
        if cat not in groups:
            continue
        vars_list = groups[cat]
        chips = ""
        for name, value in vars_list:
            if not is_color_var(name, value):
                continue
            # 紧凑色块：色块内显示变量简称 + 色值
            short_name = name.replace("--sg-", "")
            # 判断色块文字用深色还是浅色（根据背景亮度）
            tc = _text_color_for(value)
            chips += f'<div class="ds-chip" style="background:{value};color:{tc}"><span class="ds-chip-name">{short_name}</span><span class="ds-chip-val">{value}</span></div>'
        if chips:
            label = cat.split(" ")[0]
            color_rows += f'<div class="ds-color-row"><span class="ds-color-label">{label}</span><div class="ds-chips">{chips}</div></div>'
    if color_rows:
        sections.append(f'<section class="ds-section"><h2 class="ds-section-title">色卡系统 Color Tokens</h2><div class="ds-color-board">{color_rows}</div></section>')

    # --- 令牌速览（排版+圆角+阴影+渐变合并）---
    token_parts = []
    font_vars = groups.get("字体 Font", [])
    if font_vars:
        font_html = '<div class="ds-tokens-row"><span class="ds-tokens-label">字体</span><div class="ds-tokens-chips">'
        for name, value in font_vars:
            short = name.replace("--sg-", "")
            font_html += f'<span class="ds-font-chip" style="font-family:{value}">{short}</span>'
        font_html += '</div></div>'
        token_parts.append(font_html)
    radius_vars = groups.get("圆角 Radius", [])
    if radius_vars:
        radius_html = '<div class="ds-tokens-row"><span class="ds-tokens-label">圆角</span><div class="ds-tokens-chips">'
        for name, value in radius_vars:
            short = name.replace("--sg-", "")
            radius_html += f'<span class="ds-token-chip"><span class="ds-radius-box" style="border-radius:{value}"></span>{short}</span>'
        radius_html += '</div></div>'
        token_parts.append(radius_html)
    shadow_vars = groups.get("阴影 Shadow", [])
    if shadow_vars:
        shadow_html = '<div class="ds-tokens-row"><span class="ds-tokens-label">阴影</span><div class="ds-tokens-chips">'
        for name, value in shadow_vars:
            short = name.replace("--sg-", "")
            shadow_html += f'<span class="ds-token-chip"><span class="ds-shadow-box" style="box-shadow:{value}"></span>{short}</span>'
        shadow_html += '</div></div>'
        token_parts.append(shadow_html)
    if gradients:
        grad_html = '<div class="ds-tokens-row"><span class="ds-tokens-label">渐变</span><div class="ds-tokens-chips">'
        for g in gradients[:8]:
            grad_html += f'<span class="ds-grad-chip" style="background:{g["value"]}"></span>'
        grad_html += '</div></div>'
        token_parts.append(grad_html)
    if token_parts:
        sections.append(f'<section class="ds-section"><h2 class="ds-section-title">令牌速览 Tokens</h2>{" ".join(token_parts)}</section>')

    # --- 组件与交互态（清单+预览合并）---
    interactive_comps = extract_interactive_components(css_text, component_classes)
    if interactive_comps:
        comp_tags = '<div class="ds-comp-list">' + "".join(f'<span class="ds-comp-tag">{c}</span>' for c in component_classes) + '</div>'
        interact_html = '<div class="ds-interact-controls"><button class="ds-toggle-btn" onclick="dsToggleAllStates()">切换交互态</button></div>'
        interact_html += '<div class="ds-interact-list">'
        for comp in interactive_comps:
            cls = comp["cls"]
            states = comp["states"]
            previews = f'<div class="ds-interact-cell"><span class="ds-interact-mini-label">默认</span><div class="ds-interact-mini">{build_component_preview(cls, "default")}</div></div>'
            for st in states:
                previews += f'<div class="ds-interact-cell"><span class="ds-interact-mini-label">{st}</span><div class="ds-interact-mini">{build_component_preview(cls, st)}</div></div>'
            interact_html += f'<div class="ds-interact-item"><span class="ds-interact-name">{cls}</span><div class="ds-interact-cells">{previews}</div></div>'
        interact_html += '</div>'
        sections.append(f'<section class="ds-section"><h2 class="ds-section-title">组件与交互态 Components ({len(interactive_comps)}/{len(component_classes)})</h2>{comp_tags}{interact_html}</section>')

    # --- 响应式断点 ---
    if breakpoints:
        bp_html = '<table class="ds-bp-table"><tr><th>类型</th><th>断点</th><th>查询</th></tr>'
        for typ, val, query in sorted(breakpoints, key=lambda x: x[1]):
            bp_html += f'<tr><td>{"≤" if typ=="max" else "≥"}</td><td>{val}px</td><td><code>{query.strip()[:80]}</code></td></tr>'
        bp_html += '</table>'
        sections.append(f'<section class="ds-section"><h2 class="ds-section-title">响应式断点 Breakpoints ({len(breakpoints)} 个)</h2>{bp_html}</section>')

    sections_html = "\n".join(sections)

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
    style.textContent = hoverRules.join('\n');
    document.head.appendChild(style);
  }
})();
var dsToggleState = false;
function dsToggleAllStates() {
  dsToggleState = !dsToggleState;
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
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{lib_name} · 设计系统 Design System</title>
<style>
/* === 展示页自身样式（不依赖组件库） === */
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; background:#f5f5f7; color:#1d1d1f; line-height:1.6; padding:24px 16px; }}
.ds-header {{ max-width:1100px; margin:0 auto 12px; }}
.ds-header h1 {{ font-size:1.1rem; font-weight:700; margin-bottom:2px; display:inline; margin-right:8px; }}
.ds-header p {{ color:#86868b; font-size:0.78rem; display:inline; }}
.ds-meta {{ display:flex; gap:6px; margin-top:6px; font-size:0.72rem; color:#86868b; }}
.ds-meta span {{ background:#fff; padding:2px 8px; border-radius:4px; border:1px solid rgba(0,0,0,0.06); }}
.ds-section {{ max-width:1100px; margin:0 auto 10px; background:#fff; border-radius:10px; padding:12px 16px; box-shadow:0 1px 4px rgba(0,0,0,0.05); }}
.ds-section-title {{ font-size:0.92rem; font-weight:700; margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid #f0f0f0; }}
.ds-group-title {{ font-size:0.82rem; font-weight:600; margin:8px 0 4px; color:#424245; }}
/* 紧凑聚合式色卡 */
.ds-color-board {{ display:flex; flex-direction:column; gap:2px; border-radius:12px; overflow:hidden; border:1px solid rgba(0,0,0,0.06); }}
.ds-color-row {{ display:flex; align-items:stretch; }}
.ds-color-label {{ display:flex; align-items:center; justify-content:center; width:80px; min-width:80px; font-size:0.7rem; font-weight:700; color:#86868b; background:#fafafa; border-right:1px solid rgba(0,0,0,0.06); text-align:center; padding:0 6px; text-transform:uppercase; letter-spacing:0.03em; }}
.ds-chips {{ display:flex; flex:1; flex-wrap:nowrap; }}
.ds-chip {{ flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:5px 2px; gap:1px; transition:flex 0.2s; cursor:default; }}
.ds-chip:hover {{ flex:1.5; z-index:2; box-shadow:inset 0 0 0 2px rgba(255,255,255,0.4); }}
.ds-chip-name {{ font-family:monospace; font-size:0.66rem; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }}
.ds-chip-val {{ font-family:monospace; font-size:0.58rem; opacity:0.65; white-space:nowrap; }}
.ds-var-name {{ padding:4px 8px 1px; font-size:0.72rem; font-weight:600; font-family:monospace; color:#1d1d1f; }}
.ds-var-value {{ padding:0 8px 4px; font-size:0.68rem; color:#86868b; font-family:monospace; word-break:break-all; }}
.ds-tokens-row {{ display:flex; align-items:center; gap:8px; margin-bottom:6px; }}
.ds-tokens-label {{ width:44px; min-width:44px; font-size:0.68rem; font-weight:700; color:#86868b; text-transform:uppercase; }}
.ds-tokens-chips {{ display:flex; gap:6px; flex-wrap:wrap; align-items:center; }}
.ds-font-chip {{ font-size:0.82rem; padding:3px 10px; background:#f5f5f7; border-radius:5px; border:1px solid rgba(0,0,0,0.06); }}
.ds-token-chip {{ display:inline-flex; align-items:center; gap:5px; font-size:0.68rem; font-family:monospace; color:#424245; }}
.ds-radius-box {{ width:24px; height:24px; background:linear-gradient(135deg,var(--sg-primary,#6487fa),var(--sg-accent,#3e6659)); display:inline-block; }}
.ds-shadow-box {{ width:32px; height:22px; background:#fff; border-radius:4px; display:inline-block; }}
.ds-grad-chip {{ width:48px; height:20px; border-radius:3px; display:inline-block; }}
.ds-comp-list {{ display:flex; flex-wrap:wrap; gap:3px; margin-bottom:10px; }}
.ds-comp-tag {{ font-family:monospace; font-size:0.68rem; background:#f5f5f7; padding:2px 6px; border-radius:4px; border:1px solid rgba(0,0,0,0.06); color:#424245; }}
.ds-hint {{ margin-top:6px; font-size:0.72rem; color:#86868b; }}
.ds-interact-controls {{ display:flex; align-items:center; gap:8px; margin-bottom:8px; }}
.ds-toggle-btn {{ padding:4px 12px; background:#1d1d1f; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:0.75rem; font-weight:600; }}
.ds-toggle-btn:hover {{ background:#424245; }}
.ds-interact-list {{ display:flex; flex-direction:column; gap:4px; }}
.ds-interact-item {{ display:flex; align-items:center; gap:8px; padding:4px 8px; border-radius:6px; background:#fafafa; }}
.ds-interact-name {{ font-family:monospace; font-size:0.7rem; font-weight:600; color:#424245; min-width:120px; }}
.ds-interact-cells {{ display:flex; gap:6px; align-items:center; flex:1; }}
.ds-interact-cell {{ display:flex; align-items:center; gap:4px; }}
.ds-interact-mini-label {{ font-size:0.6rem; color:#a0a0a0; text-transform:uppercase; }}
.ds-interact-mini {{ display:flex; align-items:center; padding:3px 6px; background:#fff; border-radius:4px; border:1px solid rgba(0,0,0,0.04); }}
.ds-interact-mini > * {{ max-width:100%; transform:scale(0.85); transform-origin:left center; }}
</style>
<!-- 组件库 CSS（让色卡用 var(--sg-*) 引用） -->
<link rel="stylesheet" href="src/{css_files[0].name if css_files else 'lib.css'}" />
</head>
<body>
<div class="ds-header">
  <h1>{lib_name} · 设计系统</h1>
  <p>Design System Showcase · 自动生成自组件库 CSS</p>
  <div class="ds-meta">
    <span>{len(root_vars)} 个变量</span>
    <span>{len(component_classes)} 个组件类</span>
    <span>{len(breakpoints)} 个断点</span>
    <span>{len(gradients)} 个渐变</span>
  </div>
</div>
{sections_html}
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
