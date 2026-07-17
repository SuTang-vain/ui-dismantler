#!/usr/bin/env python3
"""
roundtrip.py — 往返等价度测试

回答核心问题：用工具把 HTML 拆成组件库后，再用原数据填回去，和原 HTML 有多像？

流程：
  原 HTML ──analyze──▶ manifest ──generate──▶ 组件库 ──mount(原数据)──▶ 渲染后 DOM
  原 HTML ──解析──▶ 参照 DOM
  参照 DOM ⇄ 渲染后 DOM ──对比──▶ 等价度报告（结构 / 文本）

对比维度（阶段一只做结构 + 文本，样式/交互后续）：
  1. 结构等价：DOM 树拓扑（标签、层级、class 集合）相似度
  2. 文本等价：可见文本内容集合的重合度

用法:
  python3 roundtrip.py <原 HTML> [--skill-dir <skill目录>] [--out <报告路径>]
  python3 roundtrip.py <原 HTML> --lib <已生成组件库目录>  # 跳过 analyze/generate，直接对比

退出码: 0 表示可跑通（不论分数高低），2 表示流程出错。
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString

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
    return {"dom": tree, "texts": texts, "text_count": len(texts)}


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
def render_generated_dom(lib_dir: Path) -> dict:
    """用 jsdom 执行生成库 example.html 的 mount，返回渲染后 DOM。"""
    examples = list(lib_dir.glob("examples/*.html"))
    if not examples:
        return {"ok": False, "error": f"{lib_dir}/examples/ 下无 HTML"}
    example = examples[0]
    try:
        proc = subprocess.run(
            ["node", str(RENDERER), str(example)],
            capture_output=True, text=True, timeout=30, cwd=str(HERE),
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "jsdom 渲染超时（30s）"}
    if proc.returncode != 0:
        return {"ok": False, "error": f"node 退出码 {proc.returncode}: {proc.stderr[:200]}"}
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"渲染器输出非 JSON: {e}", "raw": proc.stdout[:200]}


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
    node_rate = stats["matched"] / stats["ref_nodes"] if stats["ref_nodes"] else 0.0
    cls_rate = stats["cls_matched"] / stats["ref_classes"] if stats["ref_classes"] else 1.0
    return {
        "node_match_rate": round(node_rate, 3),
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
    """文本对比：可见文本集合的重合度（精确匹配 + 包含匹配）。"""
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
    return {
        "text_match_rate": round(rate, 3),
        "exact_match": exact,
        "contain_match": contain,
        "ref_count": len(ref_set),
        "got_count": len(got_set),
        "missing": sorted(ref_set - got_set)[:10],  # 缺失的文本（最多列 10 条）
    }


# ============================================================
# 主流程
# ============================================================
def run_pipeline(html_path: Path, skill_dir: Path, work_dir: Path) -> Path:
    """跑 v1 全链路：analyze → generate，返回生成库目录。"""
    scripts = skill_dir / "scripts"
    mf = work_dir / "manifest.json"
    lib_dir = work_dir / "lib"
    # analyze
    p = subprocess.run(
        [sys.executable, str(scripts / "analyze_html.py"), str(html_path),
         "--out", str(mf), "--vertical", "test"],
        capture_output=True, text=True,
    )
    if p.returncode != 0:
        raise RuntimeError(f"analyze 失败: {p.stderr[:300]}")
    # generate
    lib_name = html_path.stem.replace("original", "case") or "case"
    p = subprocess.run(
        [sys.executable, str(scripts / "generate_lib.py"), str(mf),
         "--out", str(lib_dir), "--name", lib_name],
        capture_output=True, text=True,
    )
    if p.returncode != 0:
        raise RuntimeError(f"generate 失败: {p.stderr[:300]}")
    return lib_dir


def main():
    ap = argparse.ArgumentParser(description="往返等价度测试：原 HTML ⇄ 组件库渲染后 DOM")
    ap.add_argument("html", help="原 HTML 文件路径")
    ap.add_argument("--skill-dir", default=str(SKILL_DIR_DEFAULT), help="skill 目录（默认 src/skill）")
    ap.add_argument("--lib", help="已生成组件库目录（提供则跳过 analyze/generate）")
    ap.add_argument("--out", help="报告输出路径（默认 stdout）")
    args = ap.parse_args()

    html_path = Path(args.html).resolve()
    if not html_path.is_file():
        print(f"ERROR: 文件不存在: {html_path}", file=sys.stderr)
        sys.exit(2)

    skill_dir = Path(args.skill_dir).resolve()
    if not RENDERER.exists():
        print(f"ERROR: 渲染器不存在: {RENDERER}", file=sys.stderr)
        sys.exit(2)

    try:
        # 1. 参照 DOM
        print(f"[1/3] 解析原 HTML → 参照 DOM ...", file=sys.stderr)
        ref = extract_reference_dom(html_path)
        print(f"      参照节点数 {ref['text_count']} 文本", file=sys.stderr)

        # 2. 生成库（或用已有）
        if args.lib:
            lib_dir = Path(args.lib).resolve()
            print(f"[2/3] 使用已有组件库: {lib_dir}", file=sys.stderr)
        else:
            with tempfile.TemporaryDirectory() as td:
                work_dir = Path(td)
                print(f"[2/3] 跑 analyze + generate ...", file=sys.stderr)
                lib_dir = run_pipeline(html_path, skill_dir, work_dir)
                # 复制到持久目录供渲染
                persist = Path(tempfile.mkdtemp()) / "lib"
                import shutil
                shutil.copytree(lib_dir, persist)
                lib_dir = persist

        # 3. 渲染 + 对比
        print(f"[3/3] jsdom 渲染 + 对比 ...", file=sys.stderr)
        got = render_generated_dom(lib_dir)
        struct = compare_structure(ref, got)
        texts = compare_texts(ref, got)

        # 综合评分
        struct_score = (struct.get("node_match_rate", 0) + struct.get("class_match_rate", 0)) / 2
        report = {
            "case": html_path.name,
            "render_ok": got.get("ok", False),
            "render_error": got.get("error"),
            "structure": struct,
            "text": texts,
            "scores": {
                "structure": round(struct_score, 3),
                "text": texts.get("text_match_rate", 0),
                # 综合分（结构*0.5 + 文本*0.5）
                "overall": round((struct_score * 0.5 + texts.get("text_match_rate", 0) * 0.5), 3),
            },
        }
        out = json.dumps(report, ensure_ascii=False, indent=2)
        if args.out:
            Path(args.out).write_text(out, encoding="utf-8")
            print(f"报告已写入 {args.out}", file=sys.stderr)
        print(out)
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
