#!/usr/bin/env python3
"""analyze_html.py — HTML → manifest.json

将单个 HTML 案例页解析为标准化的 manifest.json，作为组件库生成的中间契约。

用法：
    python3 analyze_html.py <html路径> --out <manifest.json> [--vertical <垂类名>] [--minimal]

依赖：beautifulsoup4
"""

from __future__ import annotations
import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

# 允许从 skill 目录直接运行（不装包）
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (  # noqa: E402
    extract_root_vars, extract_all_vars, split_media_blocks, parse_rules,
    extract_gradients, normalize_var_name, parse_color, to_hex, slugify,
    safe_json_dump, infer_color_roles,
)

try:
    from bs4 import BeautifulSoup, NavigableString  # type: ignore
except ImportError:
    print("ERROR: beautifulsoup4 未安装。请运行：", file=sys.stderr)
    print("  pip install --user --break-system-packages beautifulsoup4", file=sys.stderr)
    sys.exit(2)


# ============================================================
# 分析器主类
# ============================================================
class HtmlAnalyzer:
    def __init__(self, html_path: str, vertical: str | None = None, minimal: bool = False):
        self.html_path = Path(html_path).resolve()
        self.vertical = vertical or self._infer_vertical()
        self.minimal = minimal
        self.warnings: list[str] = []
        self.html = self._read_html_robust()
        self.soup = BeautifulSoup(self.html, "html.parser")
        # 提取 <style> 与 <script>
        self.css = self._extract_css()
        self.scripts = self._extract_scripts()
        self.root_vars = extract_root_vars(self.css)
        self.all_vars = extract_all_vars(self.css)

    def _read_html_robust(self) -> str:
        """读取 HTML，自动检测编码（支持 UTF-8/GBK/GB18030 等）。

        优先级：BOM → <meta charset> → UTF-8 → GB18030 兜底。
        任何解码失败都用 errors='replace' 保证不崩溃。
        """
        raw = self.html_path.read_bytes()
        # 1. BOM 嗅探
        if raw.startswith(b"\xef\xbb\xbf"):
            return raw[3:].decode("utf-8", errors="replace")
        if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
            import codecs
            return raw.decode("utf-16", errors="replace")
        # 2. <meta charset> 嗅探（前 4KB）
        head = raw[:4096]
        enc = None
        m = re.search(rb'<meta[^>]+charset=["\']?\s*([\w-]+)', head, re.I)
        if m:
            enc = m.group(1).decode("ascii", errors="ignore").lower()
        # 3. 尝试声明的编码，再 UTF-8，再 GB18030（中文常见）
        for candidate in (enc, "utf-8", "gb18030"):
            if not candidate:
                continue
            try:
                return raw.decode(candidate)
            except (LookupError, UnicodeDecodeError):
                continue
        return raw.decode("utf-8", errors="replace")

    # ---------- 顶层 ----------
    def analyze(self) -> dict:
        meta = self._analyze_meta()
        theme = self._analyze_theme()
        if self.minimal:
            # 最小模式：仅 meta + theme + 简化 structure（含范式识别）
            tabs = self._analyze_tabs()
            views = self._analyze_views(minimal=True)
            pattern = self._detect_pattern()
            return {
                "schemaVersion": "1.0",
                "meta": meta,
                "theme": theme,
                "structure": {"pattern": pattern, "tabs": tabs, "views": views, "modals": [], "storyPanels": []},
                "data": {},
                "interactions": [],
                "responsive": [],
                "a11y": {},
                "warnings": self.warnings,
            }
        structure = self._analyze_structure()
        data = self._analyze_data()
        interactions = self._analyze_interactions()
        responsive = self._analyze_responsive()
        a11y = self._analyze_a11y()
        return {
            "schemaVersion": "1.0",
            "meta": meta,
            "theme": theme,
            "structure": structure,
            "data": data,
            "interactions": interactions,
            "responsive": responsive,
            "a11y": a11y,
            "warnings": self.warnings,
        }

    # ---------- 基础提取 ----------
    def _extract_css(self) -> str:
        parts = []
        for style in self.soup.find_all("style"):
            parts.append(style.get_text() or "")
        return "\n".join(parts)

    def _extract_scripts(self) -> list[str]:
        out = []
        for s in self.soup.find_all("script"):
            if s.get("type") in (None, "text/javascript", "application/javascript"):
                t = s.get_text()
                if t and t.strip():
                    out.append(t)
        return out

    def _infer_vertical(self) -> str:
        parent = self.html_path.parent.parent
        return parent.name if parent.name else "未分类"

    # ============================================================
    # meta
    # ============================================================
    def _analyze_meta(self) -> dict:
        title_tag = self.soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else ""
        # templateId
        tmpl_id = None
        main = self.soup.find(attrs={"data-dudesign-template": True})
        if main:
            tmpl_id = main.get("data-dudesign-template")
        # canvas
        canvas = self._analyze_canvas()
        return {
            "source": str(self.html_path),
            "title": title,
            "templateId": tmpl_id,
            "vertical": self.vertical,
            "caseName": slugify(self.html_path.parent.name or title or "case"),
            "canvas": canvas,
        }

    def _analyze_canvas(self) -> dict:
        """从 CSS 提取画框尺寸（PC/WISE/extreme）。"""
        canvas = {"pc": None, "wise": None, "extreme": None, "frameSelector": None}
        # 找画框选择器：.pc-card-frame / .card-frame / .app-container 等
        frame_candidates = [
            r"\.pc-card-frame", r"\.card-frame", r"\.app-container",
            r"\.main-area", r"\.main-layout", r"\.h-main",
        ]
        frame_sel = None
        for pat in frame_candidates:
            if re.search(pat, self.css):
                frame_sel = pat.replace("\\", "")
                break
        canvas["frameSelector"] = frame_sel
        # 从默认规则提取 PC 尺寸
        if frame_sel:
            pc = self._find_size_for_selector(self.css, frame_sel)
            canvas["pc"] = pc
        # 从 @media 提取 WISE/extreme
        for query, body in split_media_blocks(self.css):
            if not query:
                continue
            q = query.lower()
            sizes = self._find_size_for_selector(body, frame_sel) if frame_sel else None
            if "max-width: 500" in q or "max-width:500" in q:
                canvas["wise"] = sizes
            elif "max-width: 320" in q or "max-width:320" in q or "max-height: 380" in q:
                canvas["extreme"] = sizes
        return canvas

    def _find_size_for_selector(self, css: str, sel: str) -> list[int | None] | None:
        if not sel:
            return None
        # 找 sel { ... width: Xpx; height: Ypx; ... }
        # 转义 sel 中的点
        pat = re.escape(sel) + r"\s*\{([^}]*)\}"
        m = re.search(pat, css)
        if not m:
            return None
        body = m.group(1)
        w = re.search(r"width\s*:\s*(\d+)px", body)
        h = re.search(r"height\s*:\s*(\d+)px", body)
        if not w and not h:
            return None
        return [int(w.group(1)) if w else None, int(h.group(1)) if h else None]

    # ============================================================
    # theme
    # ============================================================
    def _extract_tailwind_colors(self) -> list[dict]:
        """P2+ 通用化：从 Tailwind config 提取主题色（当 :root 变量为空时）。

        页面用 Tailwind CDN 时，颜色定义在 tailwind.config.theme.extend.colors 里，
        不在 :root CSS 变量里。需用 jsdom 渲染捕获 window.__twConfig。
        返回与 _analyze_theme tokens 相同结构的列表。
        """
        import subprocess, json as _json
        RENDERER = Path(__file__).resolve().parent.parent.parent.parent / "scripts" / "_roundtrip_render.mjs"
        if not RENDERER.exists():
            return []
        try:
            proc = subprocess.run(
                ["node", str(RENDERER), str(self.html_path), "--ref", "--tw-only"],
                capture_output=True, timeout=30, encoding="utf-8", errors="replace",
            )
        except Exception:
            return []
        if proc.returncode != 0:
            return []
        try:
            raw = proc.stdout
            idx = raw.find("{")
            if idx < 0:
                return []
            d = _json.loads(raw[idx:])
        except _json.JSONDecodeError:
            return []
        if not d.get("ok"):
            return []
        tw_cfg = d.get("tailwindConfig") or {}
        colors = tw_cfg.get("theme", {}).get("extend", {}).get("colors") or tw_cfg.get("theme", {}).get("colors") or {}
        if not colors:
            return []
        tokens = []
        seen_norm = {}
        for orig_name, value in colors.items():
            if not isinstance(value, str) or not value.startswith("#"):
                continue
            norm = normalize_var_name(orig_name)
            if norm in seen_norm:
                continue
            seen_norm[norm] = orig_name
            tokens.append({
                "name": norm,
                "value": value.strip(),
                "original": f"tw:{orig_name}",
                "usage": [],
                "roles": self._infer_tailwind_roles(orig_name),
            })
        return tokens

    def _infer_tailwind_roles(self, tw_name: str) -> list[str]:
        """根据 Tailwind 色名推断语义角色（无 CSS 可扫时用名字推断）。"""
        name = tw_name.lower()
        roles = []
        if name.startswith("on-"):
            roles.append("text")
        elif "container" in name or "surface" in name or "background" in name:
            roles.append("background")
        elif "outline" in name or "border" in name:
            roles.append("border")
        elif "error" in name:
            roles.append("error")
        else:
            roles.append("background")
        if "fixed" in name or "dim" in name:
            roles.append("variant")
        return roles

    def _analyze_theme(self) -> dict:
        tokens: list[dict] = []
        seen_norm: dict[str, str] = {}  # norm_name -> original
        for orig_name, value in self.root_vars.items():
            norm = normalize_var_name(orig_name)
            # 同一归一名只保留首个出现（避免 --primary 与 --primary-color 冲突）
            if norm in seen_norm:
                # 保留值更长的（信息更全）
                if len(value) <= len(self.root_vars[seen_norm[norm]]):
                    continue
            seen_norm[norm] = orig_name
            usage = self._infer_var_usage(orig_name)
            roles = infer_color_roles(self.css, orig_name)
            tokens.append({
                "name": norm,
                "value": value.strip(),
                "original": orig_name,
                "usage": usage,
                "roles": roles,
            })
        # 渐变
        gradients = []
        for sel, props in parse_rules(self.css):
            for prop, val in props.items():
                if "gradient" in val.lower():
                    for g in extract_gradients(val):
                        gradients.append({
                            "selector": sel,
                            "value": g["value"],
                            "normalized": self._normalize_gradient(g["value"]),
                        })
        # P2+ 通用化：:root 变量为空时从 Tailwind config 提取
        if not tokens:
            tw_tokens = self._extract_tailwind_colors()
            if tw_tokens:
                tokens = tw_tokens
                self.warnings.append(f"theme: :root 无变量，从 Tailwind config 提取 {len(tw_tokens)} 个主题色")
        return {"tokens": tokens, "gradients": gradients}

    def _infer_var_usage(self, var_name: str) -> list[str]:
        """扫描 var() 使用位置，推断用途。"""
        usage: list[str] = []
        pat = re.compile(r"var\(\s*" + re.escape(var_name) + r"\s*\)")
        for sel, props in parse_rules(self.css):
            for prop, val in props.items():
                if pat.search(val):
                    # 简化：取选择器主干
                    s = sel.split(",")[0].strip().lstrip(".")
                    if s and s not in usage:
                        usage.append(s)
                    if len(usage) >= 5:
                        break
            if len(usage) >= 5:
                break
        return usage

    def _normalize_gradient(self, value: str) -> str:
        """把渐变中的颜色替换为 var() 引用（若能匹配到变量）。"""
        result = value
        # 建立 value→var 名 反查表
        val_to_var: dict[str, str] = {}
        for orig, v in self.root_vars.items():
            norm = normalize_var_name(orig)
            val_to_var.setdefault(v.strip(), f"var(--sg-{norm})")
        for v, var_ref in val_to_var.items():
            # 精确匹配颜色值
            result = re.sub(re.escape(v), var_ref, result)
        return result

    # ============================================================
    # structure
    # ============================================================
    def _analyze_structure(self) -> dict:
        tabs = self._analyze_tabs()
        views = self._analyze_views()
        modals = self._analyze_modals()
        story_panels = self._analyze_story_panels()
        pattern = self._detect_pattern()
        # 诊断：tabs/views 都空但页面有实质内容 -> 可能是未支持的结构范式
        if not tabs and not views:
            body = self.soup.find("body")
            child_count = len(body.find_all(recursive=True)) if body else 0
            content_len = len(body.get_text(strip=True)) if body else 0
            if child_count > 15 or content_len > 50:
                if pattern == "unknown":
                    self.warnings.append(
                        "structure: 未识别出 tab/视图结构，可能为未支持的范式"
                        "（如因果链/地图导览/全屏交互），将走 generic 兜底"
                    )
                else:
                    self.warnings.append(
                        f"structure: 识别为 {pattern} 范式，但 tab/视图结构为空"
                        f"（agent 需自行从数据/JS 理解结构）"
                    )
        return {
            "pattern": pattern,
            "tabs": tabs,
            "views": views,
            "modals": modals,
            "storyPanels": story_panels,
        }

    def _detect_pattern(self) -> str:
        """P2: 检测页面范式（基于结构特征，非类名精确匹配）。

        已识别范式：
        - cause-chain（因果链）：timeline-nav + 因果链数据 + whatif
        - nav-panel（导航+面板）：nav > [data-p] + .panel
        - quiz（测验）：qz-body/quiz + opts/quiz 结构
        - graph（关联图谱）：svg 连线 + 节点定位
        - member-card（成员卡，v1 范式）：tablist + 成员网格
        """
        has_timeline_nav = bool(self.soup.find(class_=re.compile(r"timeline-?nav", re.I)))
        has_cause_chain = "causeChain" in "\n".join(self.scripts) or bool(self.soup.find(class_=re.compile(r"cause-?chain", re.I)))
        has_whatif = bool(self.soup.find(class_=re.compile(r"whatif", re.I))) or "whatIf" in "\n".join(self.scripts)
        if has_timeline_nav and (has_cause_chain or has_whatif):
            return "cause-chain"
        nav = self.soup.find(class_=re.compile(r"^nav$", re.I)) or self.soup.find("nav")
        if nav:
            triggers = nav.find_all(attrs={"data-p": True}) or nav.find_all(attrs={"data-tab": True})
            panels = self.soup.find_all(class_=re.compile(r"panel", re.I))
            if triggers and len(triggers) >= 2 and len(panels) >= 2:
                return "nav-panel"
        if bool(self.soup.find(class_=re.compile(r"qz-?(body|next|fb|top|result)", re.I))) or "QS" in "\n".join(self.scripts):
            return "quiz"
        svg = self.soup.find("svg")
        if svg and bool(self.soup.find(class_=re.compile(r"gnd|node|graph", re.I))) and "NODES" in "\n".join(self.scripts):
            return "graph"
        tablist = self.soup.find(attrs={"role": "tablist"})
        if tablist and bool(self.soup.find(class_=re.compile(r"member", re.I))):
            return "member-card"
        return "unknown"
    def _analyze_tabs(self) -> list[dict]:
        # 方式1: role=tablist
        tablist = self.soup.find(attrs={"role": "tablist"})
        if tablist:
            return self._extract_tabs_from(tablist)
        # 方式2: 类名匹配（tab-bar / tab-nav / tabs 等）
        for pat in ["tab-bar", "tab-nav", "tab-list", "tabs", "module-tabs", "works-tabs", "tab-nav"]:
            node = self.soup.find(class_=re.compile(pat, re.I))
            if node:
                return self._extract_tabs_from(node)
        # 方式3: nav 容器 + 子项带 data-p/data-tab/data-target 关联 panel
        # （如纸上谈兵 .nav > span.n[data-p="home"] ↔ section.panel#home）
        nav = self.soup.find("nav") or self.soup.find(class_=re.compile(r"^(nav|tabbar|bottom-nav)$", re.I))
        if nav:
            triggers = nav.find_all(attrs={"data-p": True}) or nav.find_all(attrs={"data-tab": True}) or nav.find_all(attrs={"data-target": True})
            if triggers:
                return self._extract_tabs_from(nav)
        return []

    def _extract_tabs_from(self, container) -> list[dict]:
        tabs: list[dict] = []
        # 找子级 tab 元素
        tab_nodes = container.find_all(attrs={"role": "tab"})
        if not tab_nodes:
            # data-p / data-tab / data-target 关联型（如 .nav > span.n[data-p]）
            tab_nodes = container.find_all(attrs={"data-p": True}) \
                or container.find_all(attrs={"data-tab": True}) \
                or container.find_all(attrs={"data-target": True})
        if not tab_nodes:
            # 回退到类名
            tab_nodes = container.find_all(class_=re.compile(r"tab(-?item)?$", re.I))
        if not tab_nodes:
            tab_nodes = [c for c in container.find_all(["button", "a"]) if c.find(class_=re.compile(r"tab", re.I)) or "tab" in (c.get("class") or [])]
        for node in tab_nodes:
            label = node.get_text(strip=True)
            # count 从 <small>
            small = node.find("small")
            count = None
            if small:
                m = re.search(r"\d+", small.get_text())
                if m:
                    count = int(m.group())
            # more 判定
            cls = " ".join(node.get("class") or [])
            is_more = ("more" in cls.lower()
                       or label in ("其它", "其他", "更多", "more")
                       or (node.get("aria-controls") and not self.soup.find(id=node["aria-controls"])))
            # id: 优先 data-p/data-tab/data-target，其次 aria-controls，其次原 id
            tab_id = (node.get("data-p") or node.get("data-tab")
                      or node.get("data-target") or node.get("id") or "")
            aria_controls = node.get("aria-controls") or tab_id
            # 清洗 id：去掉常见前缀
            clean_id = re.sub(r"^(tab-|sg-tab-|nav-)", "", tab_id) if tab_id else self._slug_tab(label)
            tabs.append({
                "id": clean_id or self._slug_tab(label),
                "label": label,
                "count": count,
                "more": is_more,
                "ariaControls": aria_controls,
            })
        return tabs

    def _slug_tab(self, label: str) -> str:
        """从 tab 文本推断 id。"""
        mapping = {
            "成员": "members", "成员详情": "members",
            "经历": "timeline", "时间线": "timeline",
            "作品": "works", "团体作品": "works",
            "其它": "more", "其他": "more", "更多": "more",
        }
        for k, v in mapping.items():
            if k in label:
                return v
        return slugify(label) or "tab"

    def _analyze_views(self, minimal: bool = False) -> list[dict]:
        views: list[dict] = []
        # 找 view-stack / panel 容器
        panels = self.soup.find_all(attrs={"role": "tabpanel"})
        if not panels:
            panels = self.soup.find_all(class_=re.compile(r"\bview\b|\bpanel\b|tabpanel", re.I))
        # 先判定是否有任何 panel 显式标 active（active/is-active/on 类）
        ACTIVE_CLS = re.compile(r"\b(active|is-active|on)\b", re.I)
        any_explicit = any(ACTIVE_CLS.search(" ".join(p.get("class") or [])) for p in panels)
        for idx, p in enumerate(panels):
            vid = p.get("id", "")
            tab_id = ""
            labelledby = p.get("aria-labelledby", "")
            if labelledby:
                tab_id = labelledby.replace("tab-", "").replace("sg-tab-", "")
            elif vid:
                tab_id = vid.replace("panel-", "").replace("sg-panel-", "")
            # active 判定：优先 active/is-active/on 类；若无任何显式标记，首个 panel 默认 active
            cls_str = " ".join(p.get("class") or [])
            if any_explicit:
                active = bool(ACTIVE_CLS.search(cls_str))
            else:
                active = idx == 0
            vtype = "generic" if minimal else self._classify_view(p)
            view = {"id": vid, "tabId": tab_id, "active": active, "type": vtype}
            if not minimal and vtype != "generic":
                view.update(self._extract_view_details(p, vtype))
            views.append(view)
        return views

    def _classify_view(self, node) -> str:
        """根据 patterns.md 判定视图类型。"""
        html_str = str(node)
        # 作品轮播 3D
        if re.search(r"is-center|is-prev-side|is-next-side", html_str) and "perspective" in self.css:
            return "carousel-3d"
        if re.search(r"works?-?(carousel|slider|stage)", html_str, re.I) and "perspective" in self.css:
            return "carousel-3d"
        # 时间线
        if re.search(r"time-?line|tl-?(track|item|scroll)", html_str, re.I):
            return "timeline"
        if node.find("time") and "scroll-snap" in self.css:
            return "timeline"
        # 成员网格
        if re.search(r"member-?(grid|list|stage|area)", html_str, re.I):
            return "member-grid"
        if node.find(class_=re.compile(r"member", re.I)):
            return "member-grid"
        # 详情面板
        if re.search(r"detail-?(panel|card|aside)", html_str, re.I):
            return "detail-panel"
        if node.get("aria-live") == "polite":
            return "detail-panel"
        # P2 新增视图类型
        # 测验面板
        if re.search(r"qz-?(body|next|fb|top|result)|\bquiz\b", html_str, re.I):
            return "quiz"
        # 图谱面板
        if node.find("svg") and re.search(r"\b(gnd|graph|node-?list)\b", html_str, re.I):
            return "graph"
        # 典故/故事卡片
        if re.search(r"scard|src-?card|story-?(l|r)", html_str, re.I):
            return "story-card"
        # 核心信息网格
        if re.search(r"\b(core|ex-?item|ex-?foot)\b", html_str, re.I):
            return "info-grid"
        # 手风琴
        if re.search(r"info-?module|module-?(list|title|tabs)", html_str, re.I):
            return "accordion"
        # 未识别
        self.warnings.append(f"view {node.get('id','?')}: unknown type, fallback to generic")
        return "generic"

    def _extract_view_details(self, node, vtype: str) -> dict:
        if vtype == "member-grid":
            return self._extract_member_grid_details(node)
        if vtype == "timeline":
            return self._extract_timeline_details(node)
        if vtype == "carousel-3d":
            return self._extract_carousel_3d_details(node)
        if vtype == "detail-panel":
            return {"hasKicker": bool(node.find(class_=re.compile(r"kicker", re.I)))}
        return {}

    def _extract_member_grid_details(self, node) -> dict:
        grid = node.find(class_=re.compile(r"member-?(grid|list)", re.I)) or node
        # layout 从 grid-template-columns 推断
        layout = "2x2"
        per_page = 4
        for sel, props in parse_rules(self.css):
            if re.search(r"member-?grid", sel, re.I):
                cols = props.get("grid-template-columns", "")
                if "repeat(2" in cols:
                    layout = "2x2"
                elif "repeat(3" in cols:
                    layout = "3x2" if "repeat(2" in props.get("grid-template-rows","") else "3x3"
                    per_page = 6
                break
        return {
            "layout": layout,
            "perPage": per_page,
            "paginated": bool(node.find(class_=re.compile(r"carousel-?dots", re.I))),
            "hasAvatarFallback": bool(node.find(class_=re.compile(r"avatar-?fallback", re.I))),
            "hasPhotoSource": bool(node.find(class_=re.compile(r"photo-?source", re.I))),
            "hasState": bool(node.find(class_=re.compile(r"member-?state", re.I))),
        }

    def _extract_timeline_details(self, node) -> dict:
        per_page = {"pc": 3, "mobile": 2}
        for query, body in split_media_blocks(self.css):
            if "max-width: 500" in query or "max-width:500" in query:
                m = re.search(r"flex:\s*0\s*0\s*calc\(\(100%\s*-\s*\d+px\)\s*/\s*(\d+)\)", body)
                if m:
                    per_page["mobile"] = int(m.group(1))
        # PC perPage
        for sel, props in parse_rules(self.css):
            if re.search(r"\.t-?item", sel, re.I) and "flex" in props:
                m = re.search(r"/\s*(\d+)\)", props["flex"])
                if m:
                    per_page["pc"] = int(m.group(1))
                    break
        return {
            "scrollSnap": "scroll-snap" in self.css,
            "perPage": per_page,
            "dualArrowStrategy": bool(node.find(class_=re.compile(r"tl-?prev-?pc", re.I)) and node.find(class_=re.compile(r"tl-?prev-?mobile", re.I))),
            "hasDots": bool(node.find(class_=re.compile(r"tl-?dots", re.I))),
            "hasPageLabel": bool(node.find(string=re.compile(r"第.*页", re.S))),
        }

    def _extract_carousel_3d_details(self, node) -> dict:
        perspective = 900
        m = re.search(r"perspective:\s*(\d+)px", self.css)
        if m:
            perspective = int(m.group(1))
        positions = self._extract_carousel_positions()
        return {
            "perspective": perspective,
            "positions": positions,
            "hasStoryPanel": bool(self.soup.find(class_=re.compile(r"(work-?)?story-?panel", re.I))),
        }

    def _extract_carousel_positions(self) -> list[dict]:
        """提取 3D 轮播各档位的 transform/width/opacity/blur。"""
        positions: list[dict] = []
        # 候选档位类名 → sg 名
        slot_map = [
            ("is-prev-far", "is-prev-far"),
            ("is-prev-side", "is-prev-side"),
            ("is-center", "is-center"),
            ("is-next-side", "is-next-side"),
            ("is-next-far", "is-next-far"),
        ]
        for cls, _ in slot_map:
            pos = self._parse_transform_for_class(cls)
            if pos:
                positions.append(pos)
        if len(positions) < 3:
            self.warnings.append(f"carousel-3d: 仅识别 {len(positions)} 档位，可能不完整")
        # 按 translateX 排序
        positions.sort(key=lambda p: p.get("translateX", 0))
        return positions

    def _parse_transform_for_class(self, cls: str) -> dict | None:
        pat = re.escape("." + cls) + r"\s*\{([^}]*)\}"
        m = re.search(pat, self.css)
        if not m:
            return None
        body = m.group(1)
        out: dict = {"cls": cls}
        w = re.search(r"width:\s*(\d+)px", body)
        if w:
            out["width"] = int(w.group(1))
        op = re.search(r"opacity:\s*([\d.]+)", body)
        if op:
            out["opacity"] = float(op.group(1))
        bl = re.search(r"blur\(([\d.]+)px\)", body)
        if bl:
            out["blur"] = float(bl.group(1))
        tx = re.search(r"translateX\((-?[\d.]+)px\)", body)
        if tx:
            out["translateX"] = float(tx.group(1))
        tz = re.search(r"translateZ\((-?[\d.]+)px\)", body)
        if tz:
            out["translateZ"] = float(tz.group(1))
        z = re.search(r"z-index:\s*(\d+)", body)
        if z:
            out["zIndex"] = int(z.group(1))
        return out

    def _analyze_modals(self) -> list[dict]:
        modals: list[dict] = []
        candidates = self.soup.find_all(class_=re.compile(r"modal-?overlay|dialog|popup", re.I))
        candidates += self.soup.find_all(attrs={"role": "dialog"})
        seen_ids = set()
        for node in candidates:
            mid = node.get("id", "")
            if mid in seen_ids:
                continue
            seen_ids.add(mid)
            node_cls = " ".join(node.get("class") or [])
            # 跳过动态创建的空壳（JS 里 createElement 的，DOM 中无内容）
            layout = self._classify_modal_layout(node, node_cls)
            # 关闭方式
            close_on = []
            if node.find(class_=re.compile(r"modal-?(x-?btn|close)", re.I)):
                close_on.append("x-button")
            close_on.append("overlay-click")  # 通常支持
            if any("Escape" in s and "modal" in s.lower() for s in self.scripts):
                close_on.append("escape")
            # trigger 判定
            trigger = "unknown"
            if "more" in node_cls or mid == "modal":
                trigger = "tab-more"
            elif "member" in node_cls or "member" in mid:
                trigger = "member-click"
            elif re.search(r"tl-|timeline", node_cls + mid, re.I):
                trigger = "timeline-click"
            modals.append({
                "id": mid,
                "trigger": trigger,
                "layout": layout,
                "hasClose": "x-button" in close_on,
                "closeOn": close_on,
            })
        return modals

    def _classify_modal_layout(self, node, node_cls: str) -> str:
        """判定 modal 布局类型。"""
        body_node = node.find(class_=re.compile(r"modal-?body", re.I))
        if not body_node:
            return "generic"
        # 图片+文本
        if body_node.find("img"):
            return "image-text"
        has_rows = bool(body_node.find(class_=re.compile(r"m-?row|relation-row", re.I)))
        if not has_rows:
            return "generic"
        # 查该 modal 对应的 body grid-template-columns（优先匹配带 modal 特定 class 的规则）
        cols = ""
        # 构造候选选择器：从 node_cls 取最具体的 class
        specific = ""
        for c in (node.get("class") or []):
            if c not in ("modal-overlay",) and "modal" in c:
                specific = c
                break
        rules = parse_rules(self.css)
        # 第一轮：匹配 specific class 的 body 规则
        if specific:
            for sel, props in rules:
                if specific in sel and re.search(r"modal-?body", sel, re.I) and "grid-template-columns" in props:
                    cols = props["grid-template-columns"]
                    break
        # 第二轮：通用 .modal-body 规则
        if not cols:
            for sel, props in rules:
                if re.search(r"^[.#]?[\w-]*\s*\.modal-?body\s*$", sel, re.I) and "grid-template-columns" in props:
                    cols = props["grid-template-columns"]
                    break
        if "1fr 1fr" in cols or "repeat(2" in cols:
            return "fact-grid"
        return "relation-list"

    def _analyze_story_panels(self) -> list[dict]:
        panels: list[dict] = []
        for node in self.soup.find_all(class_=re.compile(r"(work-?)?story-?panel", re.I)):
            pid = node.get("id", "")
            # trigger
            trigger = []
            cta = self.soup.find(class_=re.compile(r"story-?cta", re.I))
            if cta:
                trigger.append("cta-button")
            trigger.append("center-card-click")
            # layout
            layout = "cover-text"
            body_node = node.find(class_=re.compile(r"story-?body", re.I))
            if body_node:
                # 找 flex 比例
                for sel, props in parse_rules(self.css):
                    if re.search(r"story-?body", sel, re.I):
                        flex_items = re.findall(r"flex:\s*(\d+)\s+\d+\s+0", props.get("flex", ""))
                        if len(flex_items) >= 2:
                            layout = f"cover-text-{flex_items[0]}:{flex_items[1]}"
                        break
            panels.append({
                "id": pid,
                "trigger": trigger,
                "layout": layout,
                "hasClose": bool(node.find(class_=re.compile(r"story-?close", re.I))),
            })
        return panels

    # ============================================================
    # data
    # ============================================================
    def _analyze_data(self) -> dict:
        data: dict[str, list] = {}
        # 优先：script type=application/json
        for s in self.soup.find_all("script", attrs={"type": "application/json"}):
            sid = s.get("id", "")
            try:
                parsed = json.loads(s.get_text() or "[]")
            except json.JSONDecodeError:
                continue
            if "work" in sid.lower():
                data["works"] = self._normalize_works(parsed)
            elif "member" in sid.lower():
                data["members"] = self._normalize_members(parsed)
            elif "time" in sid.lower():
                data["timeline"] = self._normalize_timeline(parsed)
        # JS 数组提取
        if "members" not in data:
            members = self._extract_js_array("memberList", "members")
            if members:
                data["members"] = self._normalize_members(members)
        # DOM 提取（时间线/成员从 DOM）
        if "timeline" not in data:
            tl = self._extract_timeline_from_dom()
            if tl:
                data["timeline"] = tl
        if "members" not in data:
            mb = self._extract_members_from_dom()
            if mb:
                data["members"] = mb
        # moreFacts 从 modal
        facts = self._extract_facts_from_modal()
        if facts:
            data["moreFacts"] = facts
        # P2: 因果链数据契约（events/causeChain/whatIf）
        if "events" not in data:
            ev = self._extract_js_array("events", "events")
            if ev:
                data["events"] = ev
        cc = self._extract_js_array("causeChain", "causeChain")
        if cc:
            data["causeChain"] = cc
        wi = self._extract_js_array("whatIf", "whatIf")
        if wi:
            data["whatIf"] = wi
        # P2: nav-panel 数据契约（NODES/QS）
        nodes = self._extract_js_array("NODES", "nodes")
        if nodes:
            data["graphNodes"] = nodes
        qs = self._extract_js_array("QS", "qs")
        if qs:
            data["quiz"] = qs
        return data

    def _extract_js_array(self, var_name: str, kind: str) -> list | None:
        """从 JS 中提取 var <name> = [ ... ] 数组。简化：花括号匹配。"""
        for script in self.scripts:
            # 找 var name = [
            pat = re.compile(r"(?:var|let|const)\s+" + re.escape(var_name) + r"\s*=\s*\[", re.MULTILINE)
            m = pat.search(script)
            if not m:
                continue
            start = m.end() - 1  # 指向 [
            arr = self._match_bracket(script, start, "[", "]")
            if arr is None:
                continue
            try:
                parsed = json.loads(arr)
                return parsed
            except json.JSONDecodeError:
                # 尝试用正则修：单引号→双引号、key 加引号
                fixed = self._fix_js_object(arr)
                try:
                    return json.loads(fixed)
                except json.JSONDecodeError:
                    self.warnings.append(f"JS 数组 {var_name} 解析失败，需人工补全 data.{kind}")
                    return None
        return None

    def _match_bracket(self, s: str, start: int, open_ch: str, close_ch: str) -> str | None:
        """从 start 位置的 open_ch 开始，匹配到对应的 close_ch，返回含两端括号的子串。"""
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
                        return s[start:i+1]
            i += 1
        return None

    def _fix_js_object(self, text: str) -> str:
        """把 JS 对象/数组字面量近似转为 JSON。

        用状态机逐字符处理，正确处理字符串边界：
        - 单引号字符串 → 双引号
        - 对象内裸 key（紧跟冒号）→ 加双引号
        - 不误伤 URL 中的冒号（https:）—— 冒号前必须是合法标识符且当前不在字符串里
        - 去尾逗号
        """
        out: list[str] = []
        i = 0
        n = len(text)
        # 记录上一个非空白字符，用于判断是否处于"值位置"还是"key位置"
        prev_significant = ""
        while i < n:
            ch = text[i]
            # 字符串：单引号或双引号
            if ch in ("'", '"'):
                quote = ch
                j = i + 1
                buf = ['"']  # 输出统一用双引号
                while j < n:
                    cj = text[j]
                    if cj == "\\" and j + 1 < n:
                        nxt = text[j+1]
                        # JS 转义 → JSON 合法形式
                        if nxt == "'":
                            # \' 在双引号串中无需转义
                            buf.append("'")
                        elif nxt == '"':
                            buf.append("\\\"")
                        elif nxt == "\\":
                            buf.append("\\\\")
                        elif nxt == "`":
                            buf.append("`")
                        else:
                            # \n \t \uXXXX 等基本兼容 JSON，原样保留
                            buf.append(cj)
                            buf.append(nxt)
                        j += 2
                        continue
                    if cj == quote:
                        break
                    if cj == '"':
                        buf.append("\\\"")  # 内部双引号转义
                    else:
                        buf.append(cj)
                    j += 1
                buf.append('"')
                out.append("".join(buf))
                prev_significant = '"'  # 标记刚结束字符串
                i = j + 1
                continue
            # 模板字符串：反引号 → 转为双引号 JSON 字符串
            # ${expr} 表达式无法转 JSON，原样保留为字符串内容（近似处理）
            if ch == "`":
                j = i + 1
                buf = ['"']
                while j < n:
                    cj = text[j]
                    if cj == "\\" and j + 1 < n:
                        nxt = text[j+1]
                        if nxt == "'":
                            buf.append("'")
                        elif nxt == '"':
                            buf.append("\\\"")
                        elif nxt == "\\":
                            buf.append("\\\\")
                        elif nxt == "`":
                            buf.append("`")
                        else:
                            buf.append(cj)
                            buf.append(nxt)
                        j += 2
                        continue
                    if cj == "`":
                        break
                    if cj == '"':
                        buf.append("\\\"")
                    elif cj == "\n":
                        buf.append("\\n")
                    else:
                        buf.append(cj)
                    j += 1
                buf.append('"')
                out.append("".join(buf))
                prev_significant = '"'
                i = j + 1
                continue
            # 标识符起点（可能是裸 key 或 true/false/null/数字）
            if ch.isalpha() or ch == "_" or ch == "$":
                j = i
                while j < n and (text[j].isalnum() or text[j] in "_$-"):
                    j += 1
                word = text[i:j]
                # 向后看是否紧跟冒号（跳过空白）→ 是裸 key
                k = j
                while k < n and text[k] in " \t":
                    k += 1
                is_key = (k < n and text[k] == ":")
                if is_key:
                    out.append(f'"{word}"')
                elif word in ("true", "false", "null"):
                    out.append("true" if word == "true" else ("false" if word == "false" else "null"))
                else:
                    # 其他裸标识符当作字符串值处理
                    out.append(f'"{word}"')
                prev_significant = word[-1] if word else ""
                i = j
                continue
            # 跳过单行注释 //
            if ch == "/" and i + 1 < n and text[i+1] == "/":
                end = text.find("\n", i)
                i = end if end != -1 else n
                continue
            # 跳过块注释 /* */
            if ch == "/" and i + 1 < n and text[i+1] == "*":
                end = text.find("*/", i + 2)
                i = end + 2 if end != -1 else n
                continue
            out.append(ch)
            if not ch.isspace():
                prev_significant = ch
            i += 1
        result = "".join(out)
        # 去尾逗号
        result = re.sub(r",\s*([}\]])", r"\1", result)
        return result

    def _normalize_members(self, arr: list) -> list[dict]:
        out = []
        for m in arr:
            if not isinstance(m, dict):
                continue
            relations = m.get("relations", [])
            # relations 可能是 [ [label,value], ... ] 或 [ {label,value}, ... ]
            norm_rel = []
            for r in relations:
                if isinstance(r, (list, tuple)) and len(r) >= 2:
                    norm_rel.append([str(r[0]), str(r[1])])
                elif isinstance(r, dict):
                    norm_rel.append([str(r.get("label", "")), str(r.get("value", ""))])
            out.append({
                "key": m.get("key", ""),
                "name": m.get("name", ""),
                "role": m.get("role", ""),
                "shortName": m.get("shortName", ""),
                "state": m.get("state", "在团"),
                "img": m.get("img", ""),
                "photoSource": m.get("photoSource", ""),
                "relations": norm_rel,
            })
        return out

    def _normalize_works(self, arr: list) -> list[dict]:
        out = []
        for w in arr:
            if not isinstance(w, dict):
                continue
            out.append({
                "img": w.get("img", ""),
                "alt": w.get("alt", ""),
                "year": w.get("year", ""),
                "title": w.get("title", ""),
                "desc": w.get("desc", ""),
                "story": w.get("story", ""),
            })
        return out

    def _normalize_timeline(self, arr: list) -> list[dict]:
        out = []
        for t in arr:
            if not isinstance(t, dict):
                continue
            out.append({
                "time": t.get("time", ""),
                "title": t.get("title", ""),
                "desc": t.get("desc", ""),
                "img": t.get("img", ""),
                "alt": t.get("alt", ""),
            })
        return out

    def _extract_timeline_from_dom(self) -> list[dict]:
        items = self.soup.find_all(class_=re.compile(r"^(t|tl)-?item$", re.I))
        out = []
        for it in items:
            time_tag = it.find("time")
            b = it.find("b")
            p = it.find("p")
            img = it.find("img", class_=re.compile(r"t-?img|tl-?img", re.I)) or it.find("img")
            out.append({
                "time": time_tag.get_text(strip=True) if time_tag else "",
                "title": b.get_text(strip=True) if b else "",
                "desc": p.get_text(strip=True) if p else "",
                "img": img.get("src", "") if img else "",
                "alt": img.get("alt", "") if img else "",
            })
        return out

    def _extract_members_from_dom(self) -> list[dict]:
        items = self.soup.find_all(class_=re.compile(r"^member$", re.I))
        out = []
        for it in items:
            img = it.find("img")
            name = it.find(class_=re.compile(r"member-?name", re.I))
            role = it.find(class_=re.compile(r"member-?role", re.I))
            state = it.find(class_=re.compile(r"member-?state", re.I))
            src = it.find(class_=re.compile(r"photo-?source", re.I))
            out.append({
                "key": it.get("data-member", "") or slugify(name.get_text() if name else ""),
                "name": name.get_text(strip=True) if name else "",
                "role": role.get_text(strip=True) if role else "",
                "shortName": "",
                "state": state.get_text(strip=True) if state else "在团",
                "img": img.get("src", "") if img else "",
                "photoSource": src.get_text(strip=True) if src else "",
                "relations": [],
            })
        return out

    def _extract_facts_from_modal(self) -> list[dict]:
        # 找含 m-row 网格的事实 modal（排除 member-detail-modal / tl-modal 等专用 modal）
        out: list[dict] = []
        for modal_body in self.soup.find_all(class_=re.compile(r"modal-?body", re.I)):
            # 跳过成员详情/时间线专用 modal
            parent = modal_body.parent
            if parent and parent.get("class"):
                pcls = " ".join(parent.get("class") or [])
                if re.search(r"member-?detail-?modal|tl-?modal", pcls, re.I):
                    continue
            rows = modal_body.find_all(class_=re.compile(r"^(m-?)?row$", re.I))
            if not rows:
                continue
            for r in rows:
                small = r.find("small")
                span = r.find("span")
                cls = " ".join(r.get("class") or [])
                out.append({
                    "label": small.get_text(strip=True) if small else "",
                    "value": span.get_text(strip=True) if span else "",
                    "full": "full" in cls,
                })
            if out:
                break  # 取第一个命中的事实网格
        return out

    # ============================================================
    # interactions
    # ============================================================
    def _analyze_interactions(self) -> list[dict]:
        interactions: list[dict] = []
        # tab switch
        if self.soup.find(attrs={"role": "tablist"}):
            interactions.append({
                "type": "tab-switch", "trigger": "click",
                "target": ".tab-bar .tab", "action": "switchPanel",
            })
        # autoplay
        for script in self.scripts:
            # setInterval
            for m in re.finditer(r"setInterval\s*\(\s*(?:function\s*\(\)|[^,]+?)\s*,\s*(\d+)\s*\)", script):
                interval = int(m.group(1))
                # 判断上下文
                ctx_start = max(0, m.start() - 200)
                ctx = script[ctx_start:m.start() + 100]
                target = "unknown"
                stop_on = []
                if "member" in ctx.lower() or "selectMember" in ctx:
                    target = "members"
                elif "work" in ctx.lower() or "nextWork" in ctx:
                    target = "works"
                # stopOn
                if "click" in ctx and "stopAutoPlay" in ctx:
                    stop_on.append("click")
                if "touchstart" in ctx:
                    stop_on.append("touchstart")
                if "mouseenter" in script and target == "works":
                    stop_on.append("mouseenter")
                interactions.append({
                    "type": "autoplay", "target": target,
                    "interval": interval, "stopOn": stop_on or ["user-interaction"],
                })
        # modal open/close
        if self.soup.find(class_=re.compile(r"tab-?more", re.I)):
            interactions.append({
                "type": "modal-open", "trigger": "click",
                "target": ".tab-more", "action": "openModal",
            })
        if self.soup.find(attrs={"role": "dialog"}):
            close_on = []
            if any("Escape" in s for s in self.scripts):
                close_on.append("keydown:Escape")
            close_on.append("overlay-click")
            interactions.append({
                "type": "modal-close", "trigger": close_on, "target": ".modal-overlay",
            })
        # member select
        if self.soup.find(class_=re.compile(r"^member$", re.I)):
            interactions.append({
                "type": "select", "trigger": "click", "target": ".member",
                "action": "selectMember", "sideEffect": "updateDetailPanel",
            })
        return interactions

    # ============================================================
    # responsive
    # ============================================================
    def _analyze_responsive(self) -> list[dict]:
        out: list[dict] = []
        for query, body in split_media_blocks(self.css):
            if not query:
                continue
            changes: list[str] = []
            for sel, props in parse_rules(body):
                # 简化：记录关键属性变化
                for prop in ("grid-template-columns", "display", "flex", "font-size"):
                    if prop in props:
                        # 找默认值对比
                        default = self._find_default_prop(sel, prop)
                        if default != props[prop]:
                            short_sel = sel.split(",")[0].strip().lstrip(".")[:30]
                            changes.append(f"{short_sel} {prop}: {default or '∅'} → {props[prop]}")
            canvas_size = None
            frame_sel = None
            # 找画框尺寸
            for pat in [r"\.pc-card-frame", r"\.card-frame", r"\.app-container", r"\.main-area"]:
                m = re.search(re.escape(pat.replace("\\", "")) + r"\s*\{([^}]*)\}", body)
                if m:
                    frame_sel = pat.replace("\\", "")
                    w = re.search(r"width:\s*(\d+)px", m.group(1))
                    h = re.search(r"height:\s*(\d+)px", m.group(1))
                    if w or h:
                        canvas_size = [int(w.group(1)) if w else None, int(h.group(1)) if h else None]
                    break
            entry = {"breakpoint": query, "changes": changes[:15]}
            if canvas_size:
                entry["canvas"] = canvas_size
            out.append(entry)
        return out

    def _find_default_prop(self, selector: str, prop: str) -> str | None:
        for sel, props in parse_rules(self.css):
            if sel == selector and prop in props:
                return props[prop]
        return None

    # ============================================================
    # a11y
    # ============================================================
    def _analyze_a11y(self) -> dict:
        return {
            "hasTablist": bool(self.soup.find(attrs={"role": "tablist"})),
            "hasTabpanel": bool(self.soup.find(attrs={"role": "tabpanel"})),
            "hasDialog": bool(self.soup.find(attrs={"role": "dialog"})),
            "hasAriaLive": bool(self.soup.find(attrs={"aria-live": "polite"})),
            "hasAriaPressed": bool(self.soup.find(attrs={"aria-pressed": True})),
            "hasAriaLabel": bool(self.soup.find(attrs={"aria-label": True})),
            "closeOnEscape": any("Escape" in s for s in self.scripts),
            "closeOnOverlayClick": True,  # 通常存在
        }


# ============================================================
# CLI
# ============================================================
def main():
    ap = argparse.ArgumentParser(description="HTML → manifest.json 分析引擎")
    ap.add_argument("html", help="HTML 文件路径")
    ap.add_argument("--out", "-o", required=True, help="输出 manifest.json 路径")
    ap.add_argument("--vertical", help="垂类名（默认从父目录推断）")
    ap.add_argument("--minimal", action="store_true", help="最小提取模式（仅主题色+结构清单）")
    args = ap.parse_args()

    if not os.path.isfile(args.html):
        print(f"ERROR: 文件不存在: {args.html}", file=sys.stderr)
        sys.exit(1)

    try:
        analyzer = HtmlAnalyzer(args.html, vertical=args.vertical, minimal=args.minimal)
        manifest = analyzer.analyze()
    except Exception as e:
        print(f"ERROR: 分析失败 [{type(e).__name__}]: {e}", file=sys.stderr)
        sys.exit(2)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(safe_json_dump(manifest))
    # 摘要
    print(f"✓ 已生成 manifest: {out_path}")
    print(f"  标题: {manifest['meta']['title']}")
    print(f"  垂类: {manifest['meta']['vertical']}")
    print(f"  主题色令牌: {len(manifest['theme']['tokens'])} 个")
    print(f"  Tab: {len(manifest['structure']['tabs'])} 个")
    print(f"  视图: {[v['type'] for v in manifest['structure']['views']]}")
    print(f"  Modal: {len(manifest['structure']['modals'])} 个")
    print(f"  数据: members={len(manifest['data'].get('members',[]))}, "
          f"timeline={len(manifest['data'].get('timeline',[]))}, "
          f"works={len(manifest['data'].get('works',[]))}, "
          f"facts={len(manifest['data'].get('moreFacts',[]))}")
    if manifest["warnings"]:
        print(f"  ⚠ 告警 ({len(manifest['warnings'])}):")
        for w in manifest["warnings"][:5]:
            print(f"    - {w}")


if __name__ == "__main__":
    main()
