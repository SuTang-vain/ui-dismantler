"""Compact projection: lossy observation for agent first-pass understanding."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from ..schema import _nodes_by_type
from ..validation import validate_uiir


def uiir_to_compact_observation(document: dict[str, Any]) -> dict[str, Any]:
    """生成面向 Agent 首轮理解的有损紧凑观察，不替代 canonical UI-IR。"""
    errors = validate_uiir(document)
    if errors:
        raise ValueError("无效 UI-IR：" + "; ".join(errors))

    nodes = document["nodes"]
    node_type_names = document["nodeTypes"]
    relation_names = document["relationTypes"]
    page = _nodes_by_type(document, "page")[0]
    page_props = page[3]

    compact_edges = [
        edge for edge in document["edges"]
        if relation_names[edge[1]] != "responds"
        and not (len(edge) == 4 and edge[3].get("sourceOnly"))
        and not nodes[edge[0]][3].get("sourceOnly")
        and not nodes[edge[2]][3].get("sourceOnly")
    ]
    referenced_ids = {endpoint for edge in compact_edges for endpoint in (edge[0], edge[2])}
    entity_ids: list[int] = []
    for node in nodes:
        node_id, type_index, _, props = node
        node_type = node_type_names[type_index]
        if props.get("sourceOnly"):
            continue
        if (
            node_type in {"region", "component", "state"}
            or (node_type == "data" and props.get("kind") == "dataset")
            or node_id in referenced_ids
        ):
            entity_ids.append(node_id)
    entity_index = {node_id: index for index, node_id in enumerate(entity_ids)}

    entities: list[list[Any]] = []
    summary_fields = ("kind", "name", "label", "reference", "id", "title", "active", "count")
    for node_id in entity_ids:
        _, type_index, parent_id, props = nodes[node_id]
        summary = {key: deepcopy(props[key]) for key in summary_fields if key in props}
        parent_ref = entity_index.get(parent_id, -1)
        entities.append([props["key"], node_type_names[type_index], parent_ref, summary])

    relations: list[list[Any]] = []
    edge_summary_fields = ("label", "event", "interactionType", "inferred")
    for edge in compact_edges:
        if edge[0] not in entity_index or edge[2] not in entity_index:
            continue
        compact_edge: list[Any] = [
            entity_index[edge[0]],
            relation_names[edge[1]],
            entity_index[edge[2]],
        ]
        if len(edge) == 4:
            props = {key: deepcopy(edge[3][key]) for key in edge_summary_fields if key in edge[3]}
            if props:
                compact_edge.append(props)
        relations.append(compact_edge)

    token_rows: list[list[Any]] = []
    for node in _nodes_by_type(document, "token"):
        props = node[3]
        row: list[Any] = [props.get("name") or props.get("selector"), props.get("value")]
        roles = props.get("roles") or props.get("usage")
        if roles:
            row.append(deepcopy(roles))
        token_rows.append(row)

    datasets: list[list[Any]] = []
    for node in _nodes_by_type(document, "data"):
        props = node[3]
        if props.get("kind") == "dataset":
            datasets.append([props.get("name"), props.get("count", 0), deepcopy(props.get("fields") or [])])

    breakpoints: list[list[Any]] = []
    for node in _nodes_by_type(document, "breakpoint"):
        props = node[3]
        changes = props.get("changes") or []
        breakpoints.append([props.get("breakpoint"), len(changes)])

    active_a11y = [
        key for key, value in (page_props.get("a11y") or {}).items()
        if value is True
    ]
    compact: dict[str, Any] = {
        "schemaVersion": "2.0-compact",
        "sourceSchemaVersion": document.get("sourceSchemaVersion", "1.0"),
        "lossy": True,
        "page": {
            "title": page_props.get("title", ""),
            "pattern": page_props.get("pattern"),
            "canvas": (page_props.get("meta") or {}).get("canvas"),
        },
        "tokens": token_rows,
        "entities": entities,
        "relations": relations,
        "datasets": datasets,
        "breakpoints": breakpoints,
        "a11y": active_a11y,
    }
    warnings = (document.get("diagnostics") or {}).get("warnings") or []
    if warnings:
        compact["warnings"] = deepcopy(warnings)
    return compact
