"""可选的浏览器运行时 DOM/事件观察。

通过 Playwright 在隔离的无头浏览器中打开本地 HTML，记录：
- EventTarget.addEventListener 的真实注册；
- 页面加载完成后仍存在的 on* property handler；
- 可选的、受限的合成事件调用次数。

该模块是增强项：Playwright、浏览器或页面运行失败时只返回 warnings，
不会阻断 manifest -> UI-IR 的静态转换。

场景执行循环和辅助函数已拆分到 ``scenarios`` 模块。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any


def _empty(source: Path) -> dict[str, Any]:
    return {
        "source": str(source),
        "browser": None,
        "domCount": 0,
        "registrations": [],
        "errors": [],
        "exercised": 0,
        "actions": [],
        "scenarios": [],
        "trustedActions": 0,
        "failedActions": 0,
        "skippedActions": 0,
        "passedAssertions": 0,
        "failedAssertions": 0,
        "failureReplay": [],
        "candidates": [],
        "stateGraph": {"nodes": [], "edges": []},
        "coverage": {
            "scenarios": {"total": 0, "completed": 0, "failed": 0, "skipped": 0},
            "actions": {"total": 0, "completed": 0, "failed": 0, "skipped": 0},
            "assertions": {"total": 0, "passed": 0, "failed": 0},
            "conditions": {"total": 0, "passed": 0, "failed": 0},
            "registrations": {"registered": 0, "invoked": 0, "ratio": 0.0},
            "candidates": {"discovered": 0, "visible": 0, "actionable": 0, "requiresInput": 0, "navigationRisk": 0},
        },
    }


def _registration_key(item: dict[str, Any]) -> tuple[Any, ...]:
    options = item.get("options") if isinstance(item.get("options"), dict) else {}
    return (
        item.get("selector", ""), item.get("event", ""), item.get("api", ""),
        item.get("source", ""), item.get("runtimeLine") or 0,
        item.get("runtimeColumn") or 0,
        tuple(sorted((str(key), repr(value)) for key, value in options.items())),
    )


def observe_runtime_references(
    source_path: str | Path,
    *,
    exercise: bool = False,
    timeout_ms: int = 5000,
    settle_ms: int = 150,
    max_exercises: int = 32,
    actions: list[dict[str, Any]] | None = None,
    scenarios: list[dict[str, Any]] | None = None,
    max_actions: int = 64,
    max_scenarios: int = 16,
    max_assertions: int = 128,
    max_candidates: int = 64,
) -> tuple[dict[str, Any], list[str]]:
    """在独立浏览器上下文中观察场景、事件注册和 listener 调用。"""
    source = Path(source_path).expanduser().resolve()
    result = _empty(source)
    if not source.is_file():
        return result, [f"运行时观察来源文件不存在：{source}"]
    if source.suffix.lower() not in {".html", ".htm"}:
        return result, []
    if timeout_ms < 100:
        return result, ["运行时观察 timeout_ms 必须不少于 100"]
    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        return result, [f"Playwright 不可用，已跳过运行时观察：{exc}"]

    scenario_inputs: list[Any] = []
    if actions is not None:
        scenario_inputs.append({"id": "default", "actions": actions})
    if scenarios is not None:
        scenario_inputs.extend(scenarios)
    if not scenario_inputs:
        scenario_inputs = [{"id": "observation", "actions": []}]
    warnings: list[str] = []
    if len(scenario_inputs) > max_scenarios:
        warnings.append(
            f"运行时场景共 {len(scenario_inputs)} 条，仅执行前 {max_scenarios} 条"
        )
        scenario_inputs = scenario_inputs[:max(0, max_scenarios)]

    # Deferred import avoids the runtime_refs <-> scenarios circular import
    # at module load time (scenarios imports _registration_key from here).
    from .scenarios import RuntimeSession, run_scenarios

    session = RuntimeSession(
        source,
        result,
        exercise=exercise,
        timeout_ms=timeout_ms,
        settle_ms=settle_ms,
        max_exercises=max_exercises,
        max_actions=max_actions,
        max_assertions=max_assertions,
        max_candidates=max_candidates,
        warnings=warnings,
    )

    browser = None
    try:
        with sync_playwright() as playwright:
            launch_errors: list[str] = []
            browser_name = None
            for name in ("chromium", "webkit", "firefox"):
                try:
                    browser = getattr(playwright, name).launch(headless=True)
                    browser_name = name
                    break
                except Exception as exc:
                    launch_errors.append(f"{name}: {exc}")
            if browser is None:
                return result, ["无法启动 Playwright 浏览器：" + " | ".join(launch_errors)]
            result["browser"] = browser_name

            run_scenarios(session, browser, scenario_inputs)

            result["registrations"] = sorted(
                session.registrations_by_key.values(), key=_registration_key
            )
            result["candidates"] = sorted(
                session.candidates_by_key.values(), key=lambda item: (item["selector"], item["action"])
            )
            result["stateGraph"] = {
                "nodes": sorted(session.state_nodes_by_id.values(), key=lambda item: item["id"]),
                "edges": session.state_edges,
            }
            browser.close()
            browser = None
    except Exception as exc:
        warnings.append(f"运行时观察失败：{type(exc).__name__}: {exc}")
        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass

    scenario_counts = {"total": len(result["scenarios"]), "completed": 0, "failed": 0, "skipped": 0}
    for scenario in result["scenarios"]:
        status = scenario.get("status")
        if status in scenario_counts:
            scenario_counts[status] += 1
    action_counts = {
        "total": len(result["actions"]),
        "completed": result["trustedActions"],
        "failed": result["failedActions"],
        "skipped": result["skippedActions"],
    }
    all_conditions = [
        condition
        for scenario in result["scenarios"]
        for condition in scenario.get("conditions") or []
    ] + [
        condition
        for action in result["actions"]
        for condition in action.get("conditions") or []
    ]
    condition_counts = {
        "total": len(all_conditions),
        "passed": sum(item.get("status") == "passed" for item in all_conditions),
        "failed": sum(item.get("status") != "passed" for item in all_conditions),
    }
    assertion_counts = {
        "total": result["passedAssertions"] + result["failedAssertions"],
        "passed": result["passedAssertions"],
        "failed": result["failedAssertions"],
    }
    registered = len(result["registrations"])
    invoked = sum(
        1 for item in result["registrations"]
        if int(item.get("invocationCount") or 0) > 0
    )
    result["coverage"] = {
        "scenarios": scenario_counts,
        "actions": action_counts,
        "assertions": assertion_counts,
        "conditions": condition_counts,
        "registrations": {
            "registered": registered,
            "invoked": invoked,
            "ratio": round(invoked / registered, 4) if registered else 0.0,
        },
        "candidates": {
            "discovered": len(result["candidates"]),
            "visible": sum(bool(item.get("visible")) for item in result["candidates"]),
            "actionable": sum(
                bool(item.get("visible")) and not bool(item.get("disabled"))
                for item in result["candidates"]
            ),
            "requiresInput": sum(bool(item.get("requiresInput")) for item in result["candidates"]),
            "navigationRisk": sum(bool(item.get("navigationRisk")) for item in result["candidates"]),
        },
    }
    return result, warnings
