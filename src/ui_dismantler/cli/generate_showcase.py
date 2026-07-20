"""CLI for showcase generation: ``python3 -m ui_dismantler.cli.generate_showcase``.

参数解析 + 目录校验 + 调用 ``ui_dismantler.generation.showcase.generate_showcase``。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from ui_dismantler.generation.showcase import generate_showcase


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="设计系统展示页生成器")
    ap.add_argument("lib_dir", help="组件库目录")
    ap.add_argument("--out", help="输出 HTML 路径（默认 <lib_dir>/showcase.html）")
    args = ap.parse_args(argv)

    lib_dir = Path(args.lib_dir).resolve()
    if not lib_dir.is_dir():
        print(f"ERROR: 目录不存在: {lib_dir}", file=sys.stderr)
        return 1

    html = generate_showcase(lib_dir)
    out_path = Path(args.out) if args.out else lib_dir / "showcase.html"
    out_path.write_text(html, encoding="utf-8")
    print(f"展示页已生成: {out_path} ({len(html)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
