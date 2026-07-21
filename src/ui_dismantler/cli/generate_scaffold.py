"""CLI for the fast manifest-to-library scaffold generator."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from ui_dismantler.core.common import slugify
from ui_dismantler.generation.scaffold import render_all


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="manifest.json → 可精修组件库脚手架")
    ap.add_argument("manifest", help="analyze_html.py 生成的 manifest.json")
    ap.add_argument("--out", "-o", required=True, help="脚手架输出目录")
    ap.add_argument("--name", help="库名（默认从 manifest meta.caseName 推断）")
    ap.add_argument("--prefix", default="sg", help="CSS/DOM 前缀（默认 sg）")
    args = ap.parse_args(argv)

    manifest_path = Path(args.manifest).resolve()
    if not manifest_path.is_file():
        print(f"ERROR: manifest 不存在: {manifest_path}", file=sys.stderr)
        return 2
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: manifest 读取失败: {exc}", file=sys.stderr)
        return 2
    lib_name = slugify(args.name or manifest.get("meta", {}).get("caseName") or "component-lib") or "component-lib"
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        render_all(manifest, out_dir, lib_name, args.prefix)
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(f"脚手架已生成: {out_dir}")
    print("注意：这是精修起点，不是最终交付；必须继续跑 Gold 验证和 Roundtrip。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
