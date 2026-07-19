"""Validate canonical UI-IR v2 document structure and reference integrity."""

from __future__ import annotations

import json
from typing import Any

from .schema import (
    NODE_TYPES,
    RELATION_TYPES,
    UIIR_FORMAT,
    UIIR_SCHEMA_VERSION,
    _NODE_TYPE_INDEX,
    _EVIDENCE_LIST_STRING_FIELDS,
)


def validate_uiir(document: dict[str, Any]) -> list[str]:
    """执行无第三方依赖的结构与引用完整性验证。"""
    errors: list[str] = []
    if not isinstance(document, dict):
        return ["UI-IR 根节点必须是 object"]
    if document.get("schemaVersion") != UIIR_SCHEMA_VERSION:
        errors.append(f"schemaVersion 必须为 {UIIR_SCHEMA_VERSION}")
    if document.get("format") != UIIR_FORMAT:
        errors.append(f"format 必须为 {UIIR_FORMAT}")
    if document.get("nodeTypes") != list(NODE_TYPES):
        errors.append("nodeTypes 与 UI-IR v2 固定枚举不一致")
    if document.get("relationTypes") != list(RELATION_TYPES):
        errors.append("relationTypes 与 UI-IR v2 固定枚举不一致")

    raw_strings = document.get("strings", [])
    if not isinstance(raw_strings, list):
        errors.append("strings 必须是 array")
        strings: list[str] = []
    else:
        strings = []
        seen_strings: set[str] = set()
        for index, value in enumerate(raw_strings):
            if not isinstance(value, str) or not value:
                errors.append(f"strings[{index}] 必须是非空 string")
                continue
            if value in seen_strings:
                errors.append(f"strings[{index}] 与已有字符串重复")
            else:
                seen_strings.add(value)
            strings.append(value)

    def valid_string_ref(value: Any, field: str) -> bool:
        if isinstance(value, str) and value:
            return True
        if (
            isinstance(value, int)
            and not isinstance(value, bool)
            and 0 <= value < len(strings)
        ):
            return True
        errors.append(f"{field} 必须是非空 string 或有效 string table 引用")
        return False

    nodes = document.get("nodes")
    edges = document.get("edges")
    if not isinstance(nodes, list):
        errors.append("nodes 必须是 array")
        nodes = []
    if not isinstance(edges, list):
        errors.append("edges 必须是 array")
        edges = []

    valid_ids: set[int] = set()
    parents: dict[int, int | None] = {}
    keys: set[str] = set()
    for index, node in enumerate(nodes):
        if not isinstance(node, list) or len(node) != 4:
            errors.append(f"nodes[{index}] 必须是四元组")
            continue
        node_id, type_index, parent, props = node
        if not isinstance(node_id, int) or node_id != index:
            errors.append(f"nodes[{index}] id 必须等于其数组下标")
            continue
        valid_ids.add(node_id)
        if not isinstance(type_index, int) or not 0 <= type_index < len(NODE_TYPES):
            errors.append(f"nodes[{index}] typeIndex 越界")
        if parent is not None and not isinstance(parent, int):
            errors.append(f"nodes[{index}] parentId 必须是 integer 或 null")
            parents[node_id] = None
        else:
            parents[node_id] = parent
        if not isinstance(props, dict):
            errors.append(f"nodes[{index}] props 必须是 object")
        else:
            key = props.get("key")
            if not isinstance(key, str) or not key:
                errors.append(f"nodes[{index}] 缺少稳定 key")
            elif key in keys:
                errors.append(f"nodes[{index}] stable key 重复：{key}")
            else:
                keys.add(key)

    page_type_index = _NODE_TYPE_INDEX["page"]
    page_nodes = [
        node for node in nodes
        if isinstance(node, list) and len(node) == 4 and node[1] == page_type_index
    ]
    if len(page_nodes) != 1:
        errors.append(f"canonical UI-IR 必须且只能包含一个 page 节点，当前为 {len(page_nodes)}")
    elif page_nodes[0][2] is not None:
        errors.append("page 节点的 parentId 必须为 null")

    for node_id, parent in parents.items():
        if parent is not None and parent not in valid_ids:
            errors.append(f"nodes[{node_id}] parentId 指向不存在节点：{parent}")
        seen: set[int] = set()
        cursor: int | None = node_id
        while cursor is not None and cursor in parents:
            if cursor in seen:
                errors.append(f"nodes[{node_id}] parent 链存在循环")
                break
            seen.add(cursor)
            cursor = parents[cursor]

    edge_signatures: set[str] = set()
    for index, edge in enumerate(edges):
        if not isinstance(edge, list) or len(edge) not in (3, 4):
            errors.append(f"edges[{index}] 必须是三元组或四元组")
            continue
        source, relation_index, target = edge[:3]
        if not isinstance(source, int):
            errors.append(f"edges[{index}] source 必须是 integer")
        elif source not in valid_ids:
            errors.append(f"edges[{index}] source 指向不存在节点：{source}")
        if not isinstance(target, int):
            errors.append(f"edges[{index}] target 必须是 integer")
        elif target not in valid_ids:
            errors.append(f"edges[{index}] target 指向不存在节点：{target}")
        if not isinstance(relation_index, int) or not 0 <= relation_index < len(RELATION_TYPES):
            errors.append(f"edges[{index}] relationIndex 越界")
        if len(edge) == 4 and not isinstance(edge[3], dict):
            errors.append(f"edges[{index}] props 必须是 object")
        try:
            signature = json.dumps(edge, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        except (TypeError, ValueError):
            errors.append(f"edges[{index}] 包含不可序列化值")
        else:
            if signature in edge_signatures:
                errors.append(f"edges[{index}] 与已有关系重复")
            edge_signatures.add(signature)

    evidence = document.get("evidence", {})
    if not isinstance(evidence, dict):
        errors.append("evidence 必须是 object")
    else:
        for node_id, record in evidence.items():
            if not str(node_id).isdigit() or int(node_id) not in valid_ids:
                errors.append(f"evidence 引用了不存在节点：{node_id}")
            if not isinstance(record, dict):
                errors.append(f"evidence[{node_id}] 必须是 object")
                continue
            source = record.get("source")
            if source is not None:
                valid_string_ref(source, f"evidence[{node_id}].source")
            observations = record.get("observations")
            if not isinstance(observations, list) or not observations:
                errors.append(f"evidence[{node_id}].observations 必须是非空 array")
                continue
            for observation_index, observation in enumerate(observations):
                prefix = f"evidence[{node_id}].observations[{observation_index}]"
                if not isinstance(observation, dict):
                    errors.append(f"{prefix} 必须是 object")
                    continue
                valid_string_ref(observation.get("method"), f"{prefix}.method")
                manifest_path = observation.get("manifestPath")
                source_span = observation.get("sourceSpan")
                if manifest_path is not None:
                    valid_string_ref(manifest_path, f"{prefix}.manifestPath")
                valid_source_span = (
                    isinstance(source_span, list)
                    and len(source_span) == 2
                    and all(
                        isinstance(value, int)
                        and not isinstance(value, bool)
                        and value >= 0
                        for value in source_span
                    )
                    and source_span[0] <= source_span[1]
                )
                if source_span is not None and not valid_source_span:
                    errors.append(f"{prefix}.sourceSpan 必须是递增的两个非负整数")
                runtime_value = observation.get("runtimeObserved")
                runtime_observed = runtime_value is True
                if "runtimeObserved" in observation and not isinstance(runtime_value, bool):
                    errors.append(f"{prefix}.runtimeObserved 必须是 boolean")
                if manifest_path is None and source_span is None and not runtime_observed:
                    errors.append(
                        f"{prefix} 必须包含 manifestPath、sourceSpan 或 runtimeObserved=true"
                    )
                for field, minimum in (("runtimeLine", 1), ("runtimeColumn", 0), ("invocationCount", 0)):
                    if field not in observation:
                        continue
                    value = observation[field]
                    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
                        errors.append(f"{prefix}.{field} 必须是大于等于 {minimum} 的整数")
                if "options" in observation and not isinstance(observation["options"], dict):
                    errors.append(f"{prefix}.options 必须是 object")
                confidence = observation.get("confidence")
                if (
                    isinstance(confidence, bool)
                    or not isinstance(confidence, (int, float))
                    or not 0 <= confidence <= 1
                ):
                    errors.append(f"{prefix}.confidence 必须位于 0 到 1")
                for field in (
                    "selector", "source", "mediaQuery", "api", "event",
                    "binding", "scope", "variable", "runtimeMatch", "runtimeMode",
                ):
                    if field in observation:
                        valid_string_ref(observation[field], f"{prefix}.{field}")
                for list_field in _EVIDENCE_LIST_STRING_FIELDS:
                    if list_field not in observation:
                        continue
                    values = observation[list_field]
                    if not isinstance(values, list):
                        errors.append(f"{prefix}.{list_field} 必须是 array")
                    else:
                        for value_index, value in enumerate(values):
                            valid_string_ref(
                                value,
                                f"{prefix}.{list_field}[{value_index}]",
                            )

    return errors
