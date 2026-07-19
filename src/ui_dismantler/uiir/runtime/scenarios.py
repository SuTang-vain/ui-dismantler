"""Scenario execution loop for runtime observation.

Runs each scenario (conditions + actions + assertions) against an isolated
browser context, recording registrations, candidates, state transitions, and
failure pointers into the shared ``RuntimeSession`` state.

This module is an enhancement: Playwright, browser, or page failures only
append warnings to the session; they never block manifest -> UI-IR conversion.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from .actions import _perform_trusted_action
from .assertions import _bounded_error, _evaluate_rule, _rule_list
from .init_script import INIT_SCRIPT as _INIT_SCRIPT
from ..extraction.local_refs import resolve_local_reference
from .runtime_refs import _registration_key


def _line_span(path: Path, line: int) -> list[int] | None:
    if line < 1 or not path.is_file():
        return None
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    starts = [0]
    starts.extend(match.end() for match in re.finditer(r"\n", text))
    if line > len(starts):
        return None
    start = starts[line - 1]
    end = starts[line] if line < len(starts) else len(text)
    return [start, end]


def _normalize_location(location: Any, fallback_source: Path) -> dict[str, Any]:
    if not isinstance(location, dict):
        return {}
    url = str(location.get("url") or "")
    line = location.get("line")
    column = location.get("column")
    path = fallback_source
    if url:
        parsed = urlparse(url)
        if parsed.scheme == "file":
            path = Path(unquote(parsed.path))
            if not path.is_file():
                resolved = resolve_local_reference(fallback_source, parsed.path)
                if resolved is not None and resolved.is_file():
                    path = resolved
        elif parsed.scheme in {"http", "https"}:
            return {"source": url, "runtimeLine": line, "runtimeColumn": column}
    result: dict[str, Any] = {
        "source": str(path),
        "runtimeLine": line,
        "runtimeColumn": column,
    }
    if isinstance(line, int):
        span = _line_span(path, line)
        if span is not None:
            result["sourceSpan"] = span
    return {key: value for key, value in result.items() if value is not None}


def _normalize_runtime_state(raw: Any) -> dict[str, Any] | None:
    """规范化无文本、无输入值的轻量 DOM 状态，用于确定性状态图。"""
    if not isinstance(raw, dict):
        return None
    normalized: dict[str, Any] = {
        "locationHash": str(raw.get("locationHash") or "")[:256],
        "active": str(raw.get("active") or "")[:512],
    }
    for field in ("visible", "checked", "disabled", "expanded"):
        values = raw.get(field)
        if not isinstance(values, list):
            values = []
        normalized[field] = sorted({
            str(value)[:512] for value in values
            if isinstance(value, str) and value
        })
    return normalized


def _runtime_state_id(state: dict[str, Any]) -> str:
    payload = json.dumps(state, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return "state:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]


def _runtime_mode(trusted: bool, exercise: bool) -> str:
    if trusted and exercise:
        return "trusted-and-synthetic"
    if trusted:
        return "trusted-replay"
    if exercise:
        return "synthetic-exercise"
    return "passive-observation"


def _failure_pointer(
    scenario_id: str,
    *,
    kind: str,
    index: int | None = None,
    action_index: int | None = None,
    action: str | None = None,
    assertion: str | None = None,
    selector: str | None = None,
) -> dict[str, Any]:
    pointer: dict[str, Any] = {
        "scenarioId": scenario_id,
        "kind": kind,
        "requiresOriginalInput": True,
    }
    for key, value in (
        ("index", index), ("actionIndex", action_index), ("action", action),
        ("assertion", assertion), ("selector", selector),
    ):
        if value not in (None, ""):
            pointer[key] = value
    pointer["replayThroughAction"] = action_index if action_index is not None else index
    return pointer


class RuntimeSession:
    """Holds shared mutable state across scenarios in one observation run.

    Carries the accumulator dict, registration/candidate/state stores, and
    remaining action/assertion budgets so the scenario loop can be extracted
    from the orchestrator without passing a dozen closure variables.
    """

    def __init__(
        self,
        source: Path,
        result: dict[str, Any],
        *,
        exercise: bool,
        timeout_ms: int,
        settle_ms: int,
        max_exercises: int,
        max_actions: int,
        max_assertions: int,
        max_candidates: int,
        warnings: list[str],
    ) -> None:
        self.source = source
        self.result = result
        self.exercise = exercise
        self.timeout_ms = timeout_ms
        self.settle_ms = settle_ms
        self.max_exercises = max_exercises
        self.remaining_actions = max(0, max_actions)
        self.remaining_assertions = max(0, max_assertions)
        self.candidate_limit = max(0, max_candidates)
        self.warnings = warnings
        self.registrations_by_key: dict[tuple[Any, ...], dict[str, Any]] = {}
        self.candidates_by_key: dict[tuple[str, str], dict[str, Any]] = {}
        self.state_nodes_by_id: dict[str, dict[str, Any]] = {}
        self.state_edges: list[dict[str, Any]] = []

    def record_state(self, page: Any, scenario_id: str) -> str | None:
        raw_state = page.evaluate(
            "limit => window.__uiirRuntime ? window.__uiirRuntime.state(limit) : null",
            self.candidate_limit,
        )
        state = _normalize_runtime_state(raw_state)
        if state is None:
            return None
        state_id = _runtime_state_id(state)
        node = self.state_nodes_by_id.get(state_id)
        if node is None:
            node = {
                "id": state_id,
                "activeSelector": state["active"],
                "locationHash": state["locationHash"],
                "visibleCandidates": len(state["visible"]),
                "checkedCandidates": len(state["checked"]),
                "disabledCandidates": len(state["disabled"]),
                "expandedCandidates": len(state["expanded"]),
                "scenarioIds": [scenario_id],
                "observations": 1,
            }
            self.state_nodes_by_id[state_id] = node
        else:
            node["observations"] += 1
            node["scenarioIds"] = sorted(set(node["scenarioIds"] + [scenario_id]))
        return state_id


def run_scenarios(
    session: RuntimeSession,
    browser: Any,
    scenario_inputs: list[Any],
) -> None:
    """Iterate scenarios, running each against an isolated browser context.

    Mutates ``session`` in place: appends to ``session.result["scenarios"]``,
    fills ``session.registrations_by_key`` / ``candidates_by_key`` /
    ``state_nodes_by_id`` / ``state_edges``, and consumes the remaining
    action/assertion budgets.
    """
    seen_scenario_ids: set[str] = set()
    for scenario_index, raw_scenario in enumerate(scenario_inputs):
        _run_scenario(
            session,
            browser,
            scenario_index,
            raw_scenario,
            seen_scenario_ids,
        )


def _run_scenario(
    session: RuntimeSession,
    browser: Any,
    scenario_index: int,
    raw_scenario: Any,
    seen_scenario_ids: set[str],
) -> None:
    result = session.result
    warnings = session.warnings
    registrations_by_key = session.registrations_by_key
    candidates_by_key = session.candidates_by_key
    state_edges = session.state_edges
    fallback_id = f"scenario-{scenario_index + 1}"
    scenario_id = fallback_id
    scenario_result: dict[str, Any] = {
        "id": scenario_id,
        "status": "failed",
        "conditions": [],
        "actions": [],
        "assertions": [],
        "trustedActions": 0,
        "failedActions": 0,
        "skippedActions": 0,
        "passedAssertions": 0,
        "failedAssertions": 0,
        "registrations": 0,
        "invokedRegistrations": 0,
        "errors": [],
    }
    if not isinstance(raw_scenario, dict):
        scenario_result["error"] = "scenario 必须是 object"
        result["scenarios"].append(scenario_result)
        result["failureReplay"].append(
            _failure_pointer(scenario_id, kind="scenario", index=scenario_index)
        )
        return
    raw_id = raw_scenario.get("id", fallback_id)
    if isinstance(raw_id, str) and raw_id.strip():
        scenario_id = raw_id.strip()[:128]
        scenario_result["id"] = scenario_id
    else:
        scenario_result["error"] = "scenario id 必须是非空字符串"
        result["scenarios"].append(scenario_result)
        result["failureReplay"].append(
            _failure_pointer(scenario_id, kind="scenario", index=scenario_index)
        )
        return
    if scenario_id in seen_scenario_ids:
        scenario_result["error"] = f"scenario id 重复：{scenario_id}"
        result["scenarios"].append(scenario_result)
        result["failureReplay"].append(
            _failure_pointer(scenario_id, kind="scenario", index=scenario_index)
        )
        return
    seen_scenario_ids.add(scenario_id)
    if isinstance(raw_scenario.get("name"), str) and raw_scenario["name"].strip():
        scenario_result["name"] = raw_scenario["name"].strip()[:200]
    raw_actions = raw_scenario.get("actions", [])
    if not isinstance(raw_actions, list):
        scenario_result["error"] = "scenario actions 必须是 array"
        result["scenarios"].append(scenario_result)
        result["failureReplay"].append(
            _failure_pointer(scenario_id, kind="scenario", index=scenario_index)
        )
        return
    stop_on_failure = raw_scenario.get("stopOnFailure", False)
    if not isinstance(stop_on_failure, bool):
        scenario_result["error"] = "stopOnFailure 必须是 boolean"
        result["scenarios"].append(scenario_result)
        result["failureReplay"].append(
            _failure_pointer(scenario_id, kind="scenario", index=scenario_index)
        )
        return

    context = browser.new_context(service_workers="block")
    page = context.new_page()
    page.add_init_script(_INIT_SCRIPT)

    def route_request(route: Any) -> None:
        parsed = urlparse(route.request.url)
        if parsed.scheme in {"http", "https"}:
            route.abort()
            return
        if parsed.scheme == "file":
            requested = Path(unquote(parsed.path))
            if not requested.is_file():
                local_resource = resolve_local_reference(session.source, parsed.path)
                if local_resource is not None and local_resource.is_file():
                    route.fulfill(path=str(local_resource))
                    return
        route.continue_()

    page.route("**/*", route_request)
    try:
        page.goto(session.source.as_uri(), wait_until="domcontentloaded", timeout=session.timeout_ms)
        page.wait_for_timeout(max(0, session.settle_ms))
        current_state_id = session.record_state(page, scenario_id)
        if current_state_id is not None:
            scenario_result["initialState"] = current_state_id
        requested_conditions = _rule_list(raw_scenario.get("when"))
        condition_limit_hit = len(requested_conditions) > session.remaining_assertions
        if condition_limit_hit:
            warnings.append(
                f"场景 {scenario_id} 的条件受总上限限制，仅执行前 {session.remaining_assertions} 条"
            )
        condition_items = requested_conditions[:session.remaining_assertions]
        session.remaining_assertions -= len(condition_items)
        for condition_index, condition in enumerate(condition_items):
            scenario_result["conditions"].append(_evaluate_rule(
                page, condition, condition_index, session.timeout_ms, kind="condition"
            ))
        if condition_limit_hit:
            scenario_result["conditions"].append({
                "index": len(condition_items),
                "status": "failed",
                "condition": "limit",
                "selector": "",
                "error": "条件总上限已耗尽，场景未执行",
            })
            scenario_result["status"] = "failed"
            result["failureReplay"].append(
                _failure_pointer(scenario_id, kind="condition-limit")
            )
        elif any(
            item.get("status") != "passed"
            and item.get("reason") != "unmet"
            for item in scenario_result["conditions"]
        ):
            scenario_result["status"] = "failed"
            for condition_result in scenario_result["conditions"]:
                if (
                    condition_result.get("status") != "passed"
                    and condition_result.get("reason") != "unmet"
                ):
                    result["failureReplay"].append(_failure_pointer(
                        scenario_id,
                        kind="condition",
                        index=condition_result.get("index"),
                        selector=condition_result.get("selector"),
                    ))
        elif any(
            item.get("status") != "passed"
            for item in scenario_result["conditions"]
        ):
            scenario_result["status"] = "skipped"
        else:
            action_limit_hit = len(raw_actions) > session.remaining_actions
            if action_limit_hit:
                warnings.append(
                    f"场景 {scenario_id} 的动作受总上限限制，仅执行前 {session.remaining_actions} 条"
                )
                scenario_result["truncatedActions"] = len(raw_actions) - session.remaining_actions
                result["failureReplay"].append(
                    _failure_pointer(scenario_id, kind="action-limit")
                )
            selected_actions = raw_actions[:session.remaining_actions]
            session.remaining_actions -= len(selected_actions)
            failed_path = action_limit_hit
            for action_index, action in enumerate(selected_actions):
                action_failure_recorded = False
                requested_action_conditions = _rule_list(
                    action.get("when") if isinstance(action, dict) else None
                )
                action_condition_limit_hit = (
                    len(requested_action_conditions) > session.remaining_assertions
                )
                if action_condition_limit_hit:
                    warnings.append(
                        f"场景 {scenario_id} 动作 {action_index} 的条件受总上限限制"
                    )
                action_conditions = requested_action_conditions[:session.remaining_assertions]
                session.remaining_assertions -= len(action_conditions)
                evaluated_conditions = [
                    _evaluate_rule(
                        page, condition, index, session.timeout_ms, kind="condition"
                    )
                    for index, condition in enumerate(action_conditions)
                ]
                if action_condition_limit_hit:
                    evaluated_conditions.append({
                        "index": len(action_conditions),
                        "status": "failed",
                        "condition": "limit",
                        "selector": "",
                        "error": "条件总上限已耗尽，动作未执行",
                    })
                    action_result: dict[str, Any] = {
                        "index": action_index,
                        "status": "failed",
                        "action": str(action.get("action") or "") if isinstance(action, dict) else "",
                        "selector": str(action.get("selector") or "") if isinstance(action, dict) else "",
                        "conditions": evaluated_conditions,
                        "error": "动作条件未完整评估",
                    }
                    failed_path = True
                    result["failureReplay"].append(_failure_pointer(
                        scenario_id,
                        kind="action-condition-limit",
                        index=action_index,
                        action_index=action_index,
                        action=action_result.get("action"),
                        selector=action_result.get("selector"),
                    ))
                    action_failure_recorded = True
                elif any(
                    item.get("status") != "passed"
                    and item.get("reason") != "unmet"
                    for item in evaluated_conditions
                ):
                    action_result = {
                        "index": action_index,
                        "status": "failed",
                        "action": str(action.get("action") or "") if isinstance(action, dict) else "",
                        "selector": str(action.get("selector") or "") if isinstance(action, dict) else "",
                        "conditions": evaluated_conditions,
                        "error": "动作条件无效或无法评估",
                    }
                    failed_path = True
                    result["failureReplay"].append(_failure_pointer(
                        scenario_id,
                        kind="action-condition",
                        index=action_index,
                        action_index=action_index,
                        action=action_result.get("action"),
                        selector=action_result.get("selector"),
                    ))
                    action_failure_recorded = True
                elif any(
                    item.get("status") != "passed"
                    for item in evaluated_conditions
                ):
                    action_result = {
                        "index": action_index,
                        "status": "skipped",
                        "action": str(action.get("action") or "") if isinstance(action, dict) else "",
                        "selector": str(action.get("selector") or "") if isinstance(action, dict) else "",
                        "conditions": evaluated_conditions,
                    }
                else:
                    page.evaluate(
                        "() => window.__uiirRuntime ? window.__uiirRuntime.prepare() : 0"
                    )
                    action_result = _perform_trusted_action(
                        page, action, action_index, session.timeout_ms
                    )
                    if evaluated_conditions:
                        action_result["conditions"] = evaluated_conditions
                    requested_inline_assertions = _rule_list(
                        action.get("assertions") if isinstance(action, dict) else None
                    )
                    inline_limit_hit = (
                        len(requested_inline_assertions) > session.remaining_assertions
                    )
                    if inline_limit_hit:
                        warnings.append(
                            f"场景 {scenario_id} 动作 {action_index} 的断言受总上限限制"
                        )
                    inline_assertions = requested_inline_assertions[:session.remaining_assertions]
                    session.remaining_assertions -= len(inline_assertions)
                    if action_result.get("status") == "completed":
                        action_result["assertions"] = [
                            _evaluate_rule(
                                page, assertion, index, session.timeout_ms, kind="assertion"
                            )
                            for index, assertion in enumerate(inline_assertions)
                        ]
                        if inline_limit_hit:
                            action_result["assertions"].append({
                                "index": len(inline_assertions),
                                "status": "failed",
                                "assertion": "limit",
                                "selector": "",
                                "error": "断言总上限已耗尽",
                            })
                    if action_result.get("status") == "failed":
                        failed_path = True
                        if not action_failure_recorded:
                            result["failureReplay"].append(_failure_pointer(
                                scenario_id,
                                kind="action",
                                index=action_index,
                                action_index=action_index,
                                action=action_result.get("action"),
                                selector=action_result.get("selector"),
                            ))
                    for assertion_result in action_result.get("assertions") or []:
                        if assertion_result.get("status") != "passed":
                            failed_path = True
                            result["failureReplay"].append(_failure_pointer(
                                scenario_id,
                                kind="action-assertion",
                                index=assertion_result.get("index"),
                                action_index=action_index,
                                assertion=assertion_result.get("assertion"),
                                selector=assertion_result.get("selector"),
                            ))
                next_state_id = session.record_state(page, scenario_id)
                if current_state_id is not None:
                    action_result["fromState"] = current_state_id
                if next_state_id is not None:
                    action_result["toState"] = next_state_id
                if current_state_id is not None and next_state_id is not None:
                    action_result["stateChanged"] = current_state_id != next_state_id
                    state_edges.append({
                        "scenarioId": scenario_id,
                        "actionIndex": action_index,
                        "action": action_result.get("action", ""),
                        "selector": action_result.get("selector", ""),
                        "status": action_result.get("status", "failed"),
                        "fromState": current_state_id,
                        "toState": next_state_id,
                    })
                    current_state_id = next_state_id
                scenario_result["actions"].append(action_result)
                if stop_on_failure and failed_path:
                    scenario_result["stoppedAfterAction"] = action_index
                    break

            requested_final_assertions = _rule_list(raw_scenario.get("assertions"))
            final_limit_hit = len(requested_final_assertions) > session.remaining_assertions
            if final_limit_hit:
                warnings.append(
                    f"场景 {scenario_id} 的最终断言受总上限限制，仅执行前 {session.remaining_assertions} 条"
                )
            final_assertions = requested_final_assertions[:session.remaining_assertions]
            session.remaining_assertions -= len(final_assertions)
            scenario_result["assertions"] = [
                _evaluate_rule(
                    page, assertion, index, session.timeout_ms, kind="assertion"
                )
                for index, assertion in enumerate(final_assertions)
            ]
            if final_limit_hit:
                scenario_result["assertions"].append({
                    "index": len(final_assertions),
                    "status": "failed",
                    "assertion": "limit",
                    "selector": "",
                    "error": "断言总上限已耗尽",
                })
            for assertion_result in scenario_result["assertions"]:
                if assertion_result.get("status") != "passed":
                    failed_path = True
                    result["failureReplay"].append(_failure_pointer(
                        scenario_id,
                        kind="assertion",
                        index=assertion_result.get("index"),
                        action_index=(
                            len(scenario_result["actions"]) - 1
                            if scenario_result["actions"] else None
                        ),
                        assertion=assertion_result.get("assertion"),
                        selector=assertion_result.get("selector"),
                    ))
            if session.exercise:
                result["exercised"] += int(page.evaluate(
                    "limit => window.__uiirRuntime ? window.__uiirRuntime.exercise(limit) : 0",
                    max(0, session.max_exercises),
                ))
                page.wait_for_timeout(25)
            scenario_result["status"] = "failed" if failed_path else "completed"

        final_state_id = session.record_state(page, scenario_id)
        if final_state_id is not None:
            scenario_result["finalState"] = final_state_id
        snapshot = page.evaluate(
            "limit => window.__uiirRuntime ? window.__uiirRuntime.snapshot(limit) : null",
            session.candidate_limit,
        )
        if not isinstance(snapshot, dict):
            warnings.append(f"场景 {scenario_id} 未返回运行时观察快照")
        else:
            result["domCount"] = max(
                result["domCount"], int(snapshot.get("domCount") or 0)
            )
            page_errors = [str(value) for value in snapshot.get("errors") or []]
            scenario_result["errors"] = page_errors
            result["errors"].extend(
                f"{scenario_id}: {error}" for error in page_errors
            )
            if page_errors and scenario_result.get("status") == "completed":
                scenario_result["status"] = "failed"
                result["failureReplay"].append(
                    _failure_pointer(
                        scenario_id,
                        kind="page-error",
                        action_index=(
                            len(scenario_result["actions"]) - 1
                            if scenario_result["actions"] else None
                        ),
                    )
                )
            for raw_candidate in snapshot.get("candidates") or []:
                if not isinstance(raw_candidate, dict):
                    continue
                selector = str(raw_candidate.get("selector") or "")[:512]
                action = str(raw_candidate.get("action") or "")[:32]
                if not selector or not action:
                    continue
                candidate = {
                    "selector": selector,
                    "action": action,
                    "tag": str(raw_candidate.get("tag") or "")[:32],
                    "type": str(raw_candidate.get("type") or "")[:64],
                    "role": str(raw_candidate.get("role") or "")[:64],
                    "visible": bool(raw_candidate.get("visible")),
                    "disabled": bool(raw_candidate.get("disabled")),
                    "requiresInput": bool(raw_candidate.get("requiresInput")),
                    "sensitiveInput": bool(raw_candidate.get("sensitiveInput")),
                    "navigationRisk": bool(raw_candidate.get("navigationRisk")),
                    "inlineHandler": bool(raw_candidate.get("inlineHandler")),
                    "events": sorted({
                        str(value)[:64] for value in raw_candidate.get("events") or []
                        if isinstance(value, str) and value
                    }),
                    "scenarioIds": [scenario_id],
                }
                key = (selector, action)
                existing_candidate = candidates_by_key.get(key)
                if existing_candidate is None:
                    candidates_by_key[key] = candidate
                else:
                    existing_candidate["visible"] = existing_candidate["visible"] or candidate["visible"]
                    existing_candidate["disabled"] = existing_candidate["disabled"] and candidate["disabled"]
                    for field in ("requiresInput", "sensitiveInput", "navigationRisk", "inlineHandler"):
                        existing_candidate[field] = existing_candidate[field] or candidate[field]
                    existing_candidate["events"] = sorted(set(existing_candidate["events"] + candidate["events"]))
                    existing_candidate["scenarioIds"] = sorted(set(existing_candidate["scenarioIds"] + [scenario_id]))

            scenario_registrations: list[dict[str, Any]] = []
            trusted = any(
                item.get("status") == "completed"
                for item in scenario_result["actions"]
            )
            mode = _runtime_mode(trusted, session.exercise)
            for item in snapshot.get("registrations") or []:
                if not isinstance(item, dict):
                    continue
                selector = str(item.get("selector") or "")
                event = str(item.get("event") or "")
                if not selector or not event:
                    continue
                location = _normalize_location(item.get("location"), session.source)
                registration = {
                    "selector": selector,
                    "event": event,
                    "api": str(item.get("api") or "runtime"),
                    "options": item.get("options") if isinstance(item.get("options"), dict) else {},
                    "invocationCount": max(0, int(item.get("invocationCount") or 0)),
                    "runtimeMode": mode,
                    "scenarioIds": [scenario_id],
                    "invokedScenarioIds": (
                        [scenario_id] if int(item.get("invocationCount") or 0) > 0 else []
                    ),
                    **location,
                }
                scenario_registrations.append(registration)
                key = _registration_key(registration)
                existing = registrations_by_key.get(key)
                if existing is None:
                    registrations_by_key[key] = registration
                else:
                    existing["invocationCount"] += registration["invocationCount"]
                    for field in ("scenarioIds", "invokedScenarioIds"):
                        existing[field] = sorted(set(existing[field] + registration[field]))
                    modes = {existing.get("runtimeMode"), registration.get("runtimeMode")}
                    if "trusted-and-synthetic" in modes or (
                        "trusted-replay" in modes and "synthetic-exercise" in modes
                    ):
                        existing["runtimeMode"] = "trusted-and-synthetic"
                    elif "trusted-replay" in modes:
                        existing["runtimeMode"] = "trusted-replay"
                    elif "synthetic-exercise" in modes:
                        existing["runtimeMode"] = "synthetic-exercise"
            scenario_result["registrations"] = len(scenario_registrations)
            scenario_result["invokedRegistrations"] = sum(
                1 for item in scenario_registrations
                if item.get("invocationCount", 0) > 0
            )
    except Exception as exc:
        scenario_result["status"] = "failed"
        scenario_result["error"] = _bounded_error(exc)
        result["failureReplay"].append(
            _failure_pointer(scenario_id, kind="scenario", index=scenario_index)
        )
    finally:
        context.close()

    for action_result in scenario_result["actions"]:
        action_result["scenarioId"] = scenario_id
        result["actions"].append(action_result)
        status = action_result.get("status")
        if status == "completed":
            scenario_result["trustedActions"] += 1
            result["trustedActions"] += 1
        elif status == "skipped":
            scenario_result["skippedActions"] += 1
            result["skippedActions"] += 1
        else:
            scenario_result["failedActions"] += 1
            result["failedActions"] += 1
        for assertion_result in action_result.get("assertions") or []:
            if assertion_result.get("status") == "passed":
                scenario_result["passedAssertions"] += 1
                result["passedAssertions"] += 1
            else:
                scenario_result["failedAssertions"] += 1
                result["failedAssertions"] += 1
    for assertion_result in scenario_result["assertions"]:
        if assertion_result.get("status") == "passed":
            scenario_result["passedAssertions"] += 1
            result["passedAssertions"] += 1
        else:
            scenario_result["failedAssertions"] += 1
            result["failedAssertions"] += 1
    result["scenarios"].append(scenario_result)
