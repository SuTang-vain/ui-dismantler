"""Scenario candidate generator from analyzer manifest.

从 analyzer manifest 生成可审阅的交互场景候选。

候选场景严格遵守 schemaVersion=1.0，但使用 ``candidate: true`` 标记，
并通过 ``covers`` 保存交互 fingerprint。它们用于启动场景设计，不会被
覆盖率门禁计入，直到人工补齐有效断言并移除 candidate 标记。

业务逻辑层：本模块提供 ``generate()`` 函数，不含 CLI 入口。
CLI 入口见 ``ui_dismantler.cli.generate_scenarios``。
"""

from __future__ import annotations

from ui_dismantler.evaluation.scenario_coverage import interaction_fingerprint, slugify_scenario


def _target_selector(interaction: dict) -> str:
    target = interaction.get("target")
    return target if isinstance(target, str) and target not in ("document", "window") else "body"


def _candidate_for(interaction: dict, index: int) -> dict:
    trigger = str(interaction.get("trigger", "click")).lower()
    action = str(interaction.get("action") or interaction.get("handler") or "interaction")
    target = _target_selector(interaction)
    if trigger in {"keydown", "keyup"}:
        key = "Escape" if "escape" in action.lower() else "Enter"
        steps = [{"action": "key", "target": target, "key": key}]
    elif trigger in {"input", "change"}:
        steps = [{"action": "input", "target": target, "value": "sample"}]
    elif trigger in {"domcontentloaded", "resize", "scroll"}:
        steps = [{"action": "wait", "ms": 100}]
    else:
        steps = [{"action": "click", "target": target}]
    scenario_id = slugify_scenario(
        f"{action}-{trigger}-{index + 1}", f"interaction-{index + 1}"
    )
    return {
        "id": scenario_id,
        "label": f"Candidate: {action} ({trigger})",
        "candidate": True,
        "covers": [interaction_fingerprint(interaction)],
        "notes": [
            "人工确认 selector 是否命中预期控件",
            "补充证明状态真实发生的 assertions",
            "确认后移除 candidate 标记再纳入覆盖率门禁",
        ],
        "steps": steps,
        "assertions": [{"target": target, "visible": True}],
    }


def generate(manifest: dict) -> dict:
    interactions = manifest.get("interactions", [])
    if not isinstance(interactions, list):
        raise ValueError("manifest.interactions 必须是数组")
    scenarios = [
        _candidate_for(item, index)
        for index, item in enumerate(interactions)
        if isinstance(item, dict)
    ]
    return {
        "schemaVersion": "1.0",
        "generatedFrom": manifest.get("meta", {}).get("source"),
        "candidatePolicy": "candidate scenarios are excluded from coverage until reviewed",
        "scenarios": scenarios,
    }
