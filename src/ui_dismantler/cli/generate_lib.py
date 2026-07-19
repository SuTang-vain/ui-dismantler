"""CLI for manifest-driven component-library scaffold generation."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from ui_dismantler.core.common import slugify
from ui_dismantler.generation.library import render_all


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="manifest.json → 组件库生成引擎")
    parser.add_argument("manifest", type=Path, help="manifest.json 路径")
    parser.add_argument("--out", "-o", required=True, type=Path, help="输出目录")
    parser.add_argument("--name", help="库名（默认从 manifest.caseName 推断）")
    parser.add_argument("--prefix", default="sg", help="CSS/JS 前缀（默认 sg）")
    args = parser.parse_args(argv)

    if not args.manifest.is_file():
        print(f"ERROR: manifest 不存在: {args.manifest}", file=sys.stderr)
        return 1
    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: manifest 读取失败: {exc}", file=sys.stderr)
        return 2

    lib_name = slugify(args.name or manifest.get("meta", {}).get("caseName") or "component-lib") or "component-lib"
    out_dir = args.out.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    render_all(manifest, out_dir, lib_name, args.prefix)

    print(f"✓ 已生成组件库: {out_dir}")
    print(f"  库名: {lib_name} (前缀: {args.prefix})")
    print("  文件:")
    for path in sorted(out_dir.rglob("*")):
        if path.is_file():
            print(f"    {path.relative_to(out_dir)}")
    if manifest.get("warnings"):
        print(f"  ⚠ manifest 含 {len(manifest['warnings'])} 条告警，请复核")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
