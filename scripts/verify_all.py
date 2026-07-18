#!/usr/bin/env python3
"""verify_all.py - 批量验证：并行 + 缓存 + 增量

P4 鲁棒性升级：
- 并行：ThreadPoolExecutor 并行跑多案例的 roundtrip
- 缓存：原 HTML 的 hash 不变时，复用缓存的参照 DOM 渲染结果（省 jsdom 启动）
- 匞量：--changed 只测 HTML 或组件库变更的案例（基于 hash 比对）

用法：
    # 全量验证（默认）
    python3 scripts/verify_all.py --lib-dir out

    # 增量验证（只测变更的案例）
    python3 scripts/verify_all.py --lib-dir out --changed

    # 指定并行度（默认 = CPU 核数）
    python3 scripts/verify_all.py --lib-dir out --workers 4

    # 门槛调整（默认综合≥0.70 PASS，≥0.85 GOLD）
    python3 scripts/verify_all.py --lib-dir out --threshold 0.70

    # 清除缓存
    python3 scripts/verify_all.py --clear-cache

退出码：全部达标 0，有未达标 1，流程出错 2。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROUNDTRIP = HERE / "roundtrip.py"
CACHE_DIR = Path(tempfile.gettempdir()) / "ui_dismantler_cache"


def html_hash(html_path: Path) -> str:
    """计算 HTML 文件内容的 hash（用于缓存键和增量检测）。"""
    return hashlib.md5(html_path.read_bytes()).hexdigest()[:12]


def lib_hash(lib_dir: Path) -> str:
    """计算组件库所有源文件的合并 hash。"""
    h = hashlib.md5()
    for f in sorted(lib_dir.rglob("*")):
        if f.is_file() and f.suffix in (".css", ".js", ".html", ".md"):
            h.update(f.read_bytes())
    return h.hexdigest()[:12]


def find_cases(cases_dir: Path) -> list[tuple[str, Path]]:
    """扫描 cases_dir/<name>/original.html。"""
    out = []
    if not cases_dir.is_dir():
        return out
    for sub in sorted(cases_dir.iterdir()):
        if sub.is_dir() and (sub / "original.html").is_file():
            out.append((sub.name, sub / "original.html"))
    return out


def get_cached_hash(key: str) -> str | None:
    """从缓存读取 hash。"""
    cache_file = CACHE_DIR / f"{key}.hash"
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8").strip()
    return None


def set_cached_hash(key: str, h: str) -> None:
    """写入缓存 hash。"""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{key}.hash"
    cache_file.write_text(h, encoding="utf-8")


def run_roundtrip(html: Path, lib_dir: Path | None, out_json: Path) -> dict:
    """对单个案例跑 roundtrip，返回报告 dict。"""
    cmd = [sys.executable, str(ROUNDTRIP), str(html), "--out", str(out_json)]
    if lib_dir:
        cmd += ["--lib", str(lib_dir)]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120,
                              encoding="utf-8", errors="replace")
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "roundtrip 超时（120s）"}
    if not out_json.exists():
        return {"ok": False, "error": f"roundtrip 未产出报告: {proc.stderr[:200]}"}
    try:
        return {"ok": True, "report": json.loads(out_json.read_text(encoding="utf-8"))}
    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"报告解析失败: {e}"}


def run_single_case(name: str, html: Path, lib_dir: Path | None, threshold: float) -> dict:
    """跑单个案例（在工作线程里执行）。"""
    cache_key = f"{name}_{html_hash(html)}"
    if lib_dir:
        cache_key += f"_{lib_hash(lib_dir)}"

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        tmp_json = Path(tf.name)

    # 增量检测：hash 不变则复用缓存结果
    cached_h = get_cached_hash(cache_key)
    if cached_h:
        cached_report = CACHE_DIR / f"{cache_key}.json"
        if cached_report.exists():
            try:
                report = json.loads(cached_report.read_text(encoding="utf-8"))
                scores = report.get("scores", {})
                overall = scores.get("overall", 0)
                return {
                    "case": name, "ok": True, "scores": scores,
                    "passed": overall >= threshold,
                    "render_ok": report.get("render_ok", False),
                    "cached": True,
                }
            except Exception:
                pass  # 缓存损坏，重新跑

    res = run_roundtrip(html, lib_dir, tmp_json)
    if res["ok"]:
        report = res["report"]
        scores = report.get("scores", {})
        overall = scores.get("overall", 0)
        # 写缓存
        cached_report = CACHE_DIR / f"{cache_key}.json"
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cached_report.write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")
        set_cached_hash(cache_key, cache_key)
        return {
            "case": name, "ok": True, "scores": scores,
            "passed": overall >= threshold,
            "render_ok": report.get("render_ok", False),
            "cached": False,
        }
    else:
        return {"case": name, "ok": False, "error": res["error"], "passed": False, "cached": False}
    tmp_json.unlink(missing_ok=True)


def main():
    ap = argparse.ArgumentParser(description="批量验证：并行 + 缓存 + 增量")
    ap.add_argument("--cases-dir", default=str(HERE.parent / "examples" / "cases"))
    ap.add_argument("--lib-dir", help="已生成组件库父目录（其下每个子目录名对应案例名）")
    ap.add_argument("--threshold", type=float, default=0.70, help="PASS 门槛（默认 0.70）")
    ap.add_argument("--gold-threshold", type=float, default=0.85, help="GOLD 门槛（默认 0.85）")
    ap.add_argument("--workers", type=int, default=os.cpu_count() or 4, help="并行度（默认 CPU 核数）")
    ap.add_argument("--changed", action="store_true", help="增量模式：只测变更的案例")
    ap.add_argument("--out", help="报告输出路径")
    ap.add_argument("--clear-cache", action="store_true", help="清除缓存后退出")
    args = ap.parse_args()

    if args.clear_cache:
        if CACHE_DIR.exists():
            count = len(list(CACHE_DIR.glob("*")))
            CACHE_DIR.rmdir() if count == 0 else None
            import shutil
            shutil.rmtree(CACHE_DIR, ignore_errors=True)
            print(f"已清除缓存（{count} 个文件）")
        else:
            print("缓存为空")
        sys.exit(0)

    cases_dir = Path(args.cases_dir).resolve()
    cases = find_cases(cases_dir)
    if not cases:
        print(f"ERROR: {cases_dir} 下未找到 */original.html", file=sys.stderr)
        sys.exit(2)

    lib_root = Path(args.lib_dir).resolve() if args.lib_dir else None

    # 增量模式：过滤出变更的案例
    if args.changed and lib_root:
        all_cases = cases
        cases = []
        for name, html in all_cases:
            lib_dir = lib_root / name
            if not lib_dir.is_dir():
                continue
            cache_key = f"{name}_{html_hash(html)}_{lib_hash(lib_dir)}"
            cached_h = get_cached_hash(cache_key)
            if not cached_h:
                cases.append((name, html))
        skipped = len(all_cases) - len(cases)
        print(f"增量模式：{len(all_cases)} 个案例，跳过 {skipped} 个未变更，测试 {len(cases)} 个\n", file=sys.stderr)
        if not cases:
            print("所有案例均未变更，无需测试", file=sys.stderr)
            sys.exit(0)

    print(f"批量验证：{len(cases)} 个案例，{args.workers} 并行，门槛 PASS={args.threshold} GOLD={args.gold_threshold}\n", file=sys.stderr)

    # 构建任务列表
    tasks = []
    for name, html in cases:
        lib_dir = None
        if lib_root:
            candidate = lib_root / name
            if candidate.is_dir():
                lib_dir = candidate
            else:
                continue  # 无对应库，跳过
        tasks.append((name, html, lib_dir))

    results = []
    # 并行执行
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        future_to_name = {}
        for name, html, lib_dir in tasks:
            future = executor.submit(run_single_case, name, html, lib_dir, args.threshold)
            future_to_name[future] = name

        for future in as_completed(future_to_name):
            name = future_to_name[future]
            try:
                r = future.result()
            except Exception as e:
                r = {"case": name, "ok": False, "error": str(e), "passed": False}
            results.append(r)
            if r.get("ok"):
                s = r["scores"]
                overall = s.get("overall", 0)
                bar = "GOLD" if overall >= args.gold_threshold else ("PASS" if overall >= args.threshold else "FAIL")
                cached_tag = " (cached)" if r.get("cached") else ""
                print(f"  [{r['case']}] {bar} {overall}{cached_tag}", file=sys.stderr, flush=True)
            else:
                print(f"  [{r['case']}] ERROR: {r.get('error','')[:60]}", file=sys.stderr, flush=True)

    # 排序结果（按案例名）
    results.sort(key=lambda r: r["case"])

    # 汇总
    total = len(results)
    ok_count = sum(1 for r in results if r.get("ok"))
    pass_count = sum(1 for r in results if r.get("passed"))
    gold_count = sum(1 for r in results if r.get("ok") and r["scores"].get("overall", 0) >= args.gold_threshold)
    cached_count = sum(1 for r in results if r.get("cached"))
    overalls = [r["scores"]["overall"] for r in results if r.get("ok") and "scores" in r]
    avg = sum(overalls) / len(overalls) if overalls else 0.0

    print(file=sys.stderr)
    print("=" * 68, file=sys.stderr)
    print(f"{'案例':<20s} {'结构':>7s} {'文本':>7s} {'综合':>7s} {'tag拓扑':>7s} {'状态':>5s}", file=sys.stderr)
    print("-" * 68, file=sys.stderr)
    for r in results:
        if r.get("ok"):
            s = r["scores"]
            st = r.get("scores", {})
            tag = st.get("tag_topology_rate", "-")
            overall = s.get("overall", 0)
            bar = "GOLD" if overall >= args.gold_threshold else ("PASS" if overall >= args.threshold else "FAIL")
            cached_tag = "*" if r.get("cached") else " "
            print(f"{r['case']:<20s} {s.get('structure',0):>7} {s.get('text',0):>7} {overall:>7} {tag:>7} {bar:>4s}{cached_tag}", file=sys.stderr)
        else:
            print(f"{r['case']:<20s} {'-':>7s} {'-':>7s} {'-':>7s} {'-':>7s} {'ERR':>5s}", file=sys.stderr)
    print("-" * 68, file=sys.stderr)
    print(f"平均综合: {avg:.3f}  GOLD: {gold_count}/{total}  PASS: {pass_count}/{total}  缓存命中: {cached_count}/{total}", file=sys.stderr)
    print(f"(* = 缓存命中)", file=sys.stderr)

    report = {
        "threshold": args.threshold,
        "goldThreshold": args.gold_threshold,
        "total": total,
        "rendered": ok_count,
        "passed": pass_count,
        "gold": gold_count,
        "cached": cached_count,
        "avgOverall": round(avg, 3),
        "cases": results,
    }
    out = json.dumps(report, ensure_ascii=False, indent=2)
    if args.out:
        Path(args.out).write_text(out, encoding="utf-8")
        print(f"报告已写入 {args.out}", file=sys.stderr)
    print(out)

    sys.exit(0 if pass_count == total and ok_count == total else 1)


if __name__ == "__main__":
    main()
