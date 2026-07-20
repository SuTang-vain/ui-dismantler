"""Vertical-case manifest merging and variant extraction.

从 codex/experimental-features 分支迁移 merge_manifests + extract_variant。
去掉 generate_lib 依赖（main 的哲学是 agent 产出代码，工具只做合并分析）。

merge_manifests: 归并多个案例 manifest 为垂类级 manifest
extract_variant: 从案例 manifest 提取变体配置（数据 + 主题覆盖）
"""

from __future__ import annotations

import json
from typing import Any


def merge_manifests(manifests: list[dict[str, Any]], vertical: str) -> dict[str, Any]:
    """归并多个案例 manifest 为垂类级 manifest。

    策略（务实最小版，保留扩展点）：
    - meta: 取首个 + vertical 标注；canvas 取各案例的并集最大值
    - theme.tokens: 按 name 去重并集；gradients 按 (selector, value) 去重
    - structure.tabs: 按 id 去重并集（保留首个出现的 label/count）
    - structure.views: 按 tabId/id 去重并集；type 取首个非-generic
    - structure.modals: 按 layout 去重
    - data: 仅保留 schema 字段名并集（不合并具体数据，数据留在 variants）
    - responsive/a11y: 取并集
    - warnings: 汇总（标注来源案例）
    """
    if not manifests:
        return {}

    base = json.loads(json.dumps(manifests[0]))  # 深拷贝首个作底
    base.setdefault("meta", {})
    base["meta"]["vertical"] = vertical
    base["meta"]["aggregatedFrom"] = [
        m.get("meta", {}).get("caseName", "?") for m in manifests
    ]
    base["meta"]["caseCount"] = len(manifests)

    # theme 归并
    all_tokens, seen_tok = [], set()
    all_grads, seen_grad = [], set()
    for m in manifests:
        theme = m.get("theme", {})
        for t in theme.get("tokens", []):
            key = t.get("name")
            if key and key not in seen_tok:
                seen_tok.add(key)
                all_tokens.append(t)
        for g in theme.get("gradients", []):
            key = (g.get("selector", ""), g.get("value", ""))
            if key not in seen_grad:
                seen_grad.add(key)
                all_grads.append(g)
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
                seen_tab.add(tid)
                tabs.append(t)
    struct["tabs"] = tabs
    # views 并集：tabId/id 非空时按它去重；为空时不去重（generic 各案例独立保留）
    views, seen_view = [], {}
    for m in manifests:
        case = m.get("meta", {}).get("caseName", "?")
        for v in m.get("structure", {}).get("views", []):
            key = v.get("tabId") or v.get("id")
            if key:
                if key not in seen_view:
                    seen_view[key] = len(views)
                    views.append(dict(v))
                else:
                    cur = views[seen_view[key]]
                    if cur.get("type") == "generic" and v.get("type") != "generic":
                        cur["type"] = v["type"]
            else:
                vd = dict(v)
                vd.setdefault("_source", case)
                views.append(vd)
    struct["views"] = views
    # modals 并集（按 layout）
    modals, seen_mod = [], set()
    for m in manifests:
        for md in m.get("structure", {}).get("modals", []):
            lay = md.get("layout", "generic")
            if lay not in seen_mod:
                seen_mod.add(lay)
                modals.append(md)
    struct["modals"] = modals

    # data schema 字段名并集（不合并具体数据）
    data = base.setdefault("data", {})
    for key in ("members", "timeline", "works", "moreFacts"):
        data.setdefault(key, [])

    # responsive 并集（按 breakpoint 去重）
    resp, seen_bp = [], set()
    for m in manifests:
        for r in m.get("responsive", []):
            bp = r.get("breakpoint", "")
            if bp and bp not in seen_bp:
                seen_bp.add(bp)
                resp.append(r)
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


def extract_variant(manifest: dict[str, Any]) -> dict[str, Any]:
    """从案例 manifest 提取变体配置（数据 + 主题覆盖）。

    返回的变体配置用于在共享垂类库上覆盖案例特有的数据和主题色。
    """
    return {
        "caseName": manifest.get("meta", {}).get("caseName", ""),
        "theme": {
            "tokens": manifest.get("theme", {}).get("tokens", []),
            "gradients": manifest.get("theme", {}).get("gradients", []),
        },
        "data": manifest.get("data", {}),
    }
