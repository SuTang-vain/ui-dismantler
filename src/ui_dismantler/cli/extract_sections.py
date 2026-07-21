"""CLI for producing bounded section analysis artifacts."""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

from ui_dismantler.analysis.chunks import extract_section_chunks


DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="HTML → page-plan/inventory/section chunks")
    ap.add_argument("html", help="HTML 文件路径")
    ap.add_argument("--out", required=True, help="分析产物目录")
    ap.add_argument("--strategy", choices=("auto", "compact", "standard", "large", "massive"), default="auto")
    ap.add_argument("--with-cdp", action="store_true", help="同时采集 Chromium matched/computed CSS 证据")
    ap.add_argument("--chrome", default=DEFAULT_CHROME)
    ap.add_argument("--max-samples", type=int, default=12)
    args = ap.parse_args(argv)
    html = Path(args.html)
    if not html.is_file():
        print(f"ERROR: 文件不存在: {html}", file=sys.stderr)
        return 1
    try:
        result = extract_section_chunks(
            html,
            args.out,
            strategy=args.strategy,
            with_cdp=args.with_cdp,
            chrome=args.chrome if args.with_cdp else None,
            max_samples=max(0, args.max_samples),
        )
    except Exception as exc:
        print(f"ERROR: section 提取失败 [{type(exc).__name__}]: {exc}", file=sys.stderr)
        return 2
    plan = result.page_plan
    chunks = result.inventory.get("chunks", [])
    print(f"✓ 分析产物: {result.output_dir}")
    print(f"  策略: {plan['strategy']['name']}")
    print(f"  section: {plan['sectionCount']} / chunkable: {plan['chunkableSectionCount']}")
    print(f"  chunk 写入: {sum(1 for item in chunks if item.get('status') == 'ok')}")
    if result.cdp_evidence is not None:
        print(
            f"  CDP: {result.cdp_evidence.get('status')} / "
            f"comparable={result.cdp_evidence.get('comparable')}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
