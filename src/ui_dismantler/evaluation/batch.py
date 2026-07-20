"""Batch verification: run roundtrip over all cases and summarize pass rate.

对目录下所有案例 HTML 跑 roundtrip，汇总通过率与平均分。
用途：改 skill / 工具层后跑全量回归，确认没退化。
用 --lib-dir 指定"案例名 -> 已生成组件库目录"的映射，验证 agent 产出。

业务逻辑层：本模块提供 find_cases / select_cases / build_roundtrip_command /
run_roundtrip 等函数，不含 CLI 入口。CLI 入口见 ``ui_dismantler.cli.verify_all``。

退出码：初始分与全部交互状态均达标 0，有未达标 1，流程出错 2。
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from ui_dismantler.paths import PROJECT_ROOT


def find_cases(cases_dir: Path) -> list[tuple[str, Path]]:
    """扫描 cases_dir/<name>/original.html，返回 [(name, html_path), ...]。"""
    out: list[tuple[str, Path]] = []
    if not cases_dir.is_dir():
        return out
    for sub in sorted(cases_dir.iterdir()):
        if not sub.is_dir():
            continue
        html = sub / "original.html"
        if html.is_file():
            out.append((sub.name, html))
    return out


def select_cases(
    cases: list[tuple[str, Path]],
    lib_root: Path,
    single_lib_mode: bool,
    requested_case: str | None = None,
) -> list[tuple[str, Path]]:
    """选择待验证案例；单库模式必须与库目录名明确对应。"""
    if requested_case:
        selected = [item for item in cases if item[0] == requested_case]
        if not selected:
            raise ValueError(f"未找到案例: {requested_case}")
        return selected
    if not single_lib_mode:
        return cases

    aliases = {lib_root.name, lib_root.parent.name}
    selected = [item for item in cases if item[0] in aliases]
    if len(selected) == 1:
        return selected
    if len(cases) == 1:
        return cases
    raise ValueError(
        "单库模式无法从目录名确定对应案例；请用 --case <案例名> 明确指定"
    )


def build_roundtrip_command(
    html: Path,
    lib_dir: Path,
    out_json: Path,
    reference_mode: str,
    width: int,
    height: int,
    scenarios: Path | None = None,
    state_threshold: float = 0.85,
    manifest: Path | None = None,
    coverage_threshold: float | None = None,
) -> list[str]:
    # 通过 ``python -m ui_dismantler.cli.roundtrip`` 调用规范包的 CLI 入口，
    # 不再依赖 scripts/roundtrip.py 的物理路径。
    command = [
        sys.executable,
        "-m",
        "ui_dismantler.cli.roundtrip",
        str(html),
        "--lib", str(lib_dir),
        "--out", str(out_json),
        "--reference-mode", reference_mode,
        "--width", str(width),
        "--height", str(height),
    ]
    if scenarios:
        command += [
            "--scenarios", str(scenarios),
            "--state-threshold", str(state_threshold),
        ]
    if manifest:
        command += ["--manifest", str(manifest)]
    if coverage_threshold is not None:
        command += ["--coverage-threshold", str(coverage_threshold)]
    return command


def run_roundtrip(
    html: Path,
    lib_dir: Path,
    out_json: Path,
    reference_mode: str,
    width: int,
    height: int,
    scenarios: Path | None = None,
    state_threshold: float = 0.85,
    manifest: Path | None = None,
    coverage_threshold: float | None = None,
) -> dict:
    """对单个案例跑 roundtrip，返回报告 dict。"""
    cmd = build_roundtrip_command(
        html, lib_dir, out_json, reference_mode, width, height,
        scenarios, state_threshold,
        manifest, coverage_threshold,
    )
    # ``python -m ui_dismantler.cli.roundtrip`` 需要 src/ 在 import 路径上。
    # 继承当前 env 并追加 SOURCE_ROOT，保证子进程能 import ui_dismantler。
    import os
    env = os.environ.copy()
    src_path = str(PROJECT_ROOT / "src")
    existing = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = f"{src_path}{os.pathsep}{existing}" if existing else src_path
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120, env=env)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "roundtrip 超时（120s）"}
    if not out_json.exists():
        return {"ok": False, "error": f"roundtrip 未产出报告: {proc.stderr[:200]}"}
    try:
        report = json.loads(out_json.read_text(encoding="utf-8"))
        if proc.returncode not in (0, 1):
            return {"ok": False, "error": f"roundtrip 退出码 {proc.returncode}: {proc.stderr[:200]}"}
        return {"ok": True, "report": report, "exit_code": proc.returncode}
    except json.JSONDecodeError as e:
        return {"ok": False, "error": f"报告解析失败: {e}"}
