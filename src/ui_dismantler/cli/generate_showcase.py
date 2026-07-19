"""CLI for design-system showcase generation."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

from ui_dismantler.generation.showcase import generate_showcase


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="设计系统展示页生成器")
    parser.add_argument("lib_dir", type=Path, help="组件库目录")
    parser.add_argument("--out", type=Path, help="输出 HTML 路径（默认 <lib_dir>/showcase.html）")
    args = parser.parse_args(argv)
    lib_dir = args.lib_dir.resolve()
    if not lib_dir.is_dir():
        print(f"ERROR: 目录不存在: {lib_dir}", file=sys.stderr)
        return 1
    html = generate_showcase(lib_dir)
    output = args.out or lib_dir / "showcase.html"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8")
    print(f"展示页已生成: {output} ({len(html)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
