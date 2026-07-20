"""CLI for library validation: ``python3 -m ui_dismantler.cli.validate_lib``.

参数解析 + 目录校验 + 调用 ``ui_dismantler.validation.library.LibValidator``。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from ui_dismantler.validation.library import LibValidator


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="组件库强约束校验")
    ap.add_argument("lib_dir", help="组件库目录")
    args = ap.parse_args(argv)

    if not Path(args.lib_dir).is_dir():
        print(f"ERROR: 目录不存在: {args.lib_dir}", file=sys.stderr)
        return 1

    v = LibValidator(args.lib_dir)
    return v.run()


if __name__ == "__main__":
    sys.exit(main())
