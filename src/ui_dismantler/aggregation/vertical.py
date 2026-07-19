#!/usr/bin/env python3
"""
aggregate_vertical.py — 垂类聚合引擎

扫描某垂类目录下所有案例 HTML，逐个 analyze 得 manifest，再归并出
「垂类级 manifest」，生成垂类公共组件库 + 各案例变体配置（variants/）。

用法:
    python3 aggregate_vertical.py <垂类目录> --out <输出目录> [--name <库名>]

输入: 垂类目录（含若干 <案例>/index.html 子目录）
输出:
    <out>/src/<name>.{css,js}        垂类公共库
    <out>/examples/<案例>.html       公共库挂载各案例数据
    <out>/variants/<案例>.json       各案例变体配置（数据 + 主题覆盖）
    <out>/manifest.json              垂类级 manifest（归并产物）
    <out>/README.md                  垂类聚合说明
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from ui_dismantler.analysis.html import HtmlAnalyzer
from ui_dismantler.core.common import slugify
from ui_dismantler.generation.library import render_all


# ============================================================
# 归并逻辑
# ============================================================
def merge_manifests(manifests: list[dict], vertical: str) -> dict:
    """归并多个案例 manifest 为垂类级 manifest。

    策略（务实最小版，保留扩展点）：
    - meta: 取首个 + vertical 标注；canvas 取各案例的并集最大值
    - theme.tokens: 按 name 去重并集；gradients 同理
    - structure.tabs: 按 id 去重并集（保留首个出现的 label/count）
    - structure.views: 按 tabId 去重并集；type 取首个非-generic
    - structure.modals: 按 layout 去重
    - data: 仅保留 schema 字段名并集（不合并具体数据，数据留在 variants）
    - responsive/a11y: 取并集
    - warnings: 汇总
    """
    if not manifests:
        return {}

    base = json.loads(json.dumps(manifests[0]))  # 深拷贝首个作底
    base.setdefault("meta", {})
    base["meta"]["vertical"] = vertical
    base["meta"]["aggregatedFrom"] = [m.get("meta", {}).get("caseName", "?") for m in manifests]
    base["meta"]["caseCount"] = len(manifests)

    # theme 归并
    all_tokens, seen_tok = [], set()
    all_grads, seen_grad = [], set()
    for m in manifests:
        theme = m.get("theme", {})
        for t in theme.get("tokens", []):
            key = t.get("name")
            if key and key not in seen_tok:
                seen_tok.add(key); all_tokens.append(t)
        for g in theme.get("gradients", []):
            # gradient 无 name 字段，按 (selector, value) 去重（同 selector 同 value 才是重复）
            key = (g.get("selector", ""), g.get("value", ""))
            if key not in seen_grad:
                seen_grad.add(key); all_grads.append(g)
    base.setdefault("theme", {})["tokens"] = all_tokens
    base["theme"]["gradients"] = all_grads

    # structure 归并
    struct = base.setdefault("structure", {})
    # tabs 并集（按 id）
    tabs, seen_tab = [], set()
    for m in manifests:
        for t in m.get("structure", {}).get("tabs", []):
            tid = t.get("id")
            if tid and tid not in seen_tab:
                seen_tab.add(tid); tabs.append(t)
    struct["tabs"] = tabs
    # views 并集：tabId/id 非空时按它去重（跨案例同 tabId 视为同一视图）；
    # 为空时不去重（generic 兜底视图各案例独立保留）
    views, seen_view = [], {}
    for m in manifests:
        case = m.get("meta", {}).get("caseName", "?")
        for v in m.get("structure", {}).get("views", []):
            key = v.get("tabId") or v.get("id")
            if key:
                if key not in seen_view:
                    seen_view[key] = len(views); views.append(dict(v))
                else:
                    cur = views[seen_view[key]]
                    if cur.get("type") == "generic" and v.get("type") != "generic":
                        cur["type"] = v["type"]
            else:
                # 无标识的 generic view：保留并标注来源
                vd = dict(v); vd.setdefault("_source", case)
                views.append(vd)
    struct["views"] = views
    # modals 并集（按 layout）
    modals, seen_mod = [], set()
    for m in manifests:
        for md in m.get("structure", {}).get("modals", []):
            lay = md.get("layout", "generic")
            if lay not in seen_mod:
                seen_mod.add(lay); modals.append(md)
    struct["modals"] = modals

    # data schema 字段名并集（不合并具体数据）
    data = base.setdefault("data", {})
    for key in ("members", "timeline", "works", "moreFacts"):
        data.setdefault(key, [])  # 垂类级仅保留空数组作 schema 占位

    # responsive 并集（按 breakpoint 去重）
    resp, seen_bp = [], set()
    for m in manifests:
        for r in m.get("responsive", []):
            bp = r.get("breakpoint", "")
            if bp and bp not in seen_bp:
                seen_bp.add(bp); resp.append(r)
    base["responsive"] = resp

    # a11y 并集（取或）
    a11y = base.setdefault("a11y", {})
    for m in manifests:
        for k, v in m.get("a11y", {}).items():
            if isinstance(v, bool):
                a11y[k] = a11y.get(k, False) or v

    # warnings 汇总（标注来源）
    warnings = []
    for m in manifests:
        case = m.get("meta", {}).get("caseName", "?")
        for w in m.get("warnings", []):
            warnings.append(f"[{case}] {w}")
    base["warnings"] = warnings
    return base


def extract_variant(manifest: dict) -> dict:
    """从案例 manifest 提取变体配置（数据 + 主题覆盖）。"""
    return {
        "caseName": manifest.get("meta", {}).get("caseName", ""),
        "theme": {
            "tokens": manifest.get("theme", {}).get("tokens", []),
            "gradients": manifest.get("theme", {}).get("gradients", []),
        },
        "data": manifest.get("data", {}),
    }


# ============================================================
# 主流程
# ============================================================
def aggregate(vertical_dir: Path, out_dir: Path, lib_name: str) -> None:
    vertical = vertical_dir.name
    # 1. 找所有案例 HTML
    htmls = sorted(vertical_dir.glob("*/index.html"))
    if not htmls:
        # 退一步：直接目录下的 index.html
        if (vertical_dir / "index.html").exists():
            htmls = [vertical_dir / "index.html"]
    if not htmls:
        print(f"ERROR: {vertical_dir} 下未找到案例 HTML（*/index.html）", file=sys.stderr)
        sys.exit(1)

    print(f"聚合垂类「{vertical}」: 发现 {len(htmls)} 个案例")
    manifests = []
    variants = []
    failed = []
    for h in htmls:
        case_name = h.parent.name
        print(f"  analyze: {case_name}")
        try:
            analyzer = HtmlAnalyzer(str(h), vertical=vertical)
            m = analyzer.analyze()
            manifests.append(m)
            variants.append((case_name, extract_variant(m)))
        except Exception as e:
            # 单案例失败不阻塞其余案例
            print(f"    ✗ 跳过（{type(e).__name__}: {e}）", file=sys.stderr)
            failed.append({"case": case_name, "error": f"{type(e).__name__}: {e}"})

    if not manifests:
        print("ERROR: 所有案例均分析失败，无法聚合", file=sys.stderr)
        sys.exit(2)
    if failed:
        print(f"⚠ {len(failed)} 个案例分析失败已跳过，继续聚合剩余 {len(manifests)} 个")

    # 2. 归并
    print("归并 manifest ...")
    merged = merge_manifests(manifests, vertical)

    # 3. 生成垂类公共库
    print(f"生成垂类公共库 → {out_dir}")
    out_dir.mkdir(parents=True, exist_ok=True)
    render_all(merged, out_dir, lib_name, "sg")

    # 4. 写垂类级 manifest
    (out_dir / "manifest.json").write_text(
        json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 5. 写各案例变体配置
    var_dir = out_dir / "variants"
    var_dir.mkdir(exist_ok=True)
    index = []
    for case_name, var in variants:
        slug = slugify(case_name) or case_name
        (var_dir / f"{slug}.json").write_text(
            json.dumps(var, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        index.append({"case": case_name, "file": f"variants/{slug}.json"})
    (var_dir / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 6. README
    readme = f"""# {vertical} 垂类公共组件库

由 {len(manifests)} 个案例聚合而成。

## 结构

- `src/{lib_name}.css` / `src/{lib_name}.js` — 垂类公共库（归并结构 + 主题令牌并集）
- `examples/` — 公共库挂载示例
- `variants/` — 各案例变体配置（数据 + 主题覆盖）
  - `index.json` — 变体清单
  - `<案例>.json` — 单案例数据与主题
- `manifest.json` — 垂类级 manifest（归并产物，含 warnings）

## 使用

1. 引入 `src/{lib_name}.css` 与 `src/{lib_name}.js`
2. 从 `variants/<案例>.json` 读取变体配置
3. 调用 `LibName.mount(el, variant.data)`（主题令牌已在公共库归并，可按需覆盖）

## 归并说明

- tabs/views/modals 按 id/tabId/layout 去重并集
- 主题令牌按 name 去重并集
- 数据仅保留 schema 占位，具体数据在各 variant
- warnings 汇总自各案例（带来源标注）

## 案例清单

"""
    for case_name, _ in variants:
        readme += f"- {case_name}\n"
    if failed:
        readme += f"\n## 分析失败（{len(failed)} 个，已跳过）\n\n"
        for f in failed:
            readme += f"- {f['case']}: {f['error']}\n"
    (out_dir / "README.md").write_text(readme, encoding="utf-8")

    print(f"完成: {out_dir}（公共库 + {len(variants)} 个变体）")
    if failed:
        print(f"⚠ {len(failed)} 个案例分析失败已跳过（见 README）")
    if merged.get("warnings"):
        print(f"⚠ 归并 manifest 含 {len(merged['warnings'])} 条告警，请复核 manifest.json")
