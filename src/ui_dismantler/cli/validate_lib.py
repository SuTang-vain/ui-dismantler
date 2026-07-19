"""CLI for component-library constraint validation."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

from ui_dismantler.validation.library import LibValidator


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="组件库强约束校验")
    parser.add_argument("lib_dir", type=Path, help="组件库目录")
    args = parser.parse_args(argv)
    if not args.lib_dir.is_dir():
        print(f"ERROR: 目录不存在: {args.lib_dir}", file=sys.stderr)
        return 1
    return LibValidator(str(args.lib_dir)).run()


if __name__ == "__main__":
    raise SystemExit(main())
