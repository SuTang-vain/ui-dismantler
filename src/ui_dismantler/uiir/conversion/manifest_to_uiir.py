"""Convert manifest v1 -> canonical UI-IR v2.

Builds a typed node/relation intermediate representation from manifest v1's
nested domain structure. Nodes use parentId for hierarchy; sparse cross-layer
relations (binds/triggers/controls/etc.) use edges to reduce redundancy.
"""

from __future__ import annotations

from copy import deepcopy
from hashlib import sha1
import json
from pathlib import Path
import re
from typing import Any

from ..schema import (
    NODE_TYPES,
    RELATION_TYPES,
    UIIR_FORMAT,
    UIIR_SCHEMA_VERSION,
    _NODE_TYPE_INDEX,
    _RELATION_TYPE_INDEX,
    _VIEW_DATA_ALIASES,
    _RELATION_DATASET_ALIASES,
    _RESPONSIVE_EDGE_PROPERTIES,
    parse_responsive_change,
    _clean_key_fragment,
    _without_none,
    _item_identity,
    _is_relation_dataset,
    _intern_evidence_strings,
    _encode_table,
)
from ..validation import validate_uiir
from ..extraction.css_media import extract_css_media_blocks
from ..extraction.source_refs import extract_source_references, resolve_dom_selector
from ..runtime.runtime_refs import observe_runtime_references


class UIIRBuilder:
    """构建确定性、可验证的 UI-IR v2 文档。"""

    def __init__(self, source_schema_version: str = "1.0") -> None:
        self.source_schema_version = source_schema_version
        self.nodes: list[list[Any]] = []
        self.edges: list[list[Any]] = []
        self.evidence: dict[str, dict[str, Any]] = {}
        self._keys: dict[str, int] = {}
        self._edge_signatures: set[str] = set()

    def add_node(
        self,
        node_type: str,
        key: str,
        parent: int | None,
        props: dict[str, Any] | None = None,
        evidence: dict[str, Any] | None = None,
    ) -> int:
        if node_type not in _NODE_TYPE_INDEX:
            raise ValueError(f"未知节点类型：{node_type}")
        stable_key = key
        suffix = 2
        while stable_key in self._keys:
            stable_key = f"{key}~{suffix}"
            suffix += 1
        node_id = len(self.nodes)
        node_props = {"key": stable_key}
        if props:
            node_props.update(_without_none(deepcopy(props)))
        self.nodes.append([node_id, _NODE_TYPE_INDEX[node_type], parent, node_props])
        self._keys[stable_key] = node_id
        if evidence:
            self.add_evidence(node_id, evidence)
        return node_id

    def add_evidence(self, node_id: int, evidence: dict[str, Any] | None) -> None:
        """合并节点的来源证据，避免共享 selector 节点覆盖先前观察。"""
        if not evidence:
            return
        normalized = _without_none(deepcopy(evidence))
        source = normalized.get("source")
        observations = normalized.get("observations")
        if not isinstance(observations, list):
            observation = {key: value for key, value in normalized.items() if key != "source"}
            observations = [observation] if observation else []

        record = self.evidence.setdefault(str(node_id), {"observations": []})
        if source not in (None, "") and "source" not in record:
            record["source"] = source
        known = {
            json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            for item in record.get("observations", [])
        }
        for observation in observations:
            if not isinstance(observation, dict) or not observation:
                continue
            item = _without_none(deepcopy(observation))
            if source not in (None, "") and record.get("source") not in (None, source):
                item.setdefault("source", source)
            signature = json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            if signature not in known:
                record.setdefault("observations", []).append(item)
                known.add(signature)
        if not record.get("observations"):
            record.pop("observations", None)

    def update_node_props(self, node_id: int, props: dict[str, Any]) -> None:
        if not isinstance(node_id, int) or not 0 <= node_id < len(self.nodes):
            raise ValueError(f"节点不存在：{node_id}")
        self.nodes[node_id][3].update(_without_none(deepcopy(props)))

    def add_edge(
        self,
        source: int,
        relation: str,
        target: int,
        props: dict[str, Any] | None = None,
    ) -> None:
        if relation not in _RELATION_TYPE_INDEX:
            raise ValueError(f"未知关系类型：{relation}")
        edge: list[Any] = [source, _RELATION_TYPE_INDEX[relation], target]
        if props:
            edge.append(_without_none(deepcopy(props)))
        signature = json.dumps(edge, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        if signature not in self._edge_signatures:
            self.edges.append(edge)
            self._edge_signatures.add(signature)

    def build(self, diagnostics: dict[str, Any] | None = None) -> dict[str, Any]:
        document: dict[str, Any] = {
            "schemaVersion": UIIR_SCHEMA_VERSION,
            "format": UIIR_FORMAT,
            "sourceSchemaVersion": self.source_schema_version,
            "nodeTypes": list(NODE_TYPES),
            "relationTypes": list(RELATION_TYPES),
            "nodes": self.nodes,
            "edges": self.edges,
        }
        if self.evidence:
            encoded_evidence, strings = _intern_evidence_strings(self.evidence)
            if strings:
                document["strings"] = strings
            document["evidence"] = encoded_evidence
        if diagnostics:
            document["diagnostics"] = _without_none(deepcopy(diagnostics))
        return document


def manifest_to_uiir(
    manifest: dict[str, Any],
    *,
    use_source_css: bool = True,
    use_source_refs: bool = True,
    use_runtime_refs: bool = False,
    runtime_exercise: bool = False,
    runtime_timeout_ms: int = 5000,
    runtime_actions: list[dict[str, Any]] | None = None,
    runtime_scenarios: list[dict[str, Any]] | None = None,
    source_override: str | Path | None = None,
) -> dict[str, Any]:
    """把 manifest v1 转换为 UI-IR v2。

    转换保持原始业务 props，不对未知领域数据做破坏性裁剪；已知关系会提升为 edge。
    """
    if not isinstance(manifest, dict):
        raise TypeError("manifest 必须是 JSON object")

    source_schema_version = str(manifest.get("schemaVersion") or "1.0")
    builder = UIIRBuilder(source_schema_version)
    meta = deepcopy(manifest.get("meta") or {})
    structure = manifest.get("structure") or {}
    source_path = meta.get("source")
    css_source_path = source_override if source_override is not None else source_path
    css_media_blocks: list[dict[str, Any]] = []
    css_media_warnings: list[str] = []
    source_reference_index: dict[str, Any] = {
        "elements": [], "selectorReferences": [], "eventBindings": []
    }
    source_reference_warnings: list[str] = []
    runtime_reference_index: dict[str, Any] = {
        "browser": None, "domCount": 0, "registrations": [],
        "errors": [], "exercised": 0, "actions": [], "scenarios": [],
        "trustedActions": 0, "failedActions": 0, "skippedActions": 0,
        "passedAssertions": 0, "failedAssertions": 0,
        "failureReplay": [], "coverage": {}, "candidates": [],
        "stateGraph": {"nodes": [], "edges": []},
    }
    runtime_reference_warnings: list[str] = []
    source_file_exists = (
        css_source_path not in (None, "")
        and Path(str(css_source_path)).expanduser().is_file()
    )
    if use_source_css and source_file_exists:
        css_media_blocks, css_media_warnings = extract_css_media_blocks(str(css_source_path))
    if use_source_refs and source_file_exists:
        source_reference_index, source_reference_warnings = extract_source_references(
            str(css_source_path)
        )
    if use_runtime_refs and source_file_exists:
        runtime_reference_index, runtime_reference_warnings = observe_runtime_references(
            str(css_source_path),
            exercise=runtime_exercise,
            timeout_ms=runtime_timeout_ms,
            actions=runtime_actions,
            scenarios=runtime_scenarios,
        )

    def manifest_evidence(
        manifest_path: str,
        *,
        method: str = "manifest-v1",
        confidence: float = 1.0,
        selector: str | None = None,
    ) -> dict[str, Any]:
        observation: dict[str, Any] = {
            "manifestPath": manifest_path,
            "method": method,
            "confidence": confidence,
        }
        if selector not in (None, ""):
            observation["selector"] = selector
        evidence: dict[str, Any] = {"observations": [observation]}
        if source_path not in (None, ""):
            evidence["source"] = str(source_path)
        return evidence

    def source_evidence(
        source: str,
        *,
        method: str,
        confidence: float,
        selector: str | None = None,
        source_span: list[int] | None = None,
        **details: Any,
    ) -> dict[str, Any]:
        observation: dict[str, Any] = {
            "method": method,
            "confidence": confidence,
            **{key: value for key, value in details.items() if value is not None},
        }
        if selector not in (None, ""):
            observation["selector"] = selector
        if source_span is not None:
            observation["sourceSpan"] = deepcopy(source_span)
        return {"source": source, "observations": [observation]}

    selector_resolution_cache: dict[str, dict[str, Any]] = {}
    selector_reference_map: dict[str, list[dict[str, Any]]] = {}
    for source_reference in source_reference_index.get("selectorReferences") or []:
        selector_reference_map.setdefault(
            str(source_reference.get("selector") or ""), []
        ).append(source_reference)
    static_selector_evidence_added: set[tuple[int, str]] = set()

    def add_static_selector_evidence(node_id: int, selector: str) -> None:
        """把 selector 的 DOM 命中和 JS 引用合并到同一语义节点。"""
        evidence_key = (node_id, selector)
        if evidence_key in static_selector_evidence_added:
            return
        static_selector_evidence_added.add(evidence_key)
        if selector not in selector_resolution_cache:
            selector_resolution_cache[selector] = resolve_dom_selector(
                source_reference_index.get("elements") or [], selector
            )
        resolution = selector_resolution_cache[selector]
        matches = resolution.get("matches") or []
        match_count = len(matches)
        for match_index, match in enumerate(matches[:16]):
            builder.add_evidence(
                node_id,
                source_evidence(
                    str(match.get("source") or source_reference_index.get("source") or source_path or ""),
                    method="dom-static",
                    confidence=float(resolution.get("confidence", 0.0)),
                    selector=str(resolution.get("selector") or selector),
                    source_span=match.get("sourceSpan"),
                    tag=match.get("tag"),
                    elementId=match.get("id"),
                    matchIndex=match_index,
                    matchCount=match_count,
                ),
            )
        normalized = str(resolution.get("selector") or selector)
        accepted = {selector, normalized}
        if normalized.startswith("#"):
            accepted.add(normalized[1:])
        references = [
            reference
            for accepted_selector in sorted(accepted)
            for reference in selector_reference_map.get(accepted_selector, [])
        ]
        for reference in references:
            builder.add_evidence(
                node_id,
                source_evidence(
                    str(reference.get("source") or source_path or ""),
                    method="js-selector-static",
                    confidence=float(reference.get("confidence", 0.0)),
                    selector=str(reference.get("selector") or selector),
                    source_span=reference.get("sourceSpan"),
                    api=reference.get("api"),
                    scope=reference.get("scope"),
                ),
            )

    manifest_extras = {
        "top": {
            key: deepcopy(value)
            for key, value in manifest.items()
            if key not in {
                "schemaVersion", "meta", "theme", "structure", "data",
                "interactions", "responsive", "a11y", "warnings",
            }
        },
        "theme": {
            key: deepcopy(value)
            for key, value in (manifest.get("theme") or {}).items()
            if key not in {"tokens", "gradients"}
        },
        "structure": {
            key: deepcopy(value)
            for key, value in structure.items()
            if key not in {"pattern", "tabs", "views", "modals", "storyPanels"}
        },
    }
    manifest_extras = {key: value for key, value in manifest_extras.items() if value}
    page_props: dict[str, Any] = {
        "title": meta.pop("title", ""),
        "meta": meta,
        "pattern": structure.get("pattern"),
        "a11y": manifest.get("a11y") or {},
    }
    if manifest_extras:
        page_props["manifestExtras"] = manifest_extras
    page_id = builder.add_node(
        "page", "page:main", None, page_props, evidence=manifest_evidence("meta")
    )

    # 视觉令牌：统一为 token 节点。
    theme = manifest.get("theme") or {}
    for index, token in enumerate(theme.get("tokens") or []):
        token_dict = token if isinstance(token, dict) else {"value": token}
        name = token_dict.get("name") or token_dict.get("original") or index
        builder.add_node(
            "token",
            f"token:color:{_clean_key_fragment(name, str(index))}",
            page_id,
            {"kind": "color", **token_dict},
            evidence=manifest_evidence(f"theme.tokens[{index}]"),
        )
    for index, gradient in enumerate(theme.get("gradients") or []):
        gradient_dict = gradient if isinstance(gradient, dict) else {"value": gradient}
        name = gradient_dict.get("selector") or index
        builder.add_node(
            "token",
            f"token:gradient:{_clean_key_fragment(name, str(index))}",
            page_id,
            {"kind": "gradient", **gradient_dict},
            evidence=manifest_evidence(f"theme.gradients[{index}]"),
        )

    # 结构节点与显式控制关系。
    tab_by_source_id: dict[str, int] = {}
    view_by_source_id: dict[str, int] = {}
    component_nodes: list[tuple[int, dict[str, Any]]] = []

    for index, tab in enumerate(structure.get("tabs") or []):
        tab_dict = tab if isinstance(tab, dict) else {"label": str(tab)}
        source_id = str(tab_dict.get("id") or index)
        props = {"kind": "tab", "role": "tab", **tab_dict}
        node_id = builder.add_node(
            "component",
            f"component:tab:{_clean_key_fragment(source_id, str(index))}",
            page_id,
            props,
            evidence=manifest_evidence(f"structure.tabs[{index}]"),
        )
        add_static_selector_evidence(node_id, f"#{source_id}")
        tab_by_source_id[source_id] = node_id
        component_nodes.append((node_id, props))

    for index, view in enumerate(structure.get("views") or []):
        view_dict = view if isinstance(view, dict) else {"type": "generic", "value": view}
        source_id = str(view_dict.get("id") or index)
        view_type = str(view_dict.get("type") or "generic")
        props = {"kind": view_type, "role": "view", **view_dict}
        node_id = builder.add_node(
            "component",
            f"component:view:{_clean_key_fragment(source_id, str(index))}",
            page_id,
            props,
            evidence=manifest_evidence(f"structure.views[{index}]"),
        )
        add_static_selector_evidence(node_id, f"#{source_id}")
        view_by_source_id[source_id] = node_id
        component_nodes.append((node_id, props))
        tab_id = view_dict.get("tabId")
        if tab_id is not None and str(tab_id) in tab_by_source_id:
            builder.add_edge(tab_by_source_id[str(tab_id)], "controls", node_id)

    for tab in structure.get("tabs") or []:
        if not isinstance(tab, dict):
            continue
        tab_id = str(tab.get("id") or "")
        target_id = str(tab.get("ariaControls") or "")
        if tab_id in tab_by_source_id and target_id in view_by_source_id:
            builder.add_edge(tab_by_source_id[tab_id], "controls", view_by_source_id[target_id])

    element_refs: dict[str, int] = {}

    def element_ref(reference: Any, evidence: dict[str, Any] | None = None) -> int:
        text = str(reference)
        if text not in element_refs:
            digest = sha1(text.encode("utf-8")).hexdigest()[:10]
            element_refs[text] = builder.add_node(
                "element",
                f"element:ref:{digest}",
                page_id,
                {"reference": text, "referenceOnly": True},
                evidence=evidence,
            )
        elif evidence:
            builder.add_evidence(element_refs[text], evidence)
        add_static_selector_evidence(element_refs[text], text)
        return element_refs[text]

    for collection_name, kind in (("modals", "modal"), ("storyPanels", "story-panel")):
        for index, item in enumerate(structure.get(collection_name) or []):
            item_dict = item if isinstance(item, dict) else {"value": item}
            source_id = item_dict.get("id") or index
            props = {"kind": kind, "role": "dialog" if kind == "modal" else "region", **item_dict}
            node_id = builder.add_node(
                "component",
                f"component:{kind}:{_clean_key_fragment(source_id, str(index))}",
                page_id,
                props,
                evidence=manifest_evidence(f"structure.{collection_name}[{index}]"),
            )
            add_static_selector_evidence(node_id, f"#{source_id}")
            component_nodes.append((node_id, props))
            trigger = item_dict.get("trigger")
            if trigger not in (None, "", "unknown"):
                builder.add_edge(
                    element_ref(
                        trigger,
                        manifest_evidence(
                            f"structure.{collection_name}[{index}].trigger",
                            selector=str(trigger),
                        ),
                    ),
                    "triggers",
                    node_id,
                )

    # 业务数据使用 fields + rows 表，消除重复字段名；仅把参与关系的行提升为节点。
    data = manifest.get("data") or {}
    dataset_nodes: dict[str, int] = {}
    dataset_rows: dict[str, list[Any]] = {}
    promoted_rows: dict[tuple[str, int], int] = {}
    relation_datasets: dict[str, list[dict[str, Any]]] = {}

    for dataset_name, items in data.items():
        source_was_array = isinstance(items, list)
        normalized_items = items if source_was_array else [items]
        relation_storage = _is_relation_dataset(normalized_items)
        dataset_props: dict[str, Any] = {
            "kind": "dataset",
            "name": dataset_name,
            "count": len(normalized_items),
            "sourceWasArray": source_was_array,
            "storage": "edges" if relation_storage else "table",
        }
        if relation_storage:
            relation_datasets[dataset_name] = normalized_items
        else:
            dataset_rows[dataset_name] = normalized_items
            dataset_props.update(_encode_table(normalized_items))
        dataset_nodes[dataset_name] = builder.add_node(
            "data",
            f"data:dataset:{_clean_key_fragment(dataset_name, 'dataset')}",
            page_id,
            dataset_props,
            evidence=manifest_evidence(f"data.{dataset_name}"),
        )

    def promote_row(dataset_name: str, index: int) -> int:
        identity = (dataset_name, index)
        if identity in promoted_rows:
            return promoted_rows[identity]
        item = dataset_rows[dataset_name][index]
        label = _item_identity(item, index)
        node_id = builder.add_node(
            "data",
            f"data:{_clean_key_fragment(dataset_name, 'dataset')}:{label}",
            dataset_nodes[dataset_name],
            {"dataset": dataset_name, "row": index, "label": label},
            evidence=manifest_evidence(f"data.{dataset_name}[{index}]"),
        )
        promoted_rows[identity] = node_id
        return node_id

    # from/to 数据集优先提升为关系边；无法解析时保留引用占位节点。
    for dataset_name, relations in relation_datasets.items():
        candidates = [
            name
            for name, rows in dataset_rows.items()
            if name != dataset_name and rows and all(
                isinstance(record.get(endpoint), int) and 0 <= record[endpoint] < len(rows)
                for record in relations
                for endpoint in ("from", "to")
            )
        ]
        target_dataset = None
        for preferred in _RELATION_DATASET_ALIASES.get(dataset_name, ()):
            if preferred in candidates:
                target_dataset = preferred
                break
        if target_dataset is None and len(candidates) == 1:
            target_dataset = candidates[0]
        for index, record in enumerate(relations):
            edge_props = {
                "dataset": dataset_name,
                "index": index,
                **{key: value for key, value in record.items() if key not in ("from", "to")},
            }
            if target_dataset:
                source = promote_row(target_dataset, record["from"])
                target = promote_row(target_dataset, record["to"])
            else:
                source = builder.add_node(
                    "data",
                    f"data:{_clean_key_fragment(dataset_name, 'dataset')}:from:{index}",
                    dataset_nodes[dataset_name],
                    {"dataset": dataset_name, "reference": record.get("from"), "referenceOnly": True},
                )
                target = builder.add_node(
                    "data",
                    f"data:{_clean_key_fragment(dataset_name, 'dataset')}:to:{index}",
                    dataset_nodes[dataset_name],
                    {"dataset": dataset_name, "reference": record.get("to"), "referenceOnly": True},
                )
            builder.add_edge(source, "references", target, edge_props)

    # 用 manifest v1 已知约定建立组件→数据集绑定，推断关系显式标注 inferred。
    for component_id, props in component_nodes:
        kind = str(props.get("kind") or "")
        for dataset_name in _VIEW_DATA_ALIASES.get(kind, (kind,)):
            if dataset_name in dataset_nodes:
                builder.add_edge(component_id, "binds", dataset_nodes[dataset_name], {"inferred": True})
                break

    # 交互转为 element → state 的触发关系。
    for index, interaction in enumerate(manifest.get("interactions") or []):
        interaction_dict = interaction if isinstance(interaction, dict) else {"value": interaction}
        state_id = builder.add_node(
            "state",
            f"state:interaction:{index}",
            page_id,
            {"kind": "interaction", "index": index, **interaction_dict},
            evidence=manifest_evidence(f"interactions[{index}]"),
        )
        target = interaction_dict.get("target")
        if target not in (None, ""):
            edge_props = {
                "event": interaction_dict.get("trigger"),
                "interactionType": interaction_dict.get("type"),
            }
            builder.add_edge(
                element_ref(
                    target,
                    manifest_evidence(
                        f"interactions[{index}].target", selector=str(target)
                    ),
                ),
                "triggers",
                state_id,
                edge_props,
            )

    # 源码中可静态解析的 selector 与事件绑定补全 manifest 未记录的交互。
    source_event_states: dict[tuple[str, str], list[int]] = {}
    source_event_metadata: dict[int, dict[str, Any]] = {}
    for reference in source_reference_index.get("selectorReferences") or []:
        selector = reference.get("selector")
        if selector not in (None, ""):
            element_ref(str(selector))

    for binding_index, binding in enumerate(source_reference_index.get("eventBindings") or []):
        selector = str(binding.get("selector") or "")
        event = str(binding.get("event") or "")
        if not selector or not event:
            continue
        source = str(binding.get("source") or source_path or "")
        source_span = binding.get("sourceSpan")
        signature = json.dumps(
            [source, source_span, selector, event, binding.get("api")],
            ensure_ascii=False,
            separators=(",", ":"),
        )
        state_id = builder.add_node(
            "state",
            f"state:source-event:{sha1(signature.encode('utf-8')).hexdigest()[:12]}",
            page_id,
            {
                "kind": "interaction",
                "index": len(manifest.get("interactions") or []) + binding_index,
                "sourceOnly": True,
                "type": "static-event-binding",
                "trigger": event,
                "target": selector,
                "api": binding.get("api"),
            },
            evidence=source_evidence(
                source,
                method="js-event-static" if binding.get("api") != "html-event-attribute" else "html-event-static",
                confidence=float(binding.get("confidence", 0.0)),
                selector=selector,
                source_span=source_span,
                api=binding.get("api"),
                event=event,
                binding=binding.get("binding"),
                variable=binding.get("variable"),
            ),
        )
        builder.add_edge(
            element_ref(selector),
            "triggers",
            state_id,
            {
                "event": event,
                "interactionType": "static-event-binding",
                "method": "source-static",
                "confidence": float(binding.get("confidence", 0.0)),
                "sourceOnly": True,
            },
        )
        source_event_states.setdefault((selector, event), []).append(state_id)
        source_event_metadata[state_id] = {
            "source": source,
            "sourceSpan": source_span,
            "api": binding.get("api"),
        }

    # 可选浏览器观察验证真实 listener/property 注册；默认不启动浏览器。
    def selector_dom_spans(selector: str) -> set[tuple[int, int]]:
        if selector not in selector_resolution_cache:
            selector_resolution_cache[selector] = resolve_dom_selector(
                source_reference_index.get("elements") or [], selector
            )
        return {
            tuple(match["sourceSpan"])
            for match in selector_resolution_cache[selector].get("matches") or []
            if isinstance(match.get("sourceSpan"), list)
            and len(match["sourceSpan"]) == 2
        }

    def selector_fingerprint(selector: str) -> tuple[str | None, frozenset[str]]:
        compound = re.split(r"\s+|>", selector.strip())[-1]
        compound = re.sub(r"::?[\w-]+(?:\([^)]*\))?", "", compound)
        ids = re.findall(r"#([\w:-]+)", compound)
        classes = frozenset(re.findall(r"\.([\w:-]+)", compound))
        return (ids[0] if len(ids) == 1 else None, classes)

    runtime_matched_states: set[int] = set()

    def candidate_score(state_id: int, registration: dict[str, Any]) -> tuple[int, int]:
        metadata = source_event_metadata.get(state_id, {})
        score = 0
        static_span = metadata.get("sourceSpan")
        runtime_span = registration.get("sourceSpan")
        same_source = str(metadata.get("source") or "") == str(registration.get("source") or "")
        if (
            same_source
            and isinstance(static_span, list) and len(static_span) == 2
            and isinstance(runtime_span, list) and len(runtime_span) == 2
            and max(static_span[0], runtime_span[0]) < min(static_span[1], runtime_span[1])
        ):
            score += 100
        static_api = str(metadata.get("api") or "").lower()
        runtime_api = str(registration.get("api") or "").lower()
        if (
            ("addeventlistener" in static_api and runtime_api == "addeventlistener")
            or (runtime_api in {"property-handler", "on-property"} and "on" in static_api)
        ):
            score += 20
        if state_id not in runtime_matched_states:
            score += 5
        return score, -state_id

    def best_candidate(
        candidates: list[int], registration: dict[str, Any], method: str
    ) -> tuple[int | None, str | None]:
        if not candidates:
            return None, None
        state_id = max(candidates, key=lambda item: candidate_score(item, registration))
        runtime_matched_states.add(state_id)
        return state_id, method

    def matching_static_event_state(
        selector: str, event: str, registration: dict[str, Any]
    ) -> tuple[int | None, str | None]:
        exact = source_event_states.get((selector, event)) or []
        if exact:
            return best_candidate(exact, registration, "selector-exact")
        runtime_spans = selector_dom_spans(selector)
        if runtime_spans:
            candidates = [
                candidate_id
                for (static_selector, static_event), candidate_ids in source_event_states.items()
                if static_event == event and runtime_spans & selector_dom_spans(static_selector)
                for candidate_id in candidate_ids
            ]
            if candidates:
                return best_candidate(candidates, registration, "dom-source-overlap")
        runtime_id, runtime_classes = selector_fingerprint(selector)
        candidates: list[tuple[int, int]] = []
        for (static_selector, static_event), candidate_ids in source_event_states.items():
            if static_event != event:
                continue
            static_id, static_classes = selector_fingerprint(static_selector)
            compatible_id = static_id is not None and static_id == runtime_id
            compatible_classes = bool(static_classes) and static_classes.issubset(runtime_classes)
            if compatible_id or compatible_classes:
                specificity = len(static_classes) + (10 if static_id else 0)
                candidates.extend((specificity, candidate_id) for candidate_id in candidate_ids)
        if candidates:
            max_specificity = max(item[0] for item in candidates)
            return best_candidate(
                [item[1] for item in candidates if item[0] == max_specificity],
                registration,
                "selector-compatible",
            )
        return None, None

    runtime_only_index = 0
    for registration in runtime_reference_index.get("registrations") or []:
        if not isinstance(registration, dict):
            continue
        selector = str(registration.get("selector") or "")
        event = str(registration.get("event") or "")
        if not selector or not event:
            continue
        source = str(registration.get("source") or css_source_path or source_path or "")
        source_span = registration.get("sourceSpan")
        invocation_count = max(0, int(registration.get("invocationCount") or 0))
        event_key = (selector, event)
        state_id, runtime_match = matching_static_event_state(selector, event, registration)
        runtime_only = state_id is None
        if runtime_only:
            signature = json.dumps(
                [selector, event], ensure_ascii=False, separators=(",", ":")
            )
            state_id = builder.add_node(
                "state",
                f"state:runtime-event:{sha1(signature.encode('utf-8')).hexdigest()[:12]}",
                page_id,
                {
                    "kind": "interaction",
                    "index": len(manifest.get("interactions") or [])
                    + len(source_reference_index.get("eventBindings") or [])
                    + runtime_only_index,
                    "sourceOnly": True,
                    "runtimeOnly": True,
                    "runtimeObserved": True,
                    "runtimeInvoked": invocation_count > 0,
                    "type": "runtime-event-binding",
                    "trigger": event,
                    "target": selector,
                    "api": registration.get("api"),
                },
            )
            builder.add_edge(
                element_ref(selector),
                "triggers",
                state_id,
                {
                    "event": event,
                    "interactionType": "runtime-event-binding",
                    "method": "browser-runtime",
                    "confidence": 1.0,
                    "sourceOnly": True,
                    "runtimeObserved": True,
                },
            )
            source_event_states.setdefault(event_key, []).append(state_id)
            runtime_only_index += 1
        else:
            builder.update_node_props(
                state_id,
                {
                    "runtimeObserved": True,
                    "runtimeInvoked": invocation_count > 0
                    or builder.nodes[state_id][3].get("runtimeInvoked", False),
                },
            )
        builder.add_evidence(
            state_id,
            source_evidence(
                source,
                method="browser-listener-registration",
                confidence=1.0,
                selector=selector,
                source_span=source_span,
                runtimeObserved=True,
                runtimeMatch=runtime_match,
                api=registration.get("api"),
                event=event,
                runtimeLine=registration.get("runtimeLine"),
                runtimeColumn=registration.get("runtimeColumn"),
                options=registration.get("options") or {},
                invocationCount=invocation_count,
                runtimeMode=registration.get("runtimeMode"),
                runtimeScenarios=registration.get("scenarioIds"),
                invokedRuntimeScenarios=registration.get("invokedScenarioIds"),
            ),
        )
        if invocation_count > 0:
            builder.add_evidence(
                state_id,
                source_evidence(
                    source,
                    method="browser-event-invocation",
                    confidence=1.0,
                    selector=selector,
                    source_span=source_span,
                    runtimeObserved=True,
                    runtimeMatch=runtime_match,
                    api=registration.get("api"),
                    event=event,
                    invocationCount=invocation_count,
                    runtimeMode=registration.get("runtimeMode"),
                    runtimeScenarios=registration.get("scenarioIds"),
                    invokedRuntimeScenarios=registration.get("invokedScenarioIds"),
                ),
            )

    # CSS @media 是响应式关系的首选事实来源；manifest changes 仅作为兼容回退。
    # Canonical edge 聚焦会改变组件结构/可见性/字号的属性；完整声明仍由源码证据定位。
    def relevant_css_changes(block: dict[str, Any]) -> list[dict[str, Any]]:
        return [
            change for change in (block.get("changes") or [])
            if change.get("property") in _RESPONSIVE_EDGE_PROPERTIES
        ]

    def normalized_breakpoint(value: Any) -> str:
        text = str(value or "").lower().strip()
        text = re.sub(r"\s+", "", text)
        return text

    css_by_breakpoint: dict[str, list[dict[str, Any]]] = {}
    for block in css_media_blocks:
        css_by_breakpoint.setdefault(normalized_breakpoint(block.get("breakpoint")), []).append(block)

    def add_css_responds_edges(breakpoint_id: int, block: dict[str, Any]) -> None:
        grouped: dict[str, list[dict[str, Any]]] = {}
        for change in relevant_css_changes(block):
            grouped.setdefault(str(change.get("selector") or ""), []).append(change)
        for selector, changes in grouped.items():
            if not selector or not changes:
                continue
            confidence = min(float(change.get("confidence", 0.85)) for change in changes)
            spans = [change.get("sourceSpan") for change in changes if change.get("sourceSpan")]
            source_span = None
            if spans:
                source_span = [min(span[0] for span in spans), max(span[1] for span in spans)]
            properties = [str(change.get("property")) for change in changes]
            target_id = element_ref(
                selector,
                source_evidence(
                    str(block.get("source") or source_path or ""),
                    method="css-media-static",
                    confidence=confidence,
                    selector=selector,
                    source_span=source_span,
                    mediaQuery=block.get("breakpoint"),
                    properties=properties,
                ),
            )
            builder.add_edge(
                breakpoint_id,
                "responds",
                target_id,
                {
                    "changes": [
                        [
                            change.get("property"),
                            deepcopy(change.get("from")),
                            deepcopy(change.get("to")),
                        ]
                        for change in changes
                    ],
                    "method": "css-media-static",
                    "confidence": confidence,
                },
            )

    for index, responsive in enumerate(manifest.get("responsive") or []):
        responsive_dict = responsive if isinstance(responsive, dict) else {"value": responsive}
        breakpoint = responsive_dict.get("breakpoint") or index
        matching_blocks = css_by_breakpoint.get(normalized_breakpoint(breakpoint)) or []
        css_block = matching_blocks.pop(0) if matching_blocks else None

        breakpoint_props: dict[str, Any] = {"index": index, **responsive_dict}
        structured_changes: list[dict[str, Any]] = []
        unparsed_indexes: list[int] = []
        if css_block is not None:
            breakpoint_props["responsiveSource"] = "css-media"
            breakpoint_props["cssChangeCount"] = len(relevant_css_changes(css_block))
            breakpoint_props["cssObservedChangeCount"] = len(css_block.get("changes") or [])
        else:
            for change_index, change in enumerate(responsive_dict.get("changes") or []):
                parsed = parse_responsive_change(change)
                if parsed is None:
                    unparsed_indexes.append(change_index)
                else:
                    structured_changes.append({"index": change_index, **parsed})
            if structured_changes:
                breakpoint_props["changesStructured"] = structured_changes
            if unparsed_indexes:
                breakpoint_props["unparsedChangeIndexes"] = unparsed_indexes
            if structured_changes:
                breakpoint_props["responsiveSource"] = "manifest-fallback"

        breakpoint_id = builder.add_node(
            "breakpoint",
            f"breakpoint:{_clean_key_fragment(breakpoint, str(index))}",
            page_id,
            breakpoint_props,
            evidence=manifest_evidence(f"responsive[{index}]"),
        )
        if css_block is not None:
            builder.add_evidence(
                breakpoint_id,
                source_evidence(
                    str(css_block.get("source") or source_path or ""),
                    method="css-media-static",
                    confidence=1.0,
                    source_span=css_block.get("sourceSpan"),
                    mediaQuery=css_block.get("breakpoint"),
                ),
            )
            add_css_responds_edges(breakpoint_id, css_block)
        else:
            for parsed in structured_changes:
                change_index = parsed["index"]
                target = parsed["target"]
                target_id = element_ref(
                    target,
                    manifest_evidence(
                        f"responsive[{index}].changes[{change_index}]",
                        method="responsive-change-parser",
                        confidence=0.9,
                        selector=target,
                    ),
                )
                builder.add_edge(
                    breakpoint_id,
                    "responds",
                    target_id,
                    {
                        "changes": [[
                            parsed["property"],
                            deepcopy(parsed["from"]),
                            deepcopy(parsed["to"]),
                        ]],
                        "changeIndex": change_index,
                        "method": "responsive-change-parser",
                        "confidence": 0.9,
                        "inferred": True,
                    },
                )

    # manifest 未记录的 media block 仍进入 canonical IR，但兼容投影时跳过。
    source_only_index = len(manifest.get("responsive") or [])
    for blocks in css_by_breakpoint.values():
        for css_block in blocks:
            breakpoint = css_block.get("breakpoint") or source_only_index
            breakpoint_id = builder.add_node(
                "breakpoint",
                f"breakpoint:css:{_clean_key_fragment(breakpoint, str(source_only_index))}",
                page_id,
                {
                    "index": source_only_index,
                    "breakpoint": breakpoint,
                    "sourceOnly": True,
                    "responsiveSource": "css-media",
                    "cssChangeCount": len(relevant_css_changes(css_block)),
                    "cssObservedChangeCount": len(css_block.get("changes") or []),
                },
                evidence=source_evidence(
                    str(css_block.get("source") or source_path or ""),
                    method="css-media-static",
                    confidence=1.0,
                    source_span=css_block.get("sourceSpan"),
                    mediaQuery=breakpoint,
                ),
            )
            add_css_responds_edges(breakpoint_id, css_block)
            source_only_index += 1

    diagnostics: dict[str, Any] = {"warnings": manifest.get("warnings") or []}
    if css_media_blocks or css_media_warnings:
        diagnostics["cssMedia"] = {
            "blocks": len(css_media_blocks),
            "warnings": css_media_warnings,
        }
    if (
        source_reference_index.get("elements")
        or source_reference_index.get("selectorReferences")
        or source_reference_index.get("eventBindings")
        or source_reference_warnings
    ):
        diagnostics["sourceReferences"] = {
            "elements": len(source_reference_index.get("elements") or []),
            "selectorReferences": len(source_reference_index.get("selectorReferences") or []),
            "eventBindings": len(source_reference_index.get("eventBindings") or []),
            "warnings": source_reference_warnings,
        }
    if use_runtime_refs:
        diagnostics["runtimeReferences"] = {
            "browser": runtime_reference_index.get("browser"),
            "domCount": int(runtime_reference_index.get("domCount") or 0),
            "registrations": len(runtime_reference_index.get("registrations") or []),
            "invokedRegistrations": sum(
                1 for item in runtime_reference_index.get("registrations") or []
                if isinstance(item, dict) and int(item.get("invocationCount") or 0) > 0
            ),
            "exercised": int(runtime_reference_index.get("exercised") or 0),
            "trustedActions": int(runtime_reference_index.get("trustedActions") or 0),
            "failedActions": int(runtime_reference_index.get("failedActions") or 0),
            "skippedActions": int(runtime_reference_index.get("skippedActions") or 0),
            "passedAssertions": int(runtime_reference_index.get("passedAssertions") or 0),
            "failedAssertions": int(runtime_reference_index.get("failedAssertions") or 0),
            "actions": deepcopy(runtime_reference_index.get("actions") or []),
            "scenarios": deepcopy(runtime_reference_index.get("scenarios") or []),
            "coverage": deepcopy(runtime_reference_index.get("coverage") or {}),
            "candidates": deepcopy(runtime_reference_index.get("candidates") or []),
            "stateGraph": deepcopy(
                runtime_reference_index.get("stateGraph") or {"nodes": [], "edges": []}
            ),
            "failureReplay": deepcopy(runtime_reference_index.get("failureReplay") or []),
            "errors": deepcopy(runtime_reference_index.get("errors") or []),
            "warnings": runtime_reference_warnings,
        }
    result = builder.build(diagnostics=diagnostics)
    errors = validate_uiir(result)
    if errors:
        raise ValueError("生成了无效 UI-IR：" + "; ".join(errors))
    return result
