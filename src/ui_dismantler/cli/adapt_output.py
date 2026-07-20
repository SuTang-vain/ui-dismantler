"""CLI for output adaptation: ``python3 -m ui_dismantler.cli.adapt_output``.

参数解析 + 文件 IO + 调用 ``ui_dismantler.generation.adapt_output`` 的转换函数。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from ui_dismantler.generation.adapt_output import to_esm, to_web_component


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="输出适配器：IIFE -> ESM / Web Component")
    ap.add_argument("src", help="IIFE 源码 JS 文件路径")
    ap.add_argument("--esm", action="store_true", help="输出 ESM 形态")
    ap.add_argument("--wc", action="store_true", help="输出 Web Component 形态")
    ap.add_argument("--all", action="store_true", help="输出全部形态到目录")
    ap.add_argument("--name", help="Web Component 标签名（如 sg-kzk-about）")
    ap.add_argument("--out", help="输出文件路径（单形态）")
    ap.add_argument("--out-dir", help="输出目录（--all 模式）")
    args = ap.parse_args(argv)

    src = Path(args.src).read_text(encoding="utf-8")

    if args.all:
        out_dir = Path(args.out_dir) if args.out_dir else Path(args.src).parent
        tag_name = args.name or "sg-component"
        base = Path(args.src).stem
        # ESM
        esm_path = out_dir / f"{base}.esm.js"
        esm_path.write_text(to_esm(src), encoding="utf-8")
        print(f"ESM: {esm_path}")
        # Web Component
        wc_path = out_dir / f"{base}.wc.js"
        wc_path.write_text(to_web_component(src, tag_name), encoding="utf-8")
        print(f"WC:  {wc_path} (tag: <{tag_name}>)")
        return 0

    if args.esm:
        out = to_esm(src)
    elif args.wc:
        tag = args.name or "sg-component"
        out = to_web_component(src, tag)
    else:
        ap.error("请指定 --esm / --wc / --all")

    if args.out:
        Path(args.out).write_text(out, encoding="utf-8")
        print(f"已写入 {args.out}")
    else:
        print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
