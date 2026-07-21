"""CLI for the cheap, deterministic page-scale routing pass."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from ui_dismantler.analysis.strategy import choose_analysis_strategy, inspect_html


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="HTML 页面规模 → 分析/拆解策略计划")
    ap.add_argument("html", help="HTML 文件路径")
    ap.add_argument("--strategy", choices=("auto", "compact", "standard", "large", "massive"), default="auto")
    ap.add_argument("--out", "-o", help="可选 JSON 输出路径")
    args = ap.parse_args(argv)
    path = Path(args.html)
    if not path.is_file():
        print(f"ERROR: 文件不存在: {path}", file=sys.stderr)
        return 1
    try:
        metrics = inspect_html(path)
        strategy = choose_analysis_strategy(metrics, args.strategy)
    except Exception as exc:
        print(f"ERROR: 规划失败 [{type(exc).__name__}]: {exc}", file=sys.stderr)
        return 2
    result = {
        "schemaVersion": "1.0",
        "source": str(path.resolve()),
        "metrics": metrics.to_dict(),
        "strategy": strategy.to_dict(),
    }
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
        print(f"✓ 已生成策略计划: {out}")
    else:
        print(text, end="")
    print(
        f"策略: {strategy.name}; 拆解: {strategy.dismantle_mode}; "
        f"验证: {strategy.verification_mode}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
