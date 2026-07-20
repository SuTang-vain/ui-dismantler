"""交互清单与场景矩阵之间的确定性覆盖率工具。"""

from __future__ import annotations

import json
import re
from typing import Iterable


def interaction_fingerprint(interaction: dict) -> str:
    """生成稳定的交互引用；字段顺序不影响结果。"""
    fields = {
        key: str(interaction.get(key, ""))
        for key in ("type", "trigger", "target", "handler", "action")
        if interaction.get(key) not in (None, "", [])
    }
    return json.dumps(fields, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def interaction_label(interaction: dict) -> str:
    action = interaction.get("action") or interaction.get("handler") or interaction.get("type", "interaction")
    trigger = interaction.get("trigger", "")
    target = interaction.get("target", "")
    return " ".join(str(value) for value in (action, trigger, target) if value)


def _selector_values(value: object) -> set[str]:
    if isinstance(value, str) and value:
        return {value}
    if isinstance(value, dict):
        return {
            item for key in ("default", "reference", "library")
            for item in _selector_values(value.get(key))
        }
    return set()


def _scenario_targets(scenario: dict) -> set[str]:
    targets: set[str] = set()
    for step in scenario.get("steps", []):
        if isinstance(step, dict):
            targets.update(_selector_values(step.get("target")))
    for assertion in scenario.get("assertions", []):
        if isinstance(assertion, dict):
            targets.update(_selector_values(assertion.get("target")))
    return targets


def _scenario_triggers(scenario: dict) -> set[str]:
    triggers: set[str] = set()
    for step in scenario.get("steps", []):
        action = step.get("action") if isinstance(step, dict) else None
        if action == "click":
            triggers.add("click")
        elif action == "input":
            triggers.update(("input", "change"))
        elif action == "key":
            triggers.update(("key", "keydown", "keyup"))
        elif action == "wait":
            triggers.add("wait")
    return triggers


def _explicit_covers(scenario: dict) -> set[str]:
    covers = scenario.get("covers", [])
    return {item for item in covers if isinstance(item, str) and item}


def _action_matches(interaction: dict, scenario: dict) -> bool:
    action = str(interaction.get("action", "")).lower()
    handler = str(interaction.get("handler", "")).lower()
    scenario_text = json.dumps(scenario, ensure_ascii=False).lower()
    aliases = [token for token in (action, handler) if token]
    return any(token in scenario_text for token in aliases)


def scenario_covers_interaction(scenario: dict, interaction: dict) -> bool:
    """判断单个场景是否覆盖一个 manifest 交互。

    自动生成的候选优先使用 ``covers`` 精确引用；手写场景则按 selector、触发器
    和动作名做保守匹配，避免仅仅因为页面里有一个按钮就虚报覆盖。
    """
    fingerprint = interaction_fingerprint(interaction)
    if fingerprint in _explicit_covers(scenario):
        return True

    target = str(interaction.get("target", ""))
    trigger = str(interaction.get("trigger", "")).lower()
    targets = _scenario_targets(scenario)
    triggers = _scenario_triggers(scenario)
    if target and target not in ("document", "window") and target not in targets:
        return False
    if trigger in ("documentloaded", "domcontentloaded"):
        return bool(scenario.get("steps")) and "wait" in triggers
    if trigger in ("keydown", "keyup"):
        trigger_match = "key" in triggers or trigger in triggers
    else:
        trigger_match = trigger in triggers or (trigger == "submit" and "click" in triggers)
    if not trigger_match:
        return False
    if interaction.get("type") == "explicit-handler":
        return bool(scenario.get("assertions"))
    return _action_matches(interaction, scenario) or bool(scenario.get("assertions"))


def compute_interaction_coverage(
    interactions: Iterable[dict],
    scenarios: Iterable[dict],
    *,
    include_candidates: bool = False,
) -> dict:
    interactions = [item for item in interactions if isinstance(item, dict)]
    scenarios = [
        item for item in scenarios
        if isinstance(item, dict) and (include_candidates or not item.get("candidate", False))
    ]
    covered: list[dict] = []
    uncovered: list[dict] = []
    for index, interaction in enumerate(interactions):
        entry = {
            "index": index,
            "fingerprint": interaction_fingerprint(interaction),
            "label": interaction_label(interaction),
            "type": interaction.get("type"),
            "trigger": interaction.get("trigger"),
            "target": interaction.get("target"),
        }
        matching = [scenario.get("id") for scenario in scenarios if scenario_covers_interaction(scenario, interaction)]
        if matching:
            entry["scenarios"] = matching
            covered.append(entry)
        else:
            uncovered.append(entry)
    total = len(interactions)
    return {
        "schemaVersion": "1.0",
        "identified": total,
        "covered": len(covered),
        "uncovered": len(uncovered),
        "rate": round(len(covered) / total, 3) if total else 1.0,
        "coveredInteractions": covered,
        "uncoveredInteractions": uncovered,
    }


def slugify_scenario(value: str, fallback: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return value or fallback
