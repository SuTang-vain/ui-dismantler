#!/usr/bin/env python3
"""
roundtrip.py — 往返等价度测试

回答核心问题：组件库用原数据渲染后，和原 HTML 有多像？

流程：
  原 HTML ──运行（失败时显式回退静态解析）──▶ 参照 DOM
  组件库 ──mount(原数据)──▶ 渲染后 DOM（jsdom）
  参照 DOM ⇄ 渲染后 DOM ──对比──▶ 等价度报告（结构 / 文本）

对比维度：
  1. 结构等价：DOM 树拓扑（标签、层级、class 集合）相似度
  2. 文本等价：可见文本内容集合的重合度

用法:
  python3 roundtrip.py <原 HTML> --lib <组件库目录> [--out <报告路径>]
  python3 roundtrip.py <原 HTML> --lib <组件库目录> --scenarios <场景.json>

退出码: 0 表示流程可跑通且场景门禁通过，1 表示场景未达标，2 表示流程出错。
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString

from scenario_coverage import compute_interaction_coverage

# 同目录脚本
HERE = Path(__file__).resolve().parent
SKILL_DIR_DEFAULT = HERE.parent / "src" / "skill"
RENDERER = HERE / "_roundtrip_render.mjs"


# ============================================================
# 参照 DOM：从原 HTML 提取结构化表示
# ============================================================
def extract_reference_dom(html_path: Path) -> dict:
    """从原 HTML 提取参照 DOM 树 + 可见文本集合。

    原 HTML 是自包含的（内联 style/script），渲染后就是静态 DOM。
    我们提取 <body> 的结构（跳过 script/style），作为对比基准。
    """
    raw = html_path.read_bytes()
    # 复用 analyze 的编码嗅探
    text = _decode_robust(raw)
    soup = BeautifulSoup(text, "html.parser")
    body = soup.find("body") or soup
    tree = _serialize(body)
    texts = _collect_texts(body)
    return {
        "ok": True,
        "mode": "static",
        "dom": tree,
        "texts": texts,
        "text_count": len(texts),
    }


def _decode_robust(raw: bytes) -> str:
    import re
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw[3:].decode("utf-8", errors="replace")
    head = raw[:4096]
    m = re.search(rb'<meta[^>]+charset=["\']?\s*([\w-]+)', head, re.I)
    enc = m.group(1).decode("ascii", errors="ignore").lower() if m else None
    for c in (enc, "utf-8", "gb18030"):
        if not c:
            continue
        try:
            return raw.decode(c)
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", errors="replace")


SKIP_TAGS = {"script", "style", "link", "meta", "title", "head"}


def _serialize(node) -> dict | None:
    """递归序列化 DOM 节点为 {tag, classes, children?, text?}。与 Node 端格式一致。"""
    if isinstance(node, NavigableString):
        t = str(node).strip()
        return {"tag": "#text", "text": t} if t else None
    if not getattr(node, "name", None):
        return None
    tag = node.name.lower()
    if tag in SKIP_TAGS:
        return None
    classes = node.get("class") or []
    if isinstance(classes, str):
        classes = classes.split()
    node2 = {"tag": tag, "classes": list(classes)}
    children = []
    for child in node.children:
        s = _serialize(child)
        if s:
            children.append(s)
    if children:
        if len(children) == 1 and children[0]["tag"] == "#text":
            node2["text"] = children[0]["text"]
        else:
            node2["children"] = children
    return node2


def _collect_texts(node) -> list[str]:
    """收集可见文本，过滤开发注释与隐藏数据源占位。"""
    out = []
    if isinstance(node, NavigableString):
        t = str(node).strip()
        if not t:
            return out
        # 过滤开发注释类文本（这些不是真实内容，不该作为对比基准）
        if _is_dev_noise(t):
            return out
        out.append(t)
        return out
    if not getattr(node, "name", None):
        return out
    if node.name.lower() in {"script", "style"}:
        return out
    # 跳过隐藏的数据源容器（class 含 data-source / hidden / sr-only 等）
    cls = node.get("class") or []
    cls_str = " ".join(cls).lower() if isinstance(cls, list) else str(cls).lower()
    if any(k in cls_str for k in ("data-source", "sr-only", "visually-hidden")):
        return out
    if node.get("hidden") is not None:
        return out
    for child in node.children:
        out.extend(_collect_texts(child))
    return out


def _is_dev_noise(text: str) -> bool:
    """识别开发注释/占位文本（非真实内容）。"""
    noise_markers = [
        "JS 动态", "JS动态", "动态填充", "动态渲染",
        "数据源", "隐藏，供 JS", "供 JS 读取",
        "Modal overlay:", "sits at the page level",
    ]
    return any(m in text for m in noise_markers)


# ============================================================
# 渲染 DOM：调 Node 渲染器拿 mount 后的 DOM
# ============================================================
def _run_renderer(html_path: Path, *renderer_args: str, timeout: int = 30) -> dict:
    """运行统一 jsdom 渲染器并解析 JSON 协议。"""
    try:
        proc = subprocess.run(
            ["node", str(RENDERER), str(html_path), *renderer_args],
            capture_output=True,
            timeout=timeout,
            cwd=str(HERE),
            encoding="utf-8",
            errors="replace",
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"jsdom 渲染超时（{timeout}s）"}
    if proc.returncode != 0:
        return {
            "ok": False,
            "error": f"node 退出码 {proc.returncode}: {proc.stderr[:200]}",
            "stderr": proc.stderr[:400],
        }
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        return {
            "ok": False,
            "error": f"渲染器输出非 JSON: {exc}",
            "stderr": proc.stderr[:400],
            "raw": proc.stdout[:200],
        }


def _scenario_renderer_args(
    scenario_file: Path | None,
    scenario_id: str | None,
) -> tuple[str, ...]:
    if scenario_file is None and scenario_id is None:
        return ()
    if scenario_file is None or not scenario_id:
        raise ValueError("scenario_file 与 scenario_id 必须同时提供")
    return ("--scenario-file", str(scenario_file), "--scenario-id", scenario_id)


def render_generated_dom(
    lib_dir: Path,
    width: int = 1024,
    height: int = 768,
    scenario_file: Path | None = None,
    scenario_id: str | None = None,
) -> dict:
    """用 jsdom 执行生成库 example.html 的 mount，返回渲染后 DOM。"""
    examples = sorted(lib_dir.glob("examples/*.html"))
    if not examples:
        return {"ok": False, "error": f"{lib_dir}/examples/ 下无 HTML"}
    example = examples[0]
    return _run_renderer(
        example,
        "--width", str(width),
        "--height", str(height),
        *_scenario_renderer_args(scenario_file, scenario_id),
    )


def render_reference_dom(
    html_path: Path,
    width: int = 1024,
    height: int = 768,
    scenario_file: Path | None = None,
    scenario_id: str | None = None,
) -> dict:
    """执行原页面资源和脚本，返回用户运行时可见的 body DOM。"""
    return _run_renderer(
        html_path,
        "--ref",
        "--width", str(width),
        "--height", str(height),
        *_scenario_renderer_args(scenario_file, scenario_id),
    )


def resolve_reference_dom(
    html_path: Path,
    mode: str = "auto",
    width: int = 1024,
    height: int = 768,
) -> dict:
    """按请求模式生成参照；auto 运行失败时显式回退静态解析。"""
    if mode == "static":
        result = extract_reference_dom(html_path)
        result["requested_mode"] = mode
        result["fallback"] = False
        return result

    rendered = render_reference_dom(html_path, width=width, height=height)
    rendered["requested_mode"] = mode
    rendered["fallback"] = False
    if rendered.get("ok") or mode == "rendered":
        return rendered

    static = extract_reference_dom(html_path)
    static.update({
        "requested_mode": mode,
        "fallback": True,
        "runtime_error": rendered.get("error", "运行态参照失败"),
        "runtime_errors": rendered.get("runtimeErrors", []),
        "missing_files": rendered.get("missingFiles", []),
    })
    return static


ALLOWED_SCENARIO_ACTIONS = {"click", "input", "key", "wait"}


def load_scenario_matrix(path: Path) -> list[dict]:
    """读取并验证无代码执行能力的轻量交互场景协议。"""
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"场景文件读取失败: {exc}") from exc
    if not isinstance(document, dict) or document.get("schemaVersion") != "1.0":
        raise ValueError("场景文件必须是 schemaVersion=1.0 的 object")
    scenarios = document.get("scenarios")
    if not isinstance(scenarios, list) or not scenarios:
        raise ValueError("scenarios 必须是非空数组")
    seen: set[str] = set()
    normalized: list[dict] = []
    for index, scenario in enumerate(scenarios):
        if not isinstance(scenario, dict):
            raise ValueError(f"scenarios[{index}] 必须是 object")
        scenario_id = scenario.get("id")
        if not isinstance(scenario_id, str) or not scenario_id.strip():
            raise ValueError(f"scenarios[{index}].id 必须是非空字符串")
        if scenario_id in seen:
            raise ValueError(f"场景 id 重复: {scenario_id}")
        seen.add(scenario_id)
        viewport = scenario.get("viewport", {})
        if not isinstance(viewport, dict):
            raise ValueError(f"场景 {scenario_id} 的 viewport 必须是 object")
        for key in ("width", "height"):
            value = viewport.get(key)
            if value is not None and (not isinstance(value, int) or value <= 0):
                raise ValueError(f"场景 {scenario_id} 的 viewport.{key} 必须为正整数")
        steps = scenario.get("steps", [])
        if not isinstance(steps, list):
            raise ValueError(f"场景 {scenario_id} 的 steps 必须是数组")
        for step_index, step in enumerate(steps):
            _validate_scenario_step(scenario_id, step_index, step)
        assertions = scenario.get("assertions")
        if not isinstance(assertions, list) or not assertions:
            raise ValueError(f"场景 {scenario_id} 的 assertions 必须是非空数组")
        for assertion_index, assertion in enumerate(assertions):
            _validate_scenario_assertion(scenario_id, assertion_index, assertion)
        normalized.append({
            "id": scenario_id,
            "label": scenario.get("label", scenario_id),
            "viewport": viewport,
            "steps": steps,
            "assertions": assertions,
            **{
                key: scenario[key]
                for key in ("candidate", "covers", "notes")
                if key in scenario
            },
        })
    return normalized


def load_manifest_interactions(path: Path) -> list[dict]:
    """读取 analyzer manifest 中的交互清单。"""
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"manifest 读取失败: {exc}") from exc
    if not isinstance(manifest, dict):
        raise ValueError("manifest 必须是 object")
    interactions = manifest.get("interactions", [])
    if not isinstance(interactions, list):
        raise ValueError("manifest.interactions 必须是数组")
    return interactions


def _validate_scenario_step(scenario_id: str, index: int, step: object) -> None:
    if not isinstance(step, dict):
        raise ValueError(f"场景 {scenario_id} steps[{index}] 必须是 object")
    action = step.get("action")
    if action not in ALLOWED_SCENARIO_ACTIONS:
        raise ValueError(f"场景 {scenario_id} steps[{index}] action 不支持: {action}")
    if action in {"click", "input"}:
        _validate_scenario_target(scenario_id, index, step.get("target"), required=True)
    elif action == "key":
        _validate_scenario_target(scenario_id, index, step.get("target"), required=False)
        if not isinstance(step.get("key"), str) or not step["key"]:
            raise ValueError(f"场景 {scenario_id} steps[{index}].key 必须是非空字符串")
    if action == "input" and not isinstance(step.get("value"), str):
        raise ValueError(f"场景 {scenario_id} steps[{index}].value 必须是字符串")
    if action == "wait":
        ms = step.get("ms")
        if not isinstance(ms, int) or not 0 <= ms <= 5000:
            raise ValueError(f"场景 {scenario_id} steps[{index}].ms 必须位于 0..5000")


def _validate_scenario_target(
    scenario_id: str,
    index: int,
    target: object,
    required: bool,
) -> None:
    if target is None and not required:
        return
    if isinstance(target, str) and target:
        return
    if isinstance(target, dict):
        selectors = [target.get(key) for key in ("reference", "library", "default")]
        if any(isinstance(value, str) and value for value in selectors):
            return
    raise ValueError(f"场景 {scenario_id} steps[{index}].target 无有效 selector")


def _validate_scenario_assertion(
    scenario_id: str,
    index: int,
    assertion: object,
) -> None:
    if not isinstance(assertion, dict):
        raise ValueError(f"场景 {scenario_id} assertions[{index}] 必须是 object")
    _validate_scenario_target(
        scenario_id,
        index,
        assertion.get("target"),
        required=True,
    )
    checks = {
        "visible", "text", "textContains", "value", "focused",
        "classIncludes", "classExcludes", "attributes",
    }
    if not any(key in assertion for key in checks):
        raise ValueError(f"场景 {scenario_id} assertions[{index}] 至少需要一个检查项")
    for key in ("visible", "focused"):
        if key in assertion and not isinstance(assertion[key], bool):
            raise ValueError(f"场景 {scenario_id} assertions[{index}].{key} 必须是 boolean")
    for key in ("text", "textContains", "value"):
        if key in assertion and not isinstance(assertion[key], str):
            raise ValueError(f"场景 {scenario_id} assertions[{index}].{key} 必须是字符串")
    for key in ("classIncludes", "classExcludes"):
        value = assertion.get(key)
        if value is not None and (
            not isinstance(value, list)
            or not all(isinstance(item, str) and item for item in value)
        ):
            raise ValueError(f"场景 {scenario_id} assertions[{index}].{key} 必须是字符串数组")
    attributes = assertion.get("attributes")
    if attributes is not None and (
        not isinstance(attributes, dict)
        or not all(
            isinstance(name, str)
            and name
            and (isinstance(value, str) or value is None)
            for name, value in attributes.items()
        )
    ):
        raise ValueError(f"场景 {scenario_id} assertions[{index}].attributes 格式无效")


def score_comparison(reference: dict, library: dict) -> dict:
    """对任一初始/场景状态执行与主报告一致的评分。"""
    structure = compare_structure(reference, library)
    text = compare_texts(reference, library)
    structure_score = (
        structure.get("node_match_rate", 0) + structure.get("class_match_rate", 0)
    ) / 2
    scores = {
        "structure": round(structure_score, 3),
        "text": text.get("text_match_rate", 0),
        "overall": round((structure_score + text.get("text_match_rate", 0)) * 0.5, 3),
    }
    return {"structure": structure, "text": text, "scores": scores}


def evaluate_scenario_matrix(
    html_path: Path,
    lib_dir: Path,
    scenario_file: Path,
    scenarios: list[dict],
    default_width: int,
    default_height: int,
    threshold: float,
) -> dict:
    """在独立页面实例中对称执行每个场景并逐状态评分。"""
    states: list[dict] = []
    for scenario in scenarios:
        viewport = scenario.get("viewport", {})
        width = viewport.get("width", default_width)
        height = viewport.get("height", default_height)
        reference = render_reference_dom(
            html_path,
            width=width,
            height=height,
            scenario_file=scenario_file,
            scenario_id=scenario["id"],
        )
        library = render_generated_dom(
            lib_dir,
            width=width,
            height=height,
            scenario_file=scenario_file,
            scenario_id=scenario["id"],
        )
        state = {
            "id": scenario["id"],
            "label": scenario["label"],
            "viewport": {"width": width, "height": height},
            "reference_ok": reference.get("ok", False),
            "library_ok": library.get("ok", False),
            "reference_scenario": reference.get("scenario"),
            "library_scenario": library.get("scenario"),
            "reference_error": reference.get("error"),
            "library_error": library.get("error"),
        }
        if reference.get("ok") and library.get("ok"):
            state.update(score_comparison(reference, library))
            state["passed"] = state["scores"]["overall"] >= threshold
        else:
            state["scores"] = {"structure": 0.0, "text": 0.0, "overall": 0.0}
            state["passed"] = False
        states.append(state)
    overalls = [state["scores"]["overall"] for state in states]
    return {
        "schemaVersion": "1.0",
        "source": str(scenario_file),
        "threshold": threshold,
        "total": len(states),
        "passed": sum(1 for state in states if state["passed"]),
        "avgOverall": round(sum(overalls) / len(overalls), 3) if overalls else 0.0,
        "minOverall": min(overalls, default=0.0),
        "states": states,
    }


# ============================================================
# 对比器
# ============================================================
def compare_structure(ref: dict, got: dict) -> dict:
    """结构对比：递归计算节点相似度。

    策略：
    1. 跳过纯容器层（无 class 的 div）对齐
    2. class 语义匹配：原 class 与 sg- 前缀版视为等价（pc-card-frame ≈ sg-frame）
    3. 子节点按 class 相似度做贪心匹配（而非按位置）
    """
    if not got.get("ok"):
        return {"node_match_rate": 0.0, "class_match_rate": 0.0, "error": got.get("error", "渲染失败")}
    ref_tree = ref["dom"]
    got_tree = got.get("dom")
    if not got_tree:
        return {"node_match_rate": 0.0, "class_match_rate": 0.0, "error": "渲染后 DOM 为空"}

    stats = {"ref_nodes": 0, "got_nodes": 0, "matched": 0, "ref_classes": 0, "cls_matched": 0}

    def norm_classes(cls_list):
        """归一化 class：去 sg- 前缀，用于语义匹配。"""
        out = set()
        for c in cls_list:
            c = c.lower()
            if c.startswith("sg-"):
                c = c[3:]
            if c:
                out.add(c)
        return out

    def _suffix_tokens(cls_name):
        """把类名按 - 拆成 token，返回后缀 token 集合（用于重命名容错）。

        如 'pc-card-frame' -> {'frame','card-frame','pc-card-frame'}（所有后缀段）
        'frame' -> {'frame'}
        这样 'frame' 能匹配 'pc-card-frame' 的尾 token。
        """
        parts = cls_name.split("-")
        return {"-".join(parts[i:]) for i in range(len(parts))}

    def is_container(node):
        """无 class 的 div/span/body 是纯容器，对齐时跳过。

        body 和 mount 容器 div 都是纯包裹层，无语义 class，
        跳过它们才能让参照侧（body > main.pc-card-frame）与
        渲染侧（div > main.sg-frame）在 main 层对齐。
        """
        return (node.get("tag") in ("div", "span", "body")
                and not node.get("classes")
                and not node.get("text"))

    def unwrap(node):
        """跳过容器层，返回首个有意义的子节点（用于顶层对齐）。

        无 class 的 div/span/body 是纯包裹层。若它只有一个子，下钻到子；
        若有多个子，取第一个带 class 的子（语义入口）。
        这样 body > main.pc-card-frame 与 div > main.sg-frame 能在 main 层对齐。
        """
        while is_container(node):
            ch = node.get("children", [])
            if not ch:
                break
            if len(ch) == 1:
                node = ch[0]
                continue
            # 多子：找第一个带 class 的子节点（跳过 #text 等噪音）
            picked = None
            for c in ch:
                if c.get("tag") != "#text" and c.get("classes"):
                    picked = c
                    break
            node = picked if picked else ch[0]
        return node

    def class_similarity(rc, gc):
        """两组 class 的相似度（归一化后）。

        综合 Jaccard 精确匹配 + 后缀 token 容错匹配：
        - Jaccard：完全相同的归一化类名
        - 后缀容错：如 'frame' 匹配 'pc-card-frame' 的尾 token，给 0.6 信用
          （处理 agent 把 pc-card-frame 重命名为 sg-frame 的情况）

        双方都无 class 时返回中性低分 0.3（不返回 1.0）：
        无 class 意味着无法判断对齐性，不应压过有 class 的节点。
        否则 #text 与无 class 容器会总是"最佳匹配"，挤掉真正的结构匹配。
        """
        if not rc and not gc:
            return 0.3  # 中性低分，不压过有 class 的候选
        if not rc or not gc:
            return 0.0
        # Jaccard 精确部分
        exact = len(rc & gc)
        union = len(rc | gc)
        jaccard = exact / union if union else 0.0
        # 后缀 token 容错：非精确匹配的类对，看尾 token 是否重合
        r_suffix = set()
        for c in rc:
            r_suffix |= _suffix_tokens(c)
        g_suffix = set()
        for c in gc:
            g_suffix |= _suffix_tokens(c)
        suffix_match = len(r_suffix & g_suffix)
        # 后缀信用：重合的后缀 token 数 / 较大组的类数，上限 0.6
        max_classes = max(len(rc), len(gc))
        suffix_credit = min(0.6, (suffix_match / max_classes) * 0.6) if max_classes else 0.0
        # 综合：Jaccard 为主，后缀信用补充（不重复计精确匹配的）
        return min(1.0, jaccard + suffix_credit)

    def find_best_match(r_node, candidates, used):
        """在候选（原 gch 列表 + used 索引集）中找 class 最相似的未占用节点。

        返回 (原索引, similarity)。返回的索引可直接用于 gch[i] 和 used.add(i)。
        """
        rc = norm_classes(r_node.get("classes", []))
        best_i, best_s = -1, 0.0
        for i, g in enumerate(candidates):
            if i in used:
                continue
            gc = norm_classes(g.get("classes", []))
            s = class_similarity(rc, gc)
            if s > best_s:
                best_s, best_i = s, i
        return best_i, best_s

    def walk(r, g):
        stats["ref_nodes"] += 1
        stats["got_nodes"] += 1 if g else 0
        if not g:
            return
        if r.get("tag") == g.get("tag"):
            stats["matched"] += 1
        rc = norm_classes(r.get("classes", []))
        gc = norm_classes(g.get("classes", []))
        if rc or gc:
            stats["ref_classes"] += 1
            stats["cls_matched"] += class_similarity(rc, gc)
        # 递归：对子节点做贪心匹配
        rch = r.get("children", []) or []
        gch = g.get("children", []) or []
        used = set()
        for ri in rch:
            bi, bs = find_best_match(ri, gch, used)
            if bi >= 0 and bs > 0.2:  # 相似度阈值 0.2 才算匹配（容许类名重命名）
                used.add(bi)
                walk(ri, gch[bi])
            else:
                stats["ref_nodes"] += _count(ri)
        # 未匹配的 got 子节点计入 got_nodes
        for j, g in enumerate(gch):
            if j not in used:
                stats["got_nodes"] += _count(g)

    walk(unwrap(ref_tree), unwrap(got_tree))
    recall = stats["matched"] / stats["ref_nodes"] if stats["ref_nodes"] else 0.0
    precision = stats["matched"] / stats["got_nodes"] if stats["got_nodes"] else 0.0
    # 冗余惩罚：防止 agent 靠多渲染冗余 DOM 刷高 recall。
    # 宽容带：got ≤ ref×1.5 不罚（容许数据驱动渲染的合理节点膨胀）；
    # 超出部分按 (got-ref*1.5)/got 比例折扣 recall，最多罚 80%（保留 0.2 底，避免归零误判为全错）。
    _EXCESS_TOLERANCE = 1.5
    excess = max(0, stats["got_nodes"] - stats["ref_nodes"] * _EXCESS_TOLERANCE)
    excess_ratio = excess / stats["got_nodes"] if stats["got_nodes"] else 0.0
    redundancy_penalty = min(0.8, excess_ratio)
    node_rate = recall * (1 - redundancy_penalty)
    cls_rate = stats["cls_matched"] / stats["ref_classes"] if stats["ref_classes"] else 1.0
    return {
        "node_match_rate": round(node_rate, 3),
        "node_recall": round(recall, 3),          # 原始召回率（无惩罚，供诊断）
        "node_precision": round(precision, 3),      # 精确率（got 噪音越多越低）
        "redundancy_penalty": round(redundancy_penalty, 3),
        "class_match_rate": round(cls_rate, 3),
        "ref_nodes": stats["ref_nodes"],
        "got_nodes": stats["got_nodes"],
        "matched_nodes": stats["matched"],
    }


def _count(node) -> int:
    """递归计数节点数。"""
    n = 1
    for c in node.get("children", []):
        n += _count(c)
    return n


def compare_texts(ref: dict, got: dict) -> dict:
    """文本对比：可见文本集合的重合度（精确匹配 + 包含匹配）。

    主分用 recall（matched / ref_count）：原 HTML 静态文本通常少于数据驱动
    渲染后的文本（如成员卡片各有多条字段），故 got 冗余多为合理膨胀，不惩罚。
    另报 text_precision + extra 列表供 agent 诊断 got 侧噪音。
    """
    if not got.get("ok"):
        return {"text_match_rate": 0.0, "error": got.get("error", "渲染失败")}
    ref_texts = ref["texts"]
    got_texts = got.get("texts", [])
    if not ref_texts:
        return {"text_match_rate": 1.0 if not got_texts else 0.0, "ref_count": 0, "got_count": len(got_texts)}
    ref_set = set(ref_texts)
    got_set = set(got_texts)
    # 精确匹配
    exact = len(ref_set & got_set)
    # 包含匹配：ref 文本被某个 got 文本包含（容许拼接差异）
    contain = 0
    for t in ref_set - got_set:
        if any(t in g for g in got_set):
            contain += 1
    matched = exact + contain
    rate = matched / len(ref_set) if ref_set else 1.0
    # precision：matched / got_count（got 噪音越多越低；不做惩罚，仅诊断）
    precision = matched / len(got_set) if got_set else 0.0
    return {
        "text_match_rate": round(rate, 3),
        "text_precision": round(precision, 3),
        "exact_match": exact,
        "contain_match": contain,
        "ref_count": len(ref_set),
        "got_count": len(got_set),
        "missing": sorted(ref_set - got_set)[:10],  # 缺失的文本（最多列 10 条）
        "extra": sorted(got_set - ref_set)[:10],   # got 侧多余文本（噪音诊断，最多 10 条）
    }


# ============================================================
# 主流程
# ============================================================
def main():
    ap = argparse.ArgumentParser(description="往返等价度测试：原 HTML ⇄ 组件库渲染后 DOM")
    ap.add_argument("html", help="原 HTML 文件路径")
    ap.add_argument("--skill-dir", default=str(SKILL_DIR_DEFAULT), help="skill 目录（默认 src/skill，仅用于定位渲染器）")
    ap.add_argument("--lib", help="已生成组件库目录（必填：agent 产出的库，不再走 v1 模板链路）")
    ap.add_argument(
        "--reference-mode",
        choices=("auto", "rendered", "static"),
        default="auto",
        help="参照模式：auto 优先运行态、失败显式回退静态（默认）",
    )
    ap.add_argument("--width", type=int, default=1024, help="jsdom 视口宽度（默认 1024）")
    ap.add_argument("--height", type=int, default=768, help="jsdom 视口高度（默认 768）")
    ap.add_argument("--scenarios", help="交互场景 JSON；每个场景从全新页面实例执行")
    ap.add_argument("--state-threshold", type=float, default=0.85,
                    help="单个交互状态综合分门槛（默认 0.85）")
    ap.add_argument("--manifest", help="analyze_html.py 生成的 manifest，用于交互覆盖率报告")
    ap.add_argument("--coverage-threshold", type=float,
                    help="交互覆盖率门槛；需要同时提供 --manifest 与 --scenarios")
    ap.add_argument("--out", help="报告输出路径（默认 stdout）")
    args = ap.parse_args()

    html_path = Path(args.html).resolve()
    if not html_path.is_file():
        print(f"ERROR: 文件不存在: {html_path}", file=sys.stderr)
        sys.exit(2)

    if not args.lib:
        print("ERROR: 必须提供 --lib <组件库目录>。", file=sys.stderr)
        print("       agent 驱动模式下组件库由 agent 产出，不再自动跑 analyze+generate。", file=sys.stderr)
        sys.exit(2)

    if args.width <= 0 or args.height <= 0:
        print("ERROR: --width/--height 必须为正整数", file=sys.stderr)
        sys.exit(2)
    if not 0 <= args.state_threshold <= 1:
        print("ERROR: --state-threshold 必须位于 0..1", file=sys.stderr)
        sys.exit(2)
    if args.coverage_threshold is not None and not 0 <= args.coverage_threshold <= 1:
        print("ERROR: --coverage-threshold 必须位于 0..1", file=sys.stderr)
        sys.exit(2)
    if args.coverage_threshold is not None and (not args.manifest or not args.scenarios):
        print("ERROR: --coverage-threshold 需要同时提供 --manifest 与 --scenarios", file=sys.stderr)
        sys.exit(2)
    if args.scenarios and args.reference_mode == "static":
        print("ERROR: 交互场景不能与 --reference-mode static 同时使用", file=sys.stderr)
        sys.exit(2)

    scenario_file = Path(args.scenarios).resolve() if args.scenarios else None
    try:
        scenarios = load_scenario_matrix(scenario_file) if scenario_file else []
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(2)

    manifest_file = Path(args.manifest).resolve() if args.manifest else None
    try:
        manifest_interactions = load_manifest_interactions(manifest_file) if manifest_file else []
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(2)

    skill_dir = Path(args.skill_dir).resolve()
    if not RENDERER.exists():
        print(f"ERROR: 渲染器不存在: {RENDERER}", file=sys.stderr)
        sys.exit(2)

    try:
        # 1. 参照 DOM
        print(f"[1/3] 获取原 HTML 参照 DOM（{args.reference_mode}）...", file=sys.stderr)
        ref = resolve_reference_dom(
            html_path,
            mode=args.reference_mode,
            width=args.width,
            height=args.height,
        )
        if not ref.get("ok"):
            raise RuntimeError(f"参照 DOM 获取失败: {ref.get('error', '未知错误')}")
        ref_text_count = ref.get("textCount", ref.get("text_count", len(ref.get("texts", []))))
        fallback_note = "，已回退静态" if ref.get("fallback") else ""
        print(f"      模式 {ref.get('mode')}，{ref_text_count} 条文本{fallback_note}", file=sys.stderr)

        # 2. 已生成库
        lib_dir = Path(args.lib).resolve()
        if not lib_dir.is_dir():
            print(f"ERROR: 组件库目录不存在: {lib_dir}", file=sys.stderr)
            sys.exit(2)
        print(f"[2/3] 使用组件库: {lib_dir}", file=sys.stderr)

        # 3. 渲染 + 对比
        print(f"[3/3] jsdom 渲染 + 对比 ...", file=sys.stderr)
        got = render_generated_dom(lib_dir, width=args.width, height=args.height)
        initial = score_comparison(ref, got)
        report = {
            "case": html_path.name,
            "render_ok": got.get("ok", False),
            "render_error": got.get("error"),
            "reference": {
                "requested_mode": ref.get("requested_mode"),
                "mode": ref.get("mode"),
                "fallback": ref.get("fallback", False),
                "runtime_error": ref.get("runtime_error"),
                "runtime_errors": ref.get("runtimeErrors", ref.get("runtime_errors", [])),
                "missing_files": ref.get("missingFiles", ref.get("missing_files", [])),
                "remote_resources": ref.get("remoteResources", []),
                "unsupported_modules": ref.get("unsupportedModules", []),
                "viewport": ref.get("viewport", {"width": args.width, "height": args.height}),
            },
            "library": {
                "runtime_errors": got.get("runtimeErrors", []),
                "missing_files": got.get("missingFiles", []),
                "remote_resources": got.get("remoteResources", []),
                "unsupported_modules": got.get("unsupportedModules", []),
                "viewport": got.get("viewport", {"width": args.width, "height": args.height}),
            },
            **initial,
        }
        if scenario_file:
            print(f"      执行 {len(scenarios)} 个独立交互场景 ...", file=sys.stderr)
            report["scenario_matrix"] = evaluate_scenario_matrix(
                html_path,
                lib_dir,
                scenario_file,
                scenarios,
                args.width,
                args.height,
                args.state_threshold,
            )
        if manifest_file:
            report["interaction_coverage"] = compute_interaction_coverage(
                manifest_interactions, scenarios,
            )
            if args.coverage_threshold is not None:
                report["interaction_coverage"]["threshold"] = args.coverage_threshold
                report["interaction_coverage"]["passed"] = (
                    report["interaction_coverage"]["rate"] >= args.coverage_threshold
                )
        out = json.dumps(report, ensure_ascii=False, indent=2)
        if args.out:
            Path(args.out).write_text(out, encoding="utf-8")
            print(f"报告已写入 {args.out}", file=sys.stderr)
        print(out)
        if report.get("scenario_matrix", {}).get("passed") != report.get("scenario_matrix", {}).get("total"):
            sys.exit(1)
        if (
            args.coverage_threshold is not None
            and not report.get("interaction_coverage", {}).get("passed", False)
        ):
            sys.exit(1)
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
