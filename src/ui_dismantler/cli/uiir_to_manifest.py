#!/usr/bin/env python3
"""把 UI-IR v2 投影回 manifest v1 兼容 JSON。"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from ui_dismantler.uiir.model import uiir_to_manifest


def _default_output(input_path: Path) -> Path:
    name = input_path.name
    if name.endswith(".uiir.json"):
        return input_path.with_name(name[:-len(".uiir.json")] + ".manifest.json")
    return input_path.with_name(f"{input_path.stem}.manifest.json")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="UI-IR v2 → manifest v1")
    parser.add_argument("uiir", type=Path, help="输入 canonical UI-IR v2 JSON")
    parser.add_argument("-o", "--output", type=Path, help="输出路径")
    parser.add_argument("--compact", action="store_true", help="输出无缩进 JSON")
    parser.add_argument("--check", action="store_true", help="只投影和验证，不写文件")
    args = parser.parse_args(argv)

    try:
        document = json.loads(args.uiir.read_text(encoding="utf-8"))
        manifest = uiir_to_manifest(document)
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
        print(f"[ui-ir] 兼容投影失败：{exc}", file=sys.stderr)
        return 1

    if args.check:
        print(
            f"[ui-ir] OK datasets={len(manifest.get('data') or {})} "
            f"components={sum(len((manifest.get('structure') or {}).get(key) or []) for key in ('tabs', 'views', 'modals', 'storyPanels'))}"
        )
        return 0

    output = args.output or _default_output(args.uiir)
    output.parent.mkdir(parents=True, exist_ok=True)
    if args.compact:
        content = json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n"
    else:
        content = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    output.write_text(content, encoding="utf-8")
    print(f"[ui-ir] 写入兼容 manifest：{output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
