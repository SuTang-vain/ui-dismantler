"""UI-IR v2 schema: node/relation type enums, constants, and shared utilities.

This module is the foundational layer of the UI-IR v2 model. It defines:
- Schema constants (NODE_TYPES, RELATION_TYPES, evidence fields, etc.)
- Utility functions for key generation, evidence interning, table encoding
- Query helpers for inspecting canonical UI-IR documents

All other uiir submodules (conversion, projection, validation) depend on this.
The original HTML/CSS/JS remains the highest-priority source of evidence.
"""

from __future__ import annotations

from collections import Counter
from copy import deepcopy
from hashlib import sha1
import re
from typing import Any


UIIR_SCHEMA_VERSION = "2.0"
UIIR_FORMAT = "ui-ir"

NODE_TYPES: tuple[str, ...] = (
    "page",
    "region",
    "component",
    "element",
    "data",
    "state",
    "token",
    "breakpoint",
)

RELATION_TYPES: tuple[str, ...] = (
    "renders",
    "binds",
    "triggers",
    "controls",
    "styles",
    "responds",
    "references",
    "variantOf",
    "derivedFrom",
    "labels",
)

_NODE_TYPE_INDEX = {name: index for index, name in enumerate(NODE_TYPES)}
_RELATION_TYPE_INDEX = {name: index for index, name in enumerate(RELATION_TYPES)}

_IDENTITY_FIELDS = ("id", "key", "name", "title", "w", "t", "q", "label", "time")
_VIEW_DATA_ALIASES = {
    "member-grid": ("members",),
    "detail-panel": ("members", "details"),
    "timeline": ("timeline", "events"),
    "carousel-3d": ("works",),
    "graph": ("graphNodes", "graph"),
    "quiz": ("quiz",),
}

_RELATION_DATASET_ALIASES = {
    # manifest v1 的 causeChain 使用 events 数组下标作为 from/to。
    "causeChain": ("events", "timeline"),
}

_RESPONSIVE_EDGE_PROPERTIES = {
    "grid-template-columns",
    "display",
    "flex",
    "font-size",
}

_EVIDENCE_SCALAR_STRING_FIELDS = (
    "manifestPath",
    "method",
    "selector",
    "source",
    "mediaQuery",
    "api",
    "event",
    "binding",
    "scope",
    "variable",
    "runtimeMatch",
    "runtimeMode",
)
_EVIDENCE_LIST_STRING_FIELDS = ("properties", "runtimeScenarios", "invokedRuntimeScenarios")

_RESPONSIVE_CHANGE_RE = re.compile(
    r"^(?P<target>.+?)\s+(?P<property>(?:--)?[\w-]+)\s*:\s*"
    r"(?P<from>.*?)\s*(?:→|->|=>)\s*(?P<to>.*?)\s*$"
)


def parse_responsive_change(change: Any) -> dict[str, Any] | None:
    """把 manifest 响应式变化归一化为 target/property/from/to。

    同时接受历史字符串格式和已结构化 object；无法可靠拆分时返回 ``None``，
    调用方仍需保留原值以保证兼容投影无损。
    """
    if isinstance(change, dict):
        target = change.get("target", change.get("selector"))
        property_name = change.get("property")
        if (
            target not in (None, "")
            and property_name not in (None, "")
            and "from" in change
            and "to" in change
        ):
            return {
                "target": str(target).strip(),
                "property": str(property_name).strip(),
                "from": deepcopy(change.get("from")),
                "to": deepcopy(change.get("to")),
            }
        return None
    if not isinstance(change, str):
        return None
    match = _RESPONSIVE_CHANGE_RE.match(change.strip())
    if not match:
        return None
    parsed = {key: value.strip() for key, value in match.groupdict().items()}
    if not parsed["target"] or not parsed["property"]:
        return None
    return parsed


def _clean_key_fragment(value: Any, fallback: str) -> str:
    """生成适合 stable key 的短片段；保留中文以增强调试可读性。"""
    text = str(value).strip() if value is not None else ""
    if not text:
        return fallback
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"[/:#?&=]+", "-", text)
    text = re.sub(r"[^\w\-.\u3400-\u9fff]+", "-", text, flags=re.UNICODE)
    text = text.strip("-._")
    if not text:
        return fallback
    if len(text) <= 64:
        return text
    digest = sha1(text.encode("utf-8")).hexdigest()[:10]
    return f"{text[:48]}-{digest}"


def _without_none(value: Any) -> Any:
    """递归复制 JSON 值；保留显式 null，避免 round-trip 语义损失。"""
    if isinstance(value, dict):
        return {key: _without_none(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_without_none(item) for item in value]
    return value


def _iter_evidence_strings(evidence: dict[str, dict[str, Any]]):
    """按稳定出现顺序枚举适合放入共享字符串表的 evidence 值。"""
    for record in evidence.values():
        source = record.get("source")
        if isinstance(source, str):
            yield source
        for observation in record.get("observations") or []:
            if not isinstance(observation, dict):
                continue
            for field in _EVIDENCE_SCALAR_STRING_FIELDS:
                value = observation.get(field)
                if isinstance(value, str):
                    yield value
            for field in _EVIDENCE_LIST_STRING_FIELDS:
                values = observation.get(field)
                if isinstance(values, list):
                    for value in values:
                        if isinstance(value, str):
                            yield value


def _intern_evidence_strings(
    evidence: dict[str, dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """仅 intern 重复 evidence 字符串，避免唯一值进入表后反而增大文档。"""
    counts = Counter(_iter_evidence_strings(evidence))
    table: list[str] = []
    indexes: dict[str, int] = {}
    for value in _iter_evidence_strings(evidence):
        if counts[value] >= 2 and value not in indexes:
            indexes[value] = len(table)
            table.append(value)

    encoded = deepcopy(evidence)
    for record in encoded.values():
        source = record.get("source")
        if isinstance(source, str) and source in indexes:
            record["source"] = indexes[source]
        for observation in record.get("observations") or []:
            if not isinstance(observation, dict):
                continue
            for field in _EVIDENCE_SCALAR_STRING_FIELDS:
                value = observation.get(field)
                if isinstance(value, str) and value in indexes:
                    observation[field] = indexes[value]
            for field in _EVIDENCE_LIST_STRING_FIELDS:
                values = observation.get(field)
                if isinstance(values, list):
                    observation[field] = [
                        indexes.get(value, value) if isinstance(value, str) else value
                        for value in values
                    ]
    return encoded, table


def _resolve_string_ref(value: Any, strings: list[str], field: str) -> str:
    if isinstance(value, str) and value:
        return value
    if (
        isinstance(value, int)
        and not isinstance(value, bool)
        and 0 <= value < len(strings)
    ):
        return strings[value]
    raise ValueError(f"{field} 不是非空 string 或有效 string table 引用")


def expand_uiir_evidence(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """展开 canonical UI-IR 的 evidence string refs，供调试和外部消费。"""
    strings = document.get("strings", [])
    if (
        not isinstance(strings, list)
        or any(not isinstance(value, str) or not value for value in strings)
        or len(strings) != len(set(strings))
    ):
        raise ValueError("strings 必须是不重复的非空字符串数组")
    evidence = document.get("evidence", {})
    if not isinstance(evidence, dict):
        raise ValueError("evidence 必须是 object")

    expanded = deepcopy(evidence)
    for node_id, record in expanded.items():
        if not isinstance(record, dict):
            raise ValueError(f"evidence[{node_id}] 必须是 object")
        if "source" in record:
            record["source"] = _resolve_string_ref(
                record["source"], strings, f"evidence[{node_id}].source"
            )
        observations = record.get("observations") or []
        if not isinstance(observations, list):
            raise ValueError(f"evidence[{node_id}].observations 必须是 array")
        for observation_index, observation in enumerate(observations):
            if not isinstance(observation, dict):
                raise ValueError(
                    f"evidence[{node_id}].observations[{observation_index}] 必须是 object"
                )
            prefix = f"evidence[{node_id}].observations[{observation_index}]"
            for field in _EVIDENCE_SCALAR_STRING_FIELDS:
                if field in observation:
                    observation[field] = _resolve_string_ref(
                        observation[field], strings, f"{prefix}.{field}"
                    )
            for field in _EVIDENCE_LIST_STRING_FIELDS:
                if field not in observation:
                    continue
                values = observation[field]
                if not isinstance(values, list):
                    raise ValueError(f"{prefix}.{field} 必须是 array")
                observation[field] = [
                    _resolve_string_ref(value, strings, f"{prefix}.{field}[{index}]")
                    for index, value in enumerate(values)
                ]
    return expanded


def _item_identity(item: Any, index: int) -> str:
    if isinstance(item, dict):
        for field in _IDENTITY_FIELDS:
            value = item.get(field)
            if value not in (None, ""):
                return _clean_key_fragment(value, str(index))
    return str(index)


def _is_relation_dataset(items: Any) -> bool:
    return bool(
        isinstance(items, list)
        and items
        and all(isinstance(item, dict) and "from" in item and "to" in item for item in items)
    )


def _encode_table(items: list[Any]) -> dict[str, Any]:
    """把同一数据集编码为 fields + rows，消除每条记录重复的字段名。"""
    fields: list[str] = []
    seen: set[str] = set()
    normalized: list[dict[str, Any]] = []
    object_rows: list[int] = []
    for row_index, item in enumerate(items):
        if isinstance(item, dict):
            record = item
            object_rows.append(row_index)
        else:
            record = {"value": item}
        normalized.append(record)
        for field in record:
            if field not in seen:
                fields.append(field)
                seen.add(field)

    rows: list[list[Any]] = []
    missing: list[list[int]] = []
    for row_index, record in enumerate(normalized):
        row: list[Any] = []
        for field_index, field in enumerate(fields):
            if field in record:
                row.append(_without_none(record[field]))
            else:
                row.append(None)
                missing.append([row_index, field_index])
        rows.append(row)

    table: dict[str, Any] = {"fields": fields, "rows": rows}
    if len(object_rows) == len(items):
        table["rowKind"] = "object"
    elif not object_rows:
        table["rowKind"] = "value"
    else:
        table["rowKind"] = "mixed"
        table["objectRows"] = object_rows
    if missing:
        table["missing"] = missing
    return table


def _decode_table(props: dict[str, Any]) -> list[Any]:
    fields = props.get("fields") or []
    rows = props.get("rows") or []
    missing = {tuple(item) for item in (props.get("missing") or [])}
    row_kind = props.get("rowKind", "object")
    object_rows = set(props.get("objectRows") or [])
    result: list[Any] = []
    for row_index, row in enumerate(rows):
        record = {
            field: deepcopy(row[field_index])
            for field_index, field in enumerate(fields)
            if (row_index, field_index) not in missing
        }
        is_object = row_kind == "object" or (row_kind == "mixed" and row_index in object_rows)
        result.append(record if is_object else record.get("value"))
    return result



def _nodes_by_type(document: dict[str, Any], node_type: str) -> list[list[Any]]:
    type_index = document["nodeTypes"].index(node_type)
    return [node for node in document["nodes"] if node[1] == type_index]


def _strip_props(props: dict[str, Any], *keys: str) -> dict[str, Any]:
    excluded = {"key", *keys}
    return {key: deepcopy(value) for key, value in props.items() if key not in excluded}
