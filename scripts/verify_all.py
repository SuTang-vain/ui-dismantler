#!/usr/bin/env python3
"""verify_all.py - 批量验证：对目录下所有案例 HTML 跑 roundtrip，汇总通过率与平均分。

用途：改 skill / 工具层后跑全量回归，确认没退化。
用 --lib-dir 指定"案例名 -> 已生成组件库目录"的映射，验证 agent 产出。

用法：
    # 验证已生成的库（每个案例名对应一个 lib 目录）
    python3 scripts/verify_all.py --lib-dir /tmp/libs

    # 单库模式：lib-dir 本身是组件库（含 src/），只对首个匹配案例验证
    python3 scripts/verify_all.py --lib-dir examples/cases/blackpink-v10/lib

    # 单案例交互状态矩阵
    python3 scripts/verify_all.py --case blackpink-v10 --lib-dir examples/cases/blackpink-v10/lib \
      --scenarios scenarios.json

    # 指定案例目录
    python3 scripts/verify_all.py --cases-dir path/to/cases --lib-dir /tmp/libs

    # 门槛调整（默认综合≥0.85）
    python3 scripts/verify_all.py --lib-dir /tmp/libs --threshold 0.80

    # 报告输出到文件
    python3 scripts/verify_all.py --out report.json

退出码：初始分与全部交互状态均达标 0，有未达标 1，流程出错 2。
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROUNDTRIP = HERE / "roundtrip.py"


def find_cases(cases_dir: Path) -> list[tuple[str, Path]]:
    """扫描 cases_dir/<name>/original.html，返回 [(name, html_path), ...]。"""
    out: list[tuple[str, Path]] = []
    if not cases_dir.is_dir():
        return out
    for sub in sorted(cases_dir.iterdir()):
        if not sub.is_dir():
            continue
        html = sub / "original.html"
        if html.is_file():
            out.append((sub.name, html))
    return out


def select_cases(
    cases: list[tuple[str, Path]],
    lib_root: Path,
    single_lib_mode: bool,
    requested_case: str | None = None,
) -> list[tuple[str, Path]]:
    """选择待验证案例；单库模式必须与库目录名明确对应。"""
    if requested_case:
        selected = [item for item in cases if item[0] == requested_case]
        if not selected:
            raise ValueError(f"未找到案例: {requested_case}")
        return selected
    if not single_lib_mode:
        return cases

    aliases = {lib_root.name, lib_root.parent.name}
    selected = [item for item in cases if item[0] in aliases]
    if len(selected) == 1:
        return selected
    if len(cases) == 1:
        return cases
    raise ValueError(
        "单库模式无法从目录名确定对应案例；请用 --case <案例名> 明确指定"
    )


def build_roundtrip_command(
    html: Path,
    lib_dir: Path,
    out_json: Path,
    reference_mode: str,
    width: int,
    height: int,
    scenarios: Path | None = None,
    state_threshold: float = 0.85,
    manifest: Path | None = None,
    coverage_threshold: float | None = None,
) -> list[str]:
    command = [
        sys.executable,
        str(ROUNDTRIP),
        str(html),
        "--lib", str(lib_dir),
        "--out", str(out_json),
        "--reference-mode", reference_mode,
        "--width", str(width),
        "--height", str(height),
    ]
    if scenarios:
        command += [
            "--scenarios", str(scenarios),
            "--state-threshold", str(state_threshold),
        ]
    if manifest:
        command += ["--manifest", str(manifest)]
    if coverage_threshold is not None:
        command += ["--coverage-threshold", str(coverage_threshold)]
    return command


def run_roundtrip(
    html: Path,
    lib_dir: Path,
    out_json: Path,
    reference_mode: str,
    width: int,
    height: int,
    scenarios: Path | None = None,
    state_threshold: float = 0.85,
    manifest: Path | None = None,
    coverage_threshold: float | None = None,
) -> dict:
    """对单个案例跑 roundtrip，返回报告 dict。"""
    cmd = build_roundtrip_command(
        html, lib_dir, out_json, reference_mode, width, height,
        scenarios, state_threshold,
        manifest, coverage_threshold,
    )
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "roundtrip 超时（120s）"}
    if not out_json.exists():
        return {"ok": False, "error": f"roundtrip 未产出报告: {proc.stderr[:200]}"}
    try:
        report = json.loads(out_json.read_text(encoding="utf-8"))
        if proc.returncode not in (0, 1):
            return {"ok": False, "error": f"roundtrip 退出码 {proc.returncode}: {proc.stderr[:200]}"}
        return {"ok": True, "report": report, "exit_code": proc.returncode}
    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"报告解析失败: {e}"}


def main():
    ap = argparse.ArgumentParser(description="批量验证：全案例 roundtrip 汇总")
    ap.add_argument("--cases-dir", default=str(HERE.parent / "examples" / "cases"),
                    help="案例目录（默认 examples/cases）")
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
    args = ap.parse_args()

    cases_dir = Path(args.cases_dir).resolve()
    cases = find_cases(cases_dir)
    if not cases:
        print(f"ERROR: {cases_dir} 下未找到 */original.html", file=sys.stderr)
        sys.exit(2)

    if not args.lib_dir:
        print("ERROR: 必须提供 --lib-dir <组件库目录>。", file=sys.stderr)
        print("       agent 驱动模式下组件库由 agent 产出，不再自动跑 analyze+generate。", file=sys.stderr)
        sys.exit(2)

    lib_root = Path(args.lib_dir).resolve()
    if not lib_root.is_dir():
        print(f"ERROR: 组件库目录不存在: {lib_root}", file=sys.stderr)
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
    scenario_file = Path(args.scenarios).resolve() if args.scenarios else None
    if scenario_file and not scenario_file.is_file():
        print(f"ERROR: 场景文件不存在: {scenario_file}", file=sys.stderr)
        sys.exit(2)
    manifest_file = Path(args.manifest).resolve() if args.manifest else None
    if manifest_file and not manifest_file.is_file():
        print(f"ERROR: manifest 文件不存在: {manifest_file}", file=sys.stderr)
        sys.exit(2)
    if args.coverage_threshold is not None and (not manifest_file or not scenario_file):
        print("ERROR: --coverage-threshold 需要同时提供 --manifest 与 --scenarios", file=sys.stderr)
        sys.exit(2)
    # 单库模式：lib_root 本身是组件库（有 src/），只对能匹配的案例跑
    single_lib_mode = (lib_root / "src").is_dir()
    try:
        cases = select_cases(cases, lib_root, single_lib_mode, args.case)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(2)
    if scenario_file and len(cases) != 1:
        print("ERROR: --scenarios 只能与单案例验证配合使用，请加 --case", file=sys.stderr)
        sys.exit(2)
    print(
        f"批量验证：{len(cases)} 个案例，门槛 {args.threshold}，"
        f"参照 {args.reference_mode}，视口 {args.width}x{args.height}\n",
        file=sys.stderr,
    )

    results: list[dict] = []
    import tempfile
    for name, html in cases:
        lib_dir = None
        if lib_root:
            if single_lib_mode:
                lib_dir = lib_root
            else:
                # 多库：lib_dir/<案例名>
                candidate = lib_root / name
                if candidate.is_dir():
                    lib_dir = candidate
                else:
                    continue  # 无对应库，跳过
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
            tmp_json = Path(tf.name)
        print(f"  [{name}] roundtrip ...", file=sys.stderr, end=" ", flush=True)
        res = run_roundtrip(
            html,
            lib_dir,
            tmp_json,
            args.reference_mode,
            args.width,
            args.height,
            scenario_file,
            args.state_threshold,
            manifest_file,
            args.coverage_threshold,
        )
        if res["ok"]:
            scores = res["report"].get("scores", {})
            reference = res["report"].get("reference", {})
            scenario_matrix = res["report"].get("scenario_matrix")
            interaction_coverage = res["report"].get("interaction_coverage")
            overall = scores.get("overall", 0)
            states_passed = (
                scenario_matrix is None
                or scenario_matrix.get("passed") == scenario_matrix.get("total")
            )
            coverage_passed = (
                interaction_coverage is None
                or args.coverage_threshold is None
                or interaction_coverage.get("passed", False)
            )
            passed = overall >= args.threshold and states_passed and coverage_passed
            results.append({
                "case": name,
                "ok": True,
                "scores": scores,
                "passed": passed,
                "render_ok": res["report"].get("render_ok", False),
                "reference": reference,
                "scenario_matrix": scenario_matrix,
                "interaction_coverage": interaction_coverage,
            })
            mark = "✓" if passed else "✗"
            print(f"{mark} 综合 {overall}", file=sys.stderr)
        else:
            results.append({"case": name, "ok": False, "error": res["error"], "passed": False})
            print(f"✗ ERROR: {res['error'][:80]}", file=sys.stderr)
        tmp_json.unlink(missing_ok=True)

    if not results:
        print("ERROR: 没有找到与组件库对应的案例", file=sys.stderr)
        sys.exit(2)

    # 汇总
    total = len(results)
    ok_count = sum(1 for r in results if r.get("ok"))
    pass_count = sum(1 for r in results if r.get("passed"))
    overalls = [r["scores"]["overall"] for r in results if r.get("ok") and "scores" in r]
    avg = sum(overalls) / len(overalls) if overalls else 0.0

    print(file=sys.stderr)
    print("=" * 56, file=sys.stderr)
    print(f"{'案例':<20s} {'结构':>7s} {'文本':>7s} {'综合':>7s} {'状态':>5s}", file=sys.stderr)
    print("-" * 56, file=sys.stderr)
    for r in results:
        if r.get("ok"):
            s = r["scores"]
            mark = "PASS" if r["passed"] else "FAIL"
            print(f"{r['case']:<20s} {s.get('structure',0):>7} {s.get('text',0):>7} {s.get('overall',0):>7} {mark:>5s}", file=sys.stderr)
        else:
            print(f"{r['case']:<20s} {'-':>7s} {'-':>7s} {'-':>7s} {'ERR':>5s}", file=sys.stderr)
    print("-" * 56, file=sys.stderr)
    print(f"平均综合分: {avg:.3f}  通过: {pass_count}/{total}  (门槛 {args.threshold})", file=sys.stderr)

    report = {
        "threshold": args.threshold,
        "referenceMode": args.reference_mode,
        "stateThreshold": args.state_threshold,
        "viewport": {"width": args.width, "height": args.height},
        "total": total,
        "rendered": ok_count,
        "passed": pass_count,
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
