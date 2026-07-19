#!/usr/bin/env python3
"""按 stable key 比较两个 canonical UI-IR v2 文档。"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from ui_dismantler.uiir.model import diff_uiir_observation


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="UI-IR v2 stable-key semantic diff")
    parser.add_argument("before", type=Path, help="变更前 canonical UI-IR JSON")
    parser.add_argument("after", type=Path, help="变更后 canonical UI-IR JSON")
    parser.add_argument("-o", "--output", type=Path, help="输出路径；省略时写到 stdout")
    parser.add_argument("--pretty", action="store_true", help="输出带缩进的可读版本")
    parser.add_argument("--check", action="store_true", help="只验证并输出变化摘要")
    args = parser.parse_args(argv)

    try:
        before = json.loads(args.before.read_text(encoding="utf-8"))
        after = json.loads(args.after.read_text(encoding="utf-8"))
        diff = diff_uiir_observation(before, after)
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
        print(f"[ui-ir] diff 失败：{exc}", file=sys.stderr)
        return 1

    summary = diff["summary"]
    if args.check:
        print(
            "[ui-ir] OK "
            f"entities=+{summary['entitiesAdded']}/-{summary['entitiesRemoved']}"
            f"/~{summary['entitiesChanged']} "
            f"relations=+{summary['relationsAdded']}/-{summary['relationsRemoved']}"
        )
        return 0

    content = json.dumps(
        diff,
        ensure_ascii=False,
        indent=2 if args.pretty else None,
        separators=None if args.pretty else (",", ":"),
    ) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(content, encoding="utf-8")
        print(f"[ui-ir] 写入 diff observation：{args.output}")
    else:
        sys.stdout.write(content)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
