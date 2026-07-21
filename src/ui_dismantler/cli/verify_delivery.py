"""CLI for the one-command Gold delivery gate."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from ui_dismantler.evaluation.delivery import verify_delivery


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="组件库 Gold 交付门禁（含耗时报告）")
    ap.add_argument("html", help="原始 HTML")
    ap.add_argument("--lib", required=True, help="组件库目录")
    ap.add_argument("--example", required=True, help="主案例 HTML（相对 lib 或绝对路径）")
    ap.add_argument("--scenarios", help="交互场景 JSON")
    ap.add_argument("--manifest", help="analyze manifest")
    ap.add_argument("--overall-threshold", type=float, default=0.98)
    ap.add_argument("--state-threshold", type=float, default=0.85)
    ap.add_argument("--coverage-threshold", type=float)
    ap.add_argument(
        "--class-coverage-threshold",
        type=float,
        help="运行态 DOM class 在已加载 CSS 中的覆盖率门槛（推荐 Gold 使用 0.98）",
    )
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--height", type=int, default=768)
    ap.add_argument("--no-generate-showcase", action="store_true")
    ap.add_argument("--baseline-report", help="上一次 delivery-report.json，用于质量/耗时防回退")
    ap.add_argument("--max-score-drop", type=float, default=0.0, help="允许的单项最大分数下降（默认 0）")
    ap.add_argument("--max-time-ratio", type=float, default=1.5, help="相对基线最大耗时倍率（默认 1.5）")
    ap.add_argument("--out", help="JSON 报告路径")
    args = ap.parse_args(argv)

    html = Path(args.html).resolve()
    lib = Path(args.lib).resolve()
    if not html.is_file() or not lib.is_dir():
        print("ERROR: html 或 lib 不存在", file=sys.stderr)
        return 2
    scenarios = Path(args.scenarios).resolve() if args.scenarios else None
    manifest = Path(args.manifest).resolve() if args.manifest else None
    if scenarios and not scenarios.is_file():
        print(f"ERROR: scenarios 不存在: {scenarios}", file=sys.stderr)
        return 2
    if manifest and not manifest.is_file():
        print(f"ERROR: manifest 不存在: {manifest}", file=sys.stderr)
        return 2
    try:
        report = verify_delivery(
            html,
            lib,
            Path(args.example),
            scenarios_path=scenarios,
            manifest_path=manifest,
            overall_threshold=args.overall_threshold,
            state_threshold=args.state_threshold,
            coverage_threshold=args.coverage_threshold,
            class_coverage_threshold=args.class_coverage_threshold,
            width=args.width,
            height=args.height,
            generate_showcase_artifact=not args.no_generate_showcase,
            baseline_report=Path(args.baseline_report).resolve() if args.baseline_report else None,
            max_score_drop=args.max_score_drop,
            max_time_ratio=args.max_time_ratio,
        )
    except (ValueError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    output = json.dumps(report, ensure_ascii=False, indent=2)
    if args.out:
        Path(args.out).write_text(output, encoding="utf-8")
        print(f"交付报告已写入: {args.out}", file=sys.stderr)
    print(output)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
