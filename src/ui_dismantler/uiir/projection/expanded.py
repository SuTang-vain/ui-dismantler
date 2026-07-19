"""Expanded projection: semantic, evidence-expanded lossless observation."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from ..schema import expand_uiir_evidence
from ..validation import validate_uiir


def uiir_to_expanded_observation(document: dict[str, Any]) -> dict[str, Any]:
    """生成语义可读、证据已展开的无损观察，便于调试和后续 diff。"""
    errors = validate_uiir(document)
    if errors:
        raise ValueError("无效 UI-IR：" + "; ".join(errors))

    node_types = document["nodeTypes"]
    relation_types = document["relationTypes"]
    nodes_by_id = {node[0]: node for node in document["nodes"]}
    evidence = expand_uiir_evidence(document)

    entities: list[dict[str, Any]] = []
    for node_id, type_index, parent_id, props in document["nodes"]:
        parent_key = None
        if parent_id is not None:
            parent_key = nodes_by_id[parent_id][3]["key"]
        entity: dict[str, Any] = {
            "id": node_id,
            "key": props["key"],
            "type": node_types[type_index],
            "parentId": parent_id,
            "parent": parent_key,
            "props": {
                key: deepcopy(value)
                for key, value in props.items()
                if key != "key"
            },
        }
        if str(node_id) in evidence:
            entity["evidence"] = evidence[str(node_id)]
        entities.append(entity)

    relations: list[dict[str, Any]] = []
    for edge in document["edges"]:
        source_id, relation_index, target_id = edge[:3]
        relation: dict[str, Any] = {
            "sourceId": source_id,
            "source": nodes_by_id[source_id][3]["key"],
            "relation": relation_types[relation_index],
            "targetId": target_id,
            "target": nodes_by_id[target_id][3]["key"],
        }
        if len(edge) == 4:
            relation["props"] = deepcopy(edge[3])
        relations.append(relation)

    expanded: dict[str, Any] = {
        "schemaVersion": "2.0-expanded",
        "sourceSchemaVersion": document.get("sourceSchemaVersion", "1.0"),
        "projection": "expanded",
        "lossy": False,
        "counts": {
            "entities": len(entities),
            "relations": len(relations),
            "evidenceRecords": len(evidence),
        },
        "entities": entities,
        "relations": relations,
    }
    diagnostics = document.get("diagnostics")
    if diagnostics:
        expanded["diagnostics"] = deepcopy(diagnostics)
    return expanded
