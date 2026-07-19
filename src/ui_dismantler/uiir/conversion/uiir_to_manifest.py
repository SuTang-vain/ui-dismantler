"""Convert canonical UI-IR v2 -> manifest v1 (reverse projection)."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from ..schema import _decode_table, _nodes_by_type, _strip_props
from ..validation import validate_uiir


def uiir_to_manifest(document: dict[str, Any]) -> dict[str, Any]:
    """把 canonical UI-IR v2 投影回 manifest v1 兼容结构。"""
    errors = validate_uiir(document)
    if errors:
        raise ValueError("无效 UI-IR：" + "; ".join(errors))

    page_nodes = _nodes_by_type(document, "page")
    if len(page_nodes) != 1:
        raise ValueError(f"UI-IR 必须且只能包含一个 page 节点，当前为 {len(page_nodes)}")
    page_props = page_nodes[0][3]
    extras = page_props.get("manifestExtras") or {}

    meta = deepcopy(page_props.get("meta") or {})
    meta["title"] = deepcopy(page_props.get("title", ""))

    theme = deepcopy(extras.get("theme") or {})
    tokens: list[dict[str, Any]] = []
    gradients: list[dict[str, Any]] = []
    for node in _nodes_by_type(document, "token"):
        props = node[3]
        kind = props.get("kind")
        value = _strip_props(props, "kind")
        if kind == "gradient":
            gradients.append(value)
        else:
            tokens.append(value)
    theme["tokens"] = tokens
    theme["gradients"] = gradients

    structure = deepcopy(extras.get("structure") or {})
    structure["pattern"] = deepcopy(page_props.get("pattern"))
    tabs: list[dict[str, Any]] = []
    views: list[dict[str, Any]] = []
    modals: list[dict[str, Any]] = []
    story_panels: list[dict[str, Any]] = []
    for node in _nodes_by_type(document, "component"):
        props = node[3]
        role = props.get("role")
        kind = props.get("kind")
        value = _strip_props(props, "kind", "role")
        if role == "tab":
            tabs.append(value)
        elif role == "view":
            views.append(value)
        elif kind == "modal":
            modals.append(value)
        elif kind == "story-panel":
            story_panels.append(value)
    structure["tabs"] = tabs
    structure["views"] = views
    structure["modals"] = modals
    structure["storyPanels"] = story_panels

    data: dict[str, Any] = {}
    nodes_by_id = {node[0]: node for node in document["nodes"]}
    relation_index = document["relationTypes"].index("references")
    dataset_nodes = [
        node for node in _nodes_by_type(document, "data")
        if node[3].get("kind") == "dataset"
    ]
    for dataset_node in dataset_nodes:
        props = dataset_node[3]
        name = props.get("name")
        if not isinstance(name, str) or not name:
            continue
        source_was_array = props.get("sourceWasArray", True)
        if props.get("storage") == "edges":
            records: list[tuple[int, dict[str, Any]]] = []
            for edge in document["edges"]:
                if edge[1] != relation_index or len(edge) != 4 or edge[3].get("dataset") != name:
                    continue
                source_props = nodes_by_id[edge[0]][3]
                target_props = nodes_by_id[edge[2]][3]
                source_ref = source_props.get("row", source_props.get("reference"))
                target_ref = target_props.get("row", target_props.get("reference"))
                edge_props = edge[3]
                record = {
                    "from": deepcopy(source_ref),
                    "to": deepcopy(target_ref),
                    **{
                        key: deepcopy(value)
                        for key, value in edge_props.items()
                        if key not in {"dataset", "index"}
                    },
                }
                records.append((int(edge_props.get("index", len(records))), record))
            records.sort(key=lambda item: item[0])
            values: list[Any] = [record for _, record in records]
        else:
            values = _decode_table(props)
        data[name] = values if source_was_array else (values[0] if values else None)

    interactions: list[dict[str, Any]] = []
    interaction_nodes = [
        node for node in _nodes_by_type(document, "state")
        if node[3].get("kind") == "interaction" and not node[3].get("sourceOnly")
    ]
    interaction_nodes.sort(key=lambda node: node[3].get("index", node[0]))
    for node in interaction_nodes:
        interactions.append(_strip_props(node[3], "kind", "index"))

    responsive: list[dict[str, Any]] = []
    breakpoint_nodes = _nodes_by_type(document, "breakpoint")
    breakpoint_nodes.sort(key=lambda node: node[3].get("index", node[0]))
    for node in breakpoint_nodes:
        if node[3].get("sourceOnly"):
            continue
        responsive.append(
            _strip_props(
                node[3],
                "index",
                "changesStructured",
                "unparsedChangeIndexes",
                "responsiveSource",
                "cssChangeCount",
                "cssObservedChangeCount",
                "sourceOnly",
            )
        )

    result = deepcopy(extras.get("top") or {})
    result.update({
        "schemaVersion": document.get("sourceSchemaVersion", "1.0"),
        "meta": meta,
        "theme": theme,
        "structure": structure,
        "data": data,
        "interactions": interactions,
        "responsive": responsive,
        "a11y": deepcopy(page_props.get("a11y") or {}),
        "warnings": deepcopy((document.get("diagnostics") or {}).get("warnings") or []),
    })
    return result
