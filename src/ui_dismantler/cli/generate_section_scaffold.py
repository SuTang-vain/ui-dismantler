"""CLI for generating a runnable section-oriented scaffold."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from ui_dismantler.generation.section_scaffold import generate_section_scaffold


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="generation-input.json → section-oriented scaffold")
    ap.add_argument("generation_input", help="prepare_section_generation.py 输出")
    ap.add_argument("--out", required=True, help="脚手架输出目录")
    ap.add_argument("--name", default="section-library", help="全局库名/PascalCase 来源")
    ap.add_argument("--showcase", action="store_true", help="同时生成 showcase.html")
    args = ap.parse_args(argv)
    path = Path(args.generation_input)
    if not path.is_file():
        print(f"ERROR: generation input 不存在: {path}", file=sys.stderr)
        return 2
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
        result = generate_section_scaffold(document, args.out, args.name, generate_showcase_artifact=args.showcase)
    except (OSError, json.JSONDecodeError, ValueError, RuntimeError) as exc:
        print(f"ERROR: section scaffold 生成失败: {exc}", file=sys.stderr)
        return 2
    print(f"✓ section scaffold: {result['outDir']}")
    print(f"  sections: {result['sections']}")
    print(f"  assembly: {result['assembly']}")
    print(f"  template: {result['template']}")
    if result.get("showcase"):
        print(f"  showcase: {result['showcase']}")
    print("注意：该产物是可运行脚手架，不代表 Roundtrip/交互/视觉已经通过。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
