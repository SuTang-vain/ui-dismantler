"""CLI for HTML analysis: ``python3 -m ui_dismantler.cli.analyze_html``.

参数解析 + 文件 IO + 调用 ``ui_dismantler.analysis.html.HtmlAnalyzer``。
业务逻辑见分析层，本模块不含任何业务规则。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from ui_dismantler.analysis.html import HtmlAnalyzer
from ui_dismantler.core.common import safe_json_dump


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="HTML → manifest.json 分析引擎")
    ap.add_argument("html", help="HTML 文件路径")
    ap.add_argument("--out", "-o", required=True, help="输出 manifest.json 路径")
    context = ap.add_mutually_exclusive_group()
    context.add_argument("--profile", help="可选领域上下文标签（不参与核心识别）")
    context.add_argument("--vertical", help="兼容别名：等同 --profile")
    ap.add_argument("--minimal", action="store_true", help="最小提取模式（仅主题色+结构清单）")
    args = ap.parse_args(argv)

    if not Path(args.html).is_file():
        print(f"ERROR: 文件不存在: {args.html}", file=sys.stderr)
        return 1

    try:
        analyzer = HtmlAnalyzer(
            args.html,
            vertical=args.vertical,
            minimal=args.minimal,
            profile=args.profile,
        )
        manifest = analyzer.analyze()
    except Exception as e:
        print(f"ERROR: 分析失败 [{type(e).__name__}]: {e}", file=sys.stderr)
        return 2

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(safe_json_dump(manifest), encoding="utf-8")

    # 摘要
    print(f"✓ 已生成 manifest: {out_path}")
    print(f"  标题: {manifest['meta']['title']}")
    print(f"  Profile: {manifest['meta']['vertical']}")
    print(f"  主题色令牌: {len(manifest['theme']['tokens'])} 个")
    print(f"  Tab: {len(manifest['structure']['tabs'])} 个")
    print(f"  视图: {[v['type'] for v in manifest['structure']['views']]}")
    print(f"  Modal: {len(manifest['structure']['modals'])} 个")
    print(f"  数据: members={len(manifest['data'].get('members',[]))}, "
          f"timeline={len(manifest['data'].get('timeline',[]))}, "
          f"works={len(manifest['data'].get('works',[]))}, "
          f"facts={len(manifest['data'].get('moreFacts',[]))}")
    if manifest["warnings"]:
        print(f"  ⚠ 告警 ({len(manifest['warnings'])}):")
        for w in manifest["warnings"][:5]:
            print(f"    - {w}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
