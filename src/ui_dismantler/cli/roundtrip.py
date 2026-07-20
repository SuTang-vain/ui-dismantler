"""CLI for roundtrip equivalence test: ``python3 -m ui_dismantler.cli.roundtrip``.

参数解析 + 文件 IO + 调用 ``ui_dismantler.evaluation.roundtrip`` 的对比器。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from ui_dismantler.evaluation.roundtrip import (
    RENDERER,
    SKILL_DIR_DEFAULT,
    compute_interaction_coverage,
    evaluate_scenario_matrix,
    load_manifest_interactions,
    load_scenario_matrix,
    render_generated_dom,
    resolve_reference_dom,
    score_comparison,
)


def main(argv: list[str] | None = None) -> int:
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
    args = ap.parse_args(argv)

    html_path = Path(args.html).resolve()
    if not html_path.is_file():
        print(f"ERROR: 文件不存在: {html_path}", file=sys.stderr)
        return 2

    if not args.lib:
        print("ERROR: 必须提供 --lib <组件库目录>。", file=sys.stderr)
        print("       agent 驱动模式下组件库由 agent 产出，不再自动跑 analyze+generate。", file=sys.stderr)
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
    if args.coverage_threshold is not None and (not args.manifest or not args.scenarios):
        print("ERROR: --coverage-threshold 需要同时提供 --manifest 与 --scenarios", file=sys.stderr)
        return 2
    if args.scenarios and args.reference_mode == "static":
        print("ERROR: 交互场景不能与 --reference-mode static 同时使用", file=sys.stderr)
        return 2

    scenario_file = Path(args.scenarios).resolve() if args.scenarios else None
    try:
        scenarios = load_scenario_matrix(scenario_file) if scenario_file else []
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    manifest_file = Path(args.manifest).resolve() if args.manifest else None
    try:
        manifest_interactions = load_manifest_interactions(manifest_file) if manifest_file else []
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    if not RENDERER.exists():
        print(f"ERROR: 渲染器不存在: {RENDERER}", file=sys.stderr)
        return 2

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
            return 2
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
                manifest_interactions,
                scenarios,
                scenario_matrix=report.get("scenario_matrix"),
            )
            if args.coverage_threshold is not None:
                report["interaction_coverage"]["threshold"] = args.coverage_threshold
                report["interaction_coverage"]["gateMetric"] = "verifiedCoverage.rate"
                report["interaction_coverage"]["passed"] = (
                    report["interaction_coverage"]["verifiedCoverage"]["rate"]
                    >= args.coverage_threshold
                )
        out = json.dumps(report, ensure_ascii=False, indent=2)
        if args.out:
            Path(args.out).write_text(out, encoding="utf-8")
            print(f"报告已写入 {args.out}", file=sys.stderr)
        print(out)
        if report.get("scenario_matrix", {}).get("passed") != report.get("scenario_matrix", {}).get("total"):
            return 1
        if (
            args.coverage_threshold is not None
            and not report.get("interaction_coverage", {}).get("passed", False)
        ):
            return 1
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
