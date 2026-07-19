#!/usr/bin/env python3
"""从 canonical UI-IR v2 生成语义可读的 expanded observation。"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from ui_dismantler.uiir.model import uiir_to_expanded_observation


def _default_output(input_path: Path) -> Path:
    name = input_path.name
    if name.endswith(".uiir.json"):
        return input_path.with_name(name[:-len(".uiir.json")] + ".expanded.json")
    return input_path.with_name(f"{input_path.stem}.expanded.json")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="UI-IR v2 → expanded observation")
    parser.add_argument("uiir", type=Path, help="输入 canonical UI-IR v2 JSON")
    parser.add_argument("-o", "--output", type=Path, help="输出路径")
    parser.add_argument("--pretty", action="store_true", help="输出带缩进的调试版本")
    parser.add_argument("--check", action="store_true", help="只生成和验证，不写文件")
    args = parser.parse_args(argv)

    try:
        document = json.loads(args.uiir.read_text(encoding="utf-8"))
        expanded = uiir_to_expanded_observation(document)
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
        print(f"[ui-ir] expanded 投影失败：{exc}", file=sys.stderr)
        return 1

    if args.check:
        print(
            f"[ui-ir] OK entities={len(expanded['entities'])} "
            f"relations={len(expanded['relations'])}"
        )
        return 0

    output = args.output or _default_output(args.uiir)
    output.parent.mkdir(parents=True, exist_ok=True)
    if args.pretty:
        content = json.dumps(expanded, ensure_ascii=False, indent=2) + "\n"
    else:
        content = json.dumps(expanded, ensure_ascii=False, separators=(",", ":")) + "\n"
    output.write_text(content, encoding="utf-8")
    print(f"[ui-ir] 写入 expanded observation：{output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
