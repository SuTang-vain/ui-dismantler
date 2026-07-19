"""CLI for multi-case vertical aggregation."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

from ui_dismantler.aggregation.vertical import aggregate
from ui_dismantler.core.common import slugify


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="垂类聚合引擎：多案例 → 垂类公共库 + 变体配置")
    parser.add_argument("vertical_dir", type=Path, help="垂类目录（含若干 <案例>/index.html）")
    parser.add_argument("--out", "-o", required=True, type=Path, help="输出目录")
    parser.add_argument("--name", default="", help="库名（默认从垂类目录名推断）")
    args = parser.parse_args(argv)
    vertical_dir = args.vertical_dir.resolve()
    if not vertical_dir.is_dir():
        print(f"ERROR: {vertical_dir} 不是目录", file=sys.stderr)
        return 1
    aggregate(vertical_dir, args.out.resolve(), slugify(args.name or vertical_dir.name) or "vertical-lib")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
