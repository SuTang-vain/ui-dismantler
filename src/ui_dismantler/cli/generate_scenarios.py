"""CLI for scenario candidate generation: ``python3 -m ui_dismantler.cli.generate_scenarios``.

参数解析 + 文件 IO + 调用 ``ui_dismantler.evaluation.scenario_generator.generate``。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from ui_dismantler.evaluation.scenario_generator import generate


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="从 manifest 生成交互场景候选")
    parser.add_argument("manifest", help="analyze_html.py 生成的 manifest.json")
    parser.add_argument("--out", required=True, help="候选场景 JSON 输出路径")
    args = parser.parse_args(argv)
    try:
        manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
        result = generate(manifest)
        Path(args.out).write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(f"已生成 {len(result['scenarios'])} 个候选场景: {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
