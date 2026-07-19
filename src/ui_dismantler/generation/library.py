#!/usr/bin/env python3
"""generate_lib.py — manifest.json → 组件库

基于 Jinja2 模板（assets/templates/）将 manifest 渲染为完整组件库目录。

用法：
    python3 generate_lib.py <manifest.json> --out <输出目录> [--name <库名>] [--prefix <前缀>]

依赖：jinja2
"""

from __future__ import annotations
import json
import os
import re
import sys
from pathlib import Path

from ui_dismantler.core.common import safe_json_dump, slugify
from ui_dismantler.paths import TEMPLATE_DIR

try:
    from jinja2 import Environment, FileSystemLoader, StrictUndefined  # type: ignore
except ImportError:
    print("ERROR: jinja2 未安装。请运行：", file=sys.stderr)
    print("  pip install --user --break-system-packages jinja2", file=sys.stderr)
    sys.exit(2)



def to_pascal(name: str) -> str:
    """kebab/snake → PascalCase。"""
    parts = re.split(r"[-_]", name)
    return "".join(p[:1].upper() + p[1:] for p in parts if p)


def build_render_context(manifest: dict, lib_name: str, prefix: str) -> dict:
    """从 manifest 构造模板渲染上下文。"""
    meta = manifest.get("meta", {})
    structure = manifest.get("structure", {})
    theme = manifest.get("theme", {})
    data = manifest.get("data", {})
    interactions = manifest.get("interactions", [])
    responsive = manifest.get("responsive", [])
    a11y = manifest.get("a11y", {})

    views = structure.get("views", [])
    view_types = {v.get("type") for v in views}
    has_member_grid = "member-grid" in view_types
    has_timeline = "timeline" in view_types
    has_carousel_3d = "carousel-3d" in view_types

    # 当三种结构化视图都没有时，走 generic 视图分支：
    # - 有 tabs：为每个非 more tab 生成一个 <section role=tabpanel>
    # - 无 tabs：生成一个兜底视图（保证 A11y 基线：tabpanel + aria-live）
    tabs_list = structure.get("tabs", [])
    generic_tabs = [t for t in tabs_list if not t.get("more")]
    has_generic_views = not (has_member_grid or has_timeline or has_carousel_3d)
    # 无 tabs 时给一个默认视图，确保有 tabpanel/aria-live
    if has_generic_views and not generic_tabs:
        generic_tabs = [{"id": "main", "label": (meta.get("title") or lib_name), "count": None, "more": False}]

    # 找各视图的详情
    carousel_view = next((v for v in views if v.get("type") == "carousel-3d"), {})
    timeline_view = next((v for v in views if v.get("type") == "timeline"), {})
    member_view = next((v for v in views if v.get("type") == "member-grid"), {})

    # 画布
    canvas = meta.get("canvas", {})
    canvas_pc = canvas.get("pc") or [788, 492]
    canvas_wise = canvas.get("wise") or [380, 456]
    canvas_extreme = canvas.get("extreme") or [300, 360]

    # 响应式档位存在性
    has_responsive_wise = any("500" in r.get("breakpoint", "") for r in responsive)
    has_responsive_extreme = any(
        "320" in r.get("breakpoint", "") or "380" in r.get("breakpoint", "")
        for r in responsive
    )
    # 强制补全三档（spec 要求）
    has_responsive_wise = True
    has_responsive_extreme = True

    # 自动播放
    member_autoplay = next((i for i in interactions if i.get("type") == "autoplay" and i.get("target") == "members"), None)
    works_autoplay = next((i for i in interactions if i.get("type") == "autoplay" and i.get("target") == "works"), None)

    # 时间线 perPage
    tl_per_page = timeline_view.get("perPage", {}) if timeline_view else {}
    timeline_per_page_pc = tl_per_page.get("pc", 3)
    timeline_per_page_mobile = tl_per_page.get("mobile", 2)

    # tabs JSON（供 JS 模板用）
    tabs_json = json.dumps(structure.get("tabs", []), ensure_ascii=False)

    # options JSON（供 example 用：把 data 打包成 mount options）
    options = {
        "title": meta.get("title", lib_name),
        "ariaLabel": meta.get("title", lib_name),
        "tabs": structure.get("tabs", []),
        "members": data.get("members", []),
        "timeline": data.get("timeline", []),
        "works": data.get("works", []),
        "moreFacts": data.get("moreFacts", []),
    }
    options_json = json.dumps(options, ensure_ascii=False, indent=2)

    return {
        "manifest": manifest,
        "lib_name": lib_name,
        "lib_pascal": to_pascal(lib_name),
        "prefix": prefix,
        "example_name": meta.get("caseName", lib_name),
        # theme
        "theme_tokens": theme.get("tokens", []),
        "theme_gradients": theme.get("gradients", []),
        # structure
        "tabs": structure.get("tabs", []),
        "views": views,
        "modals": structure.get("modals", []),
        "story_panels": structure.get("storyPanels", []),
        # flags
        "has_member_grid": has_member_grid,
        "has_timeline": has_timeline,
        "has_carousel_3d": has_carousel_3d,
        "has_generic_views": has_generic_views,
        "generic_tabs": generic_tabs,
        "has_member_autoplay": bool(member_autoplay),
        "has_works_autoplay": bool(works_autoplay),
        "member_autoplay_interval": (member_autoplay or {}).get("interval", 3000),
        "works_autoplay_interval": (works_autoplay or {}).get("interval", 3500),
        "member_per_page": (member_view or {}).get("perPage", 4),
        # carousel
        "carousel_perspective": (carousel_view or {}).get("perspective", 900),
        "carousel_positions": (carousel_view or {}).get("positions", []),
        "carousel_has_story": (carousel_view or {}).get("hasStoryPanel", False),
        # timeline
        "timeline_per_page_pc": timeline_per_page_pc,
        "timeline_per_page_mobile": timeline_per_page_mobile,
        # canvas
        "canvas_pc": canvas_pc,
        "canvas_wise": canvas_wise,
        "canvas_extreme": canvas_extreme,
        "has_responsive_wise": has_responsive_wise,
        "has_responsive_extreme": has_responsive_extreme,
        # a11y
        "a11y": a11y,
        # json for embedding
        "tabs_json": tabs_json,
        "options_json": options_json,
    }


def render_all(manifest: dict, out_dir: Path, lib_name: str, prefix: str) -> None:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        keep_trailing_newline=True,
        trim_blocks=False,
        lstrip_blocks=False,
        # 不用 StrictUndefined，避免 manifest 字段缺失时崩溃
        undefined=__import__("jinja2").Undefined,
    )
    # 注册自定义过滤器
    env.filters["basename"] = lambda p: os.path.basename(str(p)) if p else ""
    ctx = build_render_context(manifest, lib_name, prefix)

    # 目录
    src_dir = out_dir / "src"
    docs_dir = out_dir / "docs"
    examples_dir = out_dir / "examples"
    for d in (src_dir, docs_dir, examples_dir):
        d.mkdir(parents=True, exist_ok=True)

    # 1. CSS
    css = env.get_template("lib.css.j2").render(**ctx)
    (src_dir / f"{lib_name}.css").write_text(css, encoding="utf-8")

    # 2. JS
    js = env.get_template("lib.js.j2").render(**ctx)
    (src_dir / f"{lib_name}.js").write_text(js, encoding="utf-8")

    # 3. example.html
    example = env.get_template("example.html.j2").render(**ctx)
    example_name = ctx["example_name"] or lib_name
    (examples_dir / f"{example_name}.html").write_text(example, encoding="utf-8")

    # 4. 设计规范.md
    spec = env.get_template("spec.md.j2").render(**ctx)
    (docs_dir / "设计规范.md").write_text(spec, encoding="utf-8")

    # 5. README.md
    readme = env.get_template("readme.md.j2").render(**ctx)
    (out_dir / "README.md").write_text(readme, encoding="utf-8")

    # 6. manifest.json 副本（便于追溯/重新生成）
    (out_dir / "manifest.json").write_text(safe_json_dump(manifest), encoding="utf-8")
