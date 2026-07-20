"""CLI for batch verification: ``python3 -m ui_dismantler.cli.verify_all``.

参数解析 + 调度 ``ui_dismantler.evaluation.batch`` 的批量验证函数。
支持并行（--workers）、缓存（默认开启）、增量（--changed）三项性能优化。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

from ui_dismantler.evaluation.batch import (
    clear_cache,
    find_cases,
    html_hash,
    lib_hash,
    get_cached_hash,
    run_cases_parallel,
    run_roundtrip,
    select_cases,
)
from ui_dismantler.paths import PROJECT_ROOT


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="批量验证：全案例 roundtrip 汇总（并行+缓存+增量）")
    ap.add_argument("--cases-dir", default=str(PROJECT_ROOT),
                    help="案例目录（默认项目根，扫描 <dir>/<name>/original.html）")
    ap.add_argument("--lib-dir",
                    help="已生成组件库父目录（其下每个子目录名对应案例名）；必填，agent 产出库后验证")
    ap.add_argument("--threshold", type=float, default=0.85,
                    help="综合分门槛（默认 0.85）")
    ap.add_argument("--case", help="只验证指定案例（名称对应 cases-dir 下的目录名）")
    ap.add_argument(
        "--reference-mode",
        choices=("auto", "rendered", "static"),
        default="rendered",
        help="参照模式（批量回归默认严格 rendered，不允许静默回退）",
    )
    ap.add_argument("--width", type=int, default=1024, help="jsdom 视口宽度")
    ap.add_argument("--height", type=int, default=768, help="jsdom 视口高度")
    ap.add_argument("--scenarios", help="交互场景 JSON（单案例验证使用）")
    ap.add_argument("--state-threshold", type=float, default=0.85,
                    help="交互状态综合分门槛（默认 0.85）")
    ap.add_argument("--manifest", help="analyze manifest（单案例验证使用）")
    ap.add_argument("--coverage-threshold", type=float,
                    help="交互覆盖率门槛（需要 --manifest 与 --scenarios）")
    ap.add_argument("--out", help="报告输出路径（默认 stdout 摘要）")
    # 性能优化参数（从 experimental 迁移）
    ap.add_argument("--workers", type=int, default=os.cpu_count() or 4,
                    help="并行度（默认 CPU 核数=%d）" % (os.cpu_count() or 4))
    ap.add_argument("--changed", action="store_true",
                    help="增量模式：只测 HTML 或组件库 hash 变化的案例（含场景矩阵的案例总是实跑）")
    ap.add_argument("--no-cache", action="store_true",
                    help="禁用缓存（总是实跑）")
    ap.add_argument("--clear-cache", action="store_true",
                    help="清除缓存后退出（不跑测试）")
    args = ap.parse_args(argv)

    # --clear-cache: 清缓存后退出
    if args.clear_cache:
        count = clear_cache()
        print(f"已清除缓存（{count} 个文件）" if count else "缓存为空")
        return 0

    cases_dir = Path(args.cases_dir).resolve()
    cases = find_cases(cases_dir)
    if not cases:
        print(f"ERROR: {cases_dir} 下未找到 */original.html", file=sys.stderr)
        return 2

    if not args.lib_dir:
        print("ERROR: 必须提供 --lib-dir <组件库目录>。", file=sys.stderr)
        print("       agent 驱动模式下组件库由 agent 产出，不再自动跑 analyze+generate。", file=sys.stderr)
        return 2

    lib_root = Path(args.lib_dir).resolve()
    if not lib_root.is_dir():
        print(f"ERROR: 组件库目录不存在: {lib_root}", file=sys.stderr)
        return 2
    if args.width <= 0 or args.height <= 0:
        print("ERROR: --width/--height 必须为正整数", file=sys.stderr)
        return 2
    if not 0 <= args.state_threshold <= 1:
        print("ERROR: --state-threshold 必须位于 0..1", file=sys.stderr)
        return 2
    if args.coverage_threshold is not None and not 0 <= args.coverage_threshold <= 1:
        print("ERROR: --coverage-threshold 必须位于 0..1", file=sys.stderr)
        return 2
    scenario_file = Path(args.scenarios).resolve() if args.scenarios else None
    if scenario_file and not scenario_file.is_file():
        print(f"ERROR: 场景文件不存在: {scenario_file}", file=sys.stderr)
        return 2
    manifest_file = Path(args.manifest).resolve() if args.manifest else None
    if manifest_file and not manifest_file.is_file():
        print(f"ERROR: manifest 文件不存在: {manifest_file}", file=sys.stderr)
        return 2
    if args.coverage_threshold is not None and (not manifest_file or not scenario_file):
        print("ERROR: --coverage-threshold 需要同时提供 --manifest 与 --scenarios", file=sys.stderr)
        return 2
    # 单库模式：lib_root 本身是组件库（有 src/），只对能匹配的案例跑
    single_lib_mode = (lib_root / "src").is_dir()
    try:
        cases = select_cases(cases, lib_root, single_lib_mode, args.case)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    if scenario_file and len(cases) != 1:
        print("ERROR: --scenarios 只能与单案例验证配合使用，请加 --case", file=sys.stderr)
        return 2

    # 准备 (name, html, lib_dir) 三元组列表
    case_tuples: list[tuple[str, Path, Path]] = []
    skipped_incremental = 0
    for name, html in cases:
        if single_lib_mode:
            lib_dir = lib_root
        else:
            candidate = lib_root / name
            if not candidate.is_dir():
                continue
            lib_dir = candidate
        # 增量模式：跳过 hash 未变的案例（仅当无交互场景时）
        if args.changed and scenario_file is None:
            cache_key = f"{name}_{html_hash(html)}_{lib_hash(lib_dir)}"
            if get_cached_hash(cache_key):
                skipped_incremental += 1
                continue
        case_tuples.append((name, html, lib_dir))

    if skipped_incremental > 0:
        print(
            f"增量模式：跳过 {skipped_incremental} 个未变更案例，实跑 {len(case_tuples)} 个",
            file=sys.stderr,
        )

    if not case_tuples:
        if skipped_incremental > 0:
            print("所有案例均未变更，全部命中缓存", file=sys.stderr)
            return 0
        print("ERROR: 没有找到与组件库对应的案例", file=sys.stderr)
        return 2

    use_cache = not args.no_cache
    print(
        f"批量验证：实跑 {len(case_tuples)} 个案例，门槛 {args.threshold}，"
        f"参照 {args.reference_mode}，视口 {args.width}x{args.height}，"
        f"并行 {args.workers}，缓存 {'on' if use_cache else 'off'}\n",
        file=sys.stderr,
    )

    results = run_cases_parallel(
        case_tuples,
        args.threshold,
        args.reference_mode,
        args.width,
        args.height,
        scenario_file,
        args.state_threshold,
        manifest_file,
        args.coverage_threshold,
        workers=args.workers,
        use_cache=use_cache,
    )

    # 汇总
    total = len(results) + skipped_incremental
    ok_count = sum(1 for r in results if r.get("ok"))
    pass_count = sum(1 for r in results if r.get("passed"))
    cached_count = sum(1 for r in results if r.get("cached"))
    # 增量跳过的案例视为通过
    pass_count += skipped_incremental
    ok_count += skipped_incremental
    overalls = [r["scores"]["overall"] for r in results if r.get("ok") and "scores" in r]
    avg = sum(overalls) / len(overalls) if overalls else 0.0

    print(file=sys.stderr)
    print("=" * 64, file=sys.stderr)
    print(f"{'案例':<20s} {'结构':>7s} {'文本':>7s} {'综合':>7s} {'状态':>5s} {'缓存':>4s}", file=sys.stderr)
    print("-" * 64, file=sys.stderr)
    for r in results:
        if r.get("ok"):
            s = r["scores"]
            mark = "PASS" if r["passed"] else "FAIL"
            cached_mark = "hit" if r.get("cached") else ""
            print(
                f"{r['case']:<20s} {s.get('structure',0):>7} {s.get('text',0):>7} "
                f"{s.get('overall',0):>7} {mark:>5s} {cached_mark:>4s}",
                file=sys.stderr,
            )
        else:
            print(f"{r['case']:<20s} {'-':>7s} {'-':>7s} {'-':>7s} {'ERR':>5s} {'':>4s}", file=sys.stderr)
    print("-" * 64, file=sys.stderr)
    cache_note = f"，缓存命中 {cached_count}" if cached_count else ""
    incr_note = f"，增量跳过 {skipped_incremental}" if skipped_incremental else ""
    print(
        f"平均综合分: {avg:.3f}  通过: {pass_count}/{total}  (门槛 {args.threshold}"
        f"{cache_note}{incr_note})",
        file=sys.stderr,
    )

    report = {
        "threshold": args.threshold,
        "referenceMode": args.reference_mode,
        "stateThreshold": args.state_threshold,
        "viewport": {"width": args.width, "height": args.height},
        "workers": args.workers,
        "useCache": use_cache,
        "incrementalSkipped": skipped_incremental,
        "total": total,
        "rendered": ok_count,
        "passed": pass_count,
        "cachedHits": cached_count,
        "avgOverall": round(avg, 3),
        "cases": results,
    }
    out = json.dumps(report, ensure_ascii=False, indent=2)
    if args.out:
        Path(args.out).write_text(out, encoding="utf-8")
        print(f"报告已写入 {args.out}", file=sys.stderr)
    print(out)

    return 0 if pass_count == total and ok_count == total else 1


if __name__ == "__main__":
    sys.exit(main())
