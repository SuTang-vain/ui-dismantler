"""CLI for preparing bounded section contracts for component generation."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from ui_dismantler.generation.section_contracts import load_and_prepare_section_generation_input


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="section inventory → generation-input.json")
    ap.add_argument("inventory", help="extract_sections.py 生成的 inventory.json")
    ap.add_argument("--out", required=True, help="生成输入 JSON 路径")
    ap.add_argument("--allow-invalid", action="store_true", help="保留校验失败输入，不以错误退出")
    args = ap.parse_args(argv)
    path = Path(args.inventory)
    if not path.is_file():
        print(f"ERROR: inventory 不存在: {path}", file=sys.stderr)
        return 2
    try:
        result = load_and_prepare_section_generation_input(path, strict=not args.allow_invalid)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"ERROR: generation input 准备失败: {exc}", file=sys.stderr)
        return 2
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"✓ generation input: {out}")
    print(f"  status: {result['status']}")
    print(f"  sections: {len(result['sections'])}")
    print(f"  warnings: {len(result['validation']['warnings'])}")
    return 0 if result["status"] == "ready-for-agent" else 1


if __name__ == "__main__":
    raise SystemExit(main())
