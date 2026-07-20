"""Batch verification: run roundtrip over all cases and summarize pass rate.

对目录下所有案例 HTML 跑 roundtrip，汇总通过率与平均分。
用途：改 skill / 工具层后跑全量回归，确认没退化。
用 --lib-dir 指定"案例名 -> 已生成组件库目录"的映射，验证 agent 产出。

支持三项性能优化（从 experimental 迁移）:
- 并行: ThreadPoolExecutor 并行跑多案例（--workers，默认 CPU 核数）
- 缓存: HTML + 组件库 hash 不变时复用结果（冷启动→缓存 29x 加速）
- 增量: --changed 只测 hash 变化的案例

业务逻辑层：本模块提供 find_cases / select_cases / build_roundtrip_command /
run_roundtrip / run_single_case 等函数，不含 CLI 入口。
CLI 入口见 ``ui_dismantler.cli.verify_all``。

退出码：初始分与全部交互状态均达标 0，有未达标 1，流程出错 2。
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from ui_dismantler.paths import PROJECT_ROOT


# ============================================================
# 缓存层：基于 HTML + 组件库 hash 的结果复用
# ============================================================
CACHE_DIR = Path(tempfile.gettempdir()) / "ui_dismantler_cache"


def html_hash(html_path: Path) -> str:
    """计算 HTML 文件内容的 hash（用于缓存键和增量检测）。"""
    return hashlib.md5(html_path.read_bytes()).hexdigest()[:12]


def lib_hash(lib_dir: Path) -> str:
    """计算组件库所有源文件的合并 hash。"""
    h = hashlib.md5()
    for f in sorted(lib_dir.rglob("*")):
        if f.is_file() and f.suffix in (".css", ".js", ".html", ".md"):
            h.update(f.read_bytes())
    return h.hexdigest()[:12]


def get_cached_hash(key: str) -> str | None:
    """从缓存读取 hash。"""
    cache_file = CACHE_DIR / f"{key}.hash"
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8").strip()
    return None


def set_cached_hash(key: str, h: str) -> None:
    """写入缓存 hash。"""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{key}.hash"
    cache_file.write_text(h, encoding="utf-8")


def clear_cache() -> int:
    """清除缓存目录，返回清除的文件数。"""
    if not CACHE_DIR.exists():
        return 0
    count = len(list(CACHE_DIR.glob("*")))
    import shutil
    shutil.rmtree(CACHE_DIR, ignore_errors=True)
    return count


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


def run_single_case(
    name: str,
    html: Path,
    lib_dir: Path,
    threshold: float,
    reference_mode: str = "rendered",
    width: int = 1024,
    height: int = 768,
    scenarios: Path | None = None,
    state_threshold: float = 0.85,
    manifest: Path | None = None,
    coverage_threshold: float | None = None,
    *,
    use_cache: bool = False,
) -> dict:
    """跑单个案例（可在工作线程里执行）。

    当 ``use_cache=True`` 且案例不含交互场景矩阵/覆盖率门禁时，
    基于 HTML + 组件库 hash 复用上次结果。含场景矩阵的案例不缓存
    （状态执行有副作用，需要每次实跑）。

    返回 dict 含 case / ok / scores / passed / render_ok / cached 字段。
    """
    # 含交互场景的案例不缓存（执行有副作用）
    cacheable = use_cache and scenarios is None and manifest is None
    cache_key = ""
    if cacheable:
        cache_key = f"{name}_{html_hash(html)}_{lib_hash(lib_dir)}"
        cached_h = get_cached_hash(cache_key)
        if cached_h:
            cached_report = CACHE_DIR / f"{cache_key}.json"
            if cached_report.exists():
                try:
                    report = json.loads(cached_report.read_text(encoding="utf-8"))
                    scores = report.get("scores", {})
                    overall = scores.get("overall", 0)
                    return {
                        "case": name, "ok": True, "scores": scores,
                        "passed": overall >= threshold,
                        "render_ok": report.get("render_ok", False),
                        "reference": report.get("reference", {}),
                        "scenario_matrix": report.get("scenario_matrix"),
                        "interaction_coverage": report.get("interaction_coverage"),
                        "cached": True,
                    }
                except Exception:
                    pass  # 缓存损坏，重新跑

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        tmp_json = Path(tf.name)
    try:
        res = run_roundtrip(
            html, lib_dir, tmp_json, reference_mode, width, height,
            scenarios, state_threshold, manifest, coverage_threshold,
        )
    finally:
        tmp_json.unlink(missing_ok=True)

    if not res["ok"]:
        return {
            "case": name, "ok": False, "error": res["error"],
            "passed": False, "cached": False,
        }

    report = res["report"]
    scores = report.get("scores", {})
    overall = scores.get("overall", 0)
    scenario_matrix = report.get("scenario_matrix")
    interaction_coverage = report.get("interaction_coverage")
    states_passed = (
        scenario_matrix is None
        or scenario_matrix.get("passed") == scenario_matrix.get("total")
    )
    coverage_passed = (
        interaction_coverage is None
        or coverage_threshold is None
        or interaction_coverage.get("passed", False)
    )
    passed = overall >= threshold and states_passed and coverage_passed

    # 写缓存（仅可缓存且子进程成功的案例）
    if cacheable:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cached_report = CACHE_DIR / f"{cache_key}.json"
        cached_report.write_text(
            json.dumps(report, ensure_ascii=False), encoding="utf-8"
        )
        set_cached_hash(cache_key, cache_key)

    return {
        "case": name, "ok": True, "scores": scores,
        "passed": passed,
        "render_ok": report.get("render_ok", False),
        "reference": report.get("reference", {}),
        "scenario_matrix": scenario_matrix,
        "interaction_coverage": interaction_coverage,
        "cached": False,
    }


def run_cases_parallel(
    cases: list[tuple[str, Path, Path]],
    threshold: float,
    reference_mode: str = "rendered",
    width: int = 1024,
    height: int = 768,
    scenarios: Path | None = None,
    state_threshold: float = 0.85,
    manifest: Path | None = None,
    coverage_threshold: float | None = None,
    workers: int = 1,
    use_cache: bool = False,
) -> list[dict]:
    """并行跑多个案例，返回结果列表（按案例名排序）。

    Args:
        cases: [(name, html_path, lib_dir), ...]
        workers: 并行度（默认 1=串行）
        use_cache: 是否启用缓存（含交互场景的案例自动跳过缓存）
    """
    results: list[dict] = []
    if workers <= 1:
        for name, html, lib_dir in cases:
            results.append(run_single_case(
                name, html, lib_dir, threshold, reference_mode,
                width, height, scenarios, state_threshold,
                manifest, coverage_threshold, use_cache=use_cache,
            ))
        return results

    with ThreadPoolExecutor(max_workers=workers) as pool:
        future_to_name = {
            pool.submit(
                run_single_case, name, html, lib_dir, threshold, reference_mode,
                width, height, scenarios, state_threshold,
                manifest, coverage_threshold, use_cache=use_cache,
            ): name
            for name, html, lib_dir in cases
        }
        for future in as_completed(future_to_name):
            results.append(future.result())
    results.sort(key=lambda r: r.get("case", ""))
    return results
