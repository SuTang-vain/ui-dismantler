"""CLI for IIFE, ESM and Web Component output adaptation."""

from __future__ import annotations

import argparse
from pathlib import Path

from ui_dismantler.generation.adapt_output import to_esm, to_web_component


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="输出适配器：IIFE -> ESM / Web Component")
    parser.add_argument("src", type=Path, help="IIFE 源码 JS 文件路径")
    parser.add_argument("--esm", action="store_true", help="输出 ESM 形态")
    parser.add_argument("--wc", action="store_true", help="输出 Web Component 形态")
    parser.add_argument("--all", action="store_true", help="输出全部形态到目录")
    parser.add_argument("--name", help="Web Component 标签名（如 sg-kzk-about）")
    parser.add_argument("--out", type=Path, help="输出文件路径（单形态）")
    parser.add_argument("--out-dir", type=Path, help="输出目录（--all 模式）")
    args = parser.parse_args(argv)

    source = args.src.read_text(encoding="utf-8")
    if args.all:
        out_dir = args.out_dir or args.src.parent
        out_dir.mkdir(parents=True, exist_ok=True)
        tag_name = args.name or "sg-component"
        esm_path = out_dir / f"{args.src.stem}.esm.js"
        wc_path = out_dir / f"{args.src.stem}.wc.js"
        esm_path.write_text(to_esm(source), encoding="utf-8")
        wc_path.write_text(to_web_component(source, tag_name), encoding="utf-8")
        print(f"ESM: {esm_path}")
        print(f"WC:  {wc_path} (tag: <{tag_name}>)")
        return 0

    if args.esm:
        output = to_esm(source)
    elif args.wc:
        output = to_web_component(source, args.name or "sg-component")
    else:
        parser.error("请指定 --esm / --wc / --all")
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(output, encoding="utf-8")
        print(f"已写入 {args.out}")
    else:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
