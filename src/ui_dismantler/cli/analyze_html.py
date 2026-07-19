"""CLI for HTML analysis and manifest v1 extraction."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

from ui_dismantler.analysis.html import HtmlAnalyzer
from ui_dismantler.core.common import safe_json_dump


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="HTML → manifest.json 分析引擎")
    parser.add_argument("html", type=Path, help="HTML 文件路径")
    parser.add_argument("--out", "-o", required=True, type=Path, help="输出 manifest.json 路径")
    parser.add_argument("--vertical", help="垂类名（默认从父目录推断）")
    parser.add_argument("--minimal", action="store_true", help="最小提取模式（仅主题色+结构清单）")
    args = parser.parse_args(argv)

    if not args.html.is_file():
        print(f"ERROR: 文件不存在: {args.html}", file=sys.stderr)
        return 1
    try:
        manifest = HtmlAnalyzer(args.html, vertical=args.vertical, minimal=args.minimal).analyze()
    except Exception as exc:
        print(f"ERROR: 分析失败 [{type(exc).__name__}]: {exc}", file=sys.stderr)
        return 2

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(safe_json_dump(manifest), encoding="utf-8")
    print(f"✓ 已生成 manifest: {args.out}")
    print(f"  标题: {manifest['meta']['title']}")
    print(f"  垂类: {manifest['meta']['vertical']}")
    print(f"  主题色令牌: {len(manifest['theme']['tokens'])} 个")
    print(f"  Tab: {len(manifest['structure']['tabs'])} 个")
    print(f"  视图: {[view['type'] for view in manifest['structure']['views']]}")
    print(f"  Modal: {len(manifest['structure']['modals'])} 个")
    print(
        "  数据: "
        f"members={len(manifest['data'].get('members', []))}, "
        f"timeline={len(manifest['data'].get('timeline', []))}, "
        f"works={len(manifest['data'].get('works', []))}, "
        f"facts={len(manifest['data'].get('moreFacts', []))}"
    )
    if manifest["warnings"]:
        print(f"  ⚠ 告警 ({len(manifest['warnings'])}):")
        for warning in manifest["warnings"][:5]:
            print(f"    - {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
