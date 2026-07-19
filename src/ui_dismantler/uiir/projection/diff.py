"""Diff projection: compare two UI-IR documents for debugging."""

from __future__ import annotations

from copy import deepcopy
import json
from typing import Any

from .expanded import uiir_to_expanded_observation


def _diff_entity_view(entity: dict[str, Any]) -> dict[str, Any]:
    view: dict[str, Any] = {
        "key": entity["key"],
        "type": entity["type"],
        "parent": entity.get("parent"),
        "props": deepcopy(entity.get("props") or {}),
    }
    if "evidence" in entity:
        view["evidence"] = deepcopy(entity["evidence"])
    return view


def _diff_relation_view(relation: dict[str, Any]) -> dict[str, Any]:
    view: dict[str, Any] = {
        "source": relation["source"],
        "relation": relation["relation"],
        "target": relation["target"],
    }
    if "props" in relation:
        view["props"] = deepcopy(relation["props"])
    return view


def _json_signature(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def diff_uiir_observation(
    before: dict[str, Any],
    after: dict[str, Any],
) -> dict[str, Any]:
    """按 stable key 比较两个 canonical UI-IR，忽略文档内 id 位移。"""
    before_expanded = uiir_to_expanded_observation(before)
    after_expanded = uiir_to_expanded_observation(after)

    before_entities = {
        entity["key"]: _diff_entity_view(entity)
        for entity in before_expanded["entities"]
    }
    after_entities = {
        entity["key"]: _diff_entity_view(entity)
        for entity in after_expanded["entities"]
    }
    before_keys = set(before_entities)
    after_keys = set(after_entities)

    added_entities = [after_entities[key] for key in sorted(after_keys - before_keys)]
    removed_entities = [before_entities[key] for key in sorted(before_keys - after_keys)]
    changed_entities: list[dict[str, Any]] = []
    for key in sorted(before_keys & after_keys):
        old = before_entities[key]
        new = after_entities[key]
        changed_fields = [
            field for field in ("type", "parent", "props", "evidence")
            if old.get(field) != new.get(field)
        ]
        if not changed_fields:
            continue
        changed_entities.append({
            "key": key,
            "fields": changed_fields,
            "before": {field: deepcopy(old.get(field)) for field in changed_fields},
            "after": {field: deepcopy(new.get(field)) for field in changed_fields},
        })

    before_relations = {
        _json_signature(view): view
        for view in map(_diff_relation_view, before_expanded["relations"])
    }
    after_relations = {
        _json_signature(view): view
        for view in map(_diff_relation_view, after_expanded["relations"])
    }
    added_relations = [
        after_relations[signature]
        for signature in sorted(set(after_relations) - set(before_relations))
    ]
    removed_relations = [
        before_relations[signature]
        for signature in sorted(set(before_relations) - set(after_relations))
    ]

    diagnostics_changed = before.get("diagnostics") != after.get("diagnostics")
    summary = {
        "entitiesAdded": len(added_entities),
        "entitiesRemoved": len(removed_entities),
        "entitiesChanged": len(changed_entities),
        "relationsAdded": len(added_relations),
        "relationsRemoved": len(removed_relations),
        "diagnosticsChanged": diagnostics_changed,
    }
    result: dict[str, Any] = {
        "schemaVersion": "2.0-diff",
        "projection": "diff",
        "lossy": False,
        "hasChanges": any(
            value for key, value in summary.items()
            if key != "diagnosticsChanged"
        ) or diagnostics_changed,
        "sourceSchemaVersions": {
            "before": before.get("sourceSchemaVersion", "1.0"),
            "after": after.get("sourceSchemaVersion", "1.0"),
        },
        "summary": summary,
        "entities": {
            "added": added_entities,
            "removed": removed_entities,
            "changed": changed_entities,
        },
        "relations": {
            "added": added_relations,
            "removed": removed_relations,
        },
    }
    if diagnostics_changed:
        result["diagnostics"] = {
            "before": deepcopy(before.get("diagnostics")),
            "after": deepcopy(after.get("diagnostics")),
        }
    return result
