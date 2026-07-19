#!/usr/bin/env python3
"""把 manifest v1 转换为轻量 UI-IR v2。

用法：
    python3 manifest_to_uiir.py manifest.json
    python3 manifest_to_uiir.py manifest.json -o uiir.json --pretty
    python3 manifest_to_uiir.py manifest.json --check
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from ui_dismantler.uiir.model import manifest_to_uiir, validate_uiir


def _default_output(input_path: Path) -> Path:
    if input_path.suffix.lower() == ".json":
        return input_path.with_name(f"{input_path.stem}.uiir.json")
    return input_path.with_name(f"{input_path.name}.uiir.json")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="manifest v1 → UI-IR v2")
    parser.add_argument("manifest", type=Path, help="输入 manifest v1 JSON")
    parser.add_argument("-o", "--output", type=Path, help="输出路径；默认 <name>.uiir.json")
    parser.add_argument("--pretty", action="store_true", help="输出带缩进的调试版本")
    parser.add_argument("--check", action="store_true", help="只转换和验证，不写文件")
    parser.add_argument(
        "--source",
        type=Path,
        help="覆盖 meta.source，直接从指定 HTML/CSS 提取 @media 与源码引用",
    )
    parser.add_argument(
        "--no-source-css",
        action="store_true",
        help="禁用源 CSS 解析，仅使用 manifest responsive 兼容回退",
    )
    parser.add_argument(
        "--no-source-refs",
        action="store_true",
        help="禁用 HTML/JS DOM selector 与事件绑定静态提取",
    )
    parser.add_argument(
        "--runtime-observe",
        action="store_true",
        help="使用可选 Playwright 浏览器验证运行时 DOM 与事件注册",
    )
    parser.add_argument(
        "--runtime-exercise",
        action="store_true",
        help="观察后受限地派发合成事件并记录 listener 调用；隐含 --runtime-observe",
    )
    parser.add_argument(
        "--runtime-actions",
        type=Path,
        help="JSON 动作或场景文档；使用受约束 Playwright 动作并隐含 --runtime-observe",
    )
    parser.add_argument(
        "--runtime-scenario",
        metavar="ID",
        help="仅执行 --runtime-actions 场景文档中指定 id 的场景",
    )
    parser.add_argument(
        "--runtime-timeout",
        type=int,
        default=5000,
        metavar="MS",
        help="浏览器页面加载超时，默认 5000ms",
    )
    args = parser.parse_args(argv)

    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        runtime_actions = None
        runtime_scenarios = None
        if args.runtime_actions is not None:
            action_document = json.loads(args.runtime_actions.read_text(encoding="utf-8"))
            if isinstance(action_document, list):
                runtime_actions = action_document
            elif isinstance(action_document, dict):
                has_actions = "actions" in action_document
                has_scenarios = "scenarios" in action_document
                if has_actions and has_scenarios:
                    raise ValueError("runtime actions JSON 不能同时包含 actions 与 scenarios")
                if has_scenarios:
                    runtime_scenarios = action_document.get("scenarios")
                    if not isinstance(runtime_scenarios, list):
                        raise ValueError("runtime scenarios 必须是 array")
                else:
                    runtime_actions = action_document.get("actions")
                    if not isinstance(runtime_actions, list):
                        raise ValueError("runtime actions 必须是 array")
            else:
                raise ValueError("runtime actions JSON 必须是数组或包含 actions/scenarios 的 object")
        if args.runtime_scenario is not None:
            if runtime_scenarios is None:
                raise ValueError("--runtime-scenario 只能用于包含 scenarios 的动作文档")
            runtime_scenarios = [
                scenario for scenario in runtime_scenarios
                if isinstance(scenario, dict) and scenario.get("id") == args.runtime_scenario
            ]
            if not runtime_scenarios:
                raise ValueError(f"未找到 runtime scenario：{args.runtime_scenario}")
        uiir = manifest_to_uiir(
            manifest,
            use_source_css=not args.no_source_css,
            use_source_refs=not args.no_source_refs,
            use_runtime_refs=(
                args.runtime_observe or args.runtime_exercise or args.runtime_actions is not None
            ),
            runtime_exercise=args.runtime_exercise,
            runtime_timeout_ms=args.runtime_timeout,
            runtime_actions=runtime_actions,
            runtime_scenarios=runtime_scenarios,
            source_override=args.source,
        )
        errors = validate_uiir(uiir)
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
        print(f"[ui-ir] 转换失败：{exc}", file=sys.stderr)
        return 1

    if errors:
        for error in errors:
            print(f"[ui-ir] {error}", file=sys.stderr)
        return 1

    if args.check:
        print(f"[ui-ir] OK nodes={len(uiir['nodes'])} edges={len(uiir['edges'])}")
        return 0

    output = args.output or _default_output(args.manifest)
    output.parent.mkdir(parents=True, exist_ok=True)
    if args.pretty:
        content = json.dumps(uiir, ensure_ascii=False, indent=2) + "\n"
    else:
        content = json.dumps(uiir, ensure_ascii=False, separators=(",", ":")) + "\n"
    output.write_text(content, encoding="utf-8")
    print(f"[ui-ir] 写入 {output} nodes={len(uiir['nodes'])} edges={len(uiir['edges'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
