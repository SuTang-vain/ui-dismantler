"""Section-contract validation and generation-input preparation.

This adapter is the hand-off boundary between deterministic analysis artifacts and
agent/LLM-led component generation. It intentionally does not generate final
CSS/JS; it creates a bounded, auditable input and blocks malformed contracts.
"""
from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any


_ALLOWED_EVIDENCE_STATUS = {"ok", "unavailable", "not-requested", "error", "not-found", "selector-error"}
_ALLOWED_INTERACTION_STATUS = {"candidate", "verified"}


def _is_pascal_name(value: object) -> bool:
    return isinstance(value, str) and bool(re.fullmatch(r"[A-Z][A-Za-z0-9]*", value))


def validate_section_contracts(inventory: dict) -> dict:
    """验证 inventory 中的 componentContract，不验证视觉等价或交互真实性。"""
    errors: list[str] = []
    warnings: list[str] = []
    sections = inventory.get("chunks")
    if not isinstance(sections, list):
        return {
            "status": "invalid",
            "valid": False,
            "errors": ["inventory.chunks 必须是数组"],
            "warnings": [],
            "checked": 0,
        }
    seen_ids: set[str] = set()
    checked = 0
    chunkable = 0
    for index, section in enumerate(sections):
        if not isinstance(section, dict):
            errors.append(f"chunks[{index}] 必须是 object")
            continue
        section_id = section.get("id")
        if not isinstance(section_id, str) or not section_id:
            errors.append(f"chunks[{index}].id 缺失")
        elif section_id in seen_ids:
            errors.append(f"section id 重复: {section_id}")
        else:
            seen_ids.add(section_id)
        if not section.get("chunkable"):
            continue
        chunkable += 1
        checked += 1
        contract = section.get("componentContract")
        if not isinstance(contract, dict):
            errors.append(f"{section_id or index}: 缺少 componentContract")
            continue
        component = contract.get("component")
        if not _is_pascal_name(component):
            errors.append(f"{section_id or index}: component 必须为 PascalCase")
        if contract.get("confidence") not in {"heuristic", "structural", "reviewed"}:
            errors.append(f"{section_id or index}: confidence 无效")
        props = contract.get("props")
        if not isinstance(props, dict) or not isinstance(props.get("required"), list):
            errors.append(f"{section_id or index}: props.required 必须是数组")
        data_contract = contract.get("dataContract")
        if not isinstance(data_contract, dict) or not isinstance(data_contract.get("fields"), list):
            errors.append(f"{section_id or index}: dataContract.fields 必须是数组")
        verification = contract.get("verification")
        if not isinstance(verification, list) or not verification:
            errors.append(f"{section_id or index}: verification 不能为空")
        css = section.get("cssEvidence", {})
        if not isinstance(css, dict) or css.get("status") not in _ALLOWED_EVIDENCE_STATUS:
            errors.append(f"{section_id or index}: cssEvidence.status 无效")
        if css.get("status") != "ok":
            warnings.append(f"{section_id or index}: CSS browser evidence={css.get('status', 'missing')}")
        interactions = contract.get("interactions", [])
        if not isinstance(interactions, list):
            errors.append(f"{section_id or index}: interactions 必须是数组")
        else:
            for interaction_index, interaction in enumerate(interactions):
                if not isinstance(interaction, dict):
                    errors.append(f"{section_id or index}: interactions[{interaction_index}] 必须是 object")
                    continue
                if interaction.get("status") not in _ALLOWED_INTERACTION_STATUS:
                    errors.append(f"{section_id or index}: interaction status 必须为 candidate/verified")
                if interaction.get("status") == "candidate":
                    warnings.append(f"{section_id or index}: interaction {interaction.get('id', interaction_index)} 尚未 verified")
    valid = not errors
    return {
        "status": "ready" if valid else "invalid",
        "valid": valid,
        "errors": errors,
        "warnings": warnings,
        "checked": checked,
        "chunkable": chunkable,
    }


def prepare_section_generation_input(
    inventory: dict,
    inventory_path: str | Path,
    *,
    strict: bool = True,
) -> dict:
    """将 inventory 压缩为 agent/生成器可消费的 section contract 输入。"""
    validation = validate_section_contracts(inventory)
    if strict and not validation["valid"]:
        raise ValueError("section contract 校验失败: " + "; ".join(validation["errors"][:5]))
    source = inventory.get("source", "")
    sections = []
    for section in inventory.get("chunks", []):
        if not isinstance(section, dict) or not section.get("chunkable"):
            continue
        contract = section.get("componentContract", {})
        sections.append({
            "id": section.get("id"),
            "tag": section.get("tag"),
            "heading": section.get("heading", ""),
            "selector": section.get("selector"),
            "source": source,
            "chunkFile": section.get("chunkFile"),
            "htmlBytes": section.get("htmlBytes", 0),
            "cssEvidenceStatus": section.get("cssEvidence", {}).get("status", "missing"),
            "contract": contract,
            "generationInstructions": {
                "preserveProps": contract.get("props", {}).get("required", []),
                "preserveDataFields": contract.get("dataContract", {}).get("fields", []),
                "implementA11y": contract.get("a11y", {}).get("requirements", []),
                "verify": contract.get("verification", []),
                "doNotPromote": [
                    interaction.get("id")
                    for interaction in contract.get("interactions", [])
                    if interaction.get("status") == "candidate"
                ],
            },
        })
    return {
        "schemaVersion": "1.0",
        "source": source,
        "inventory": str(Path(inventory_path).resolve()),
        "mode": "section-oriented",
        "status": "ready-for-agent" if validation["valid"] else "invalid",
        "validation": validation,
        "sections": sections,
        "globalConstraints": [
            "Keep section data contracts explicit; do not hardcode business data in visible HTML.",
            "Treat candidate interactions as unverified until both reference and library assertions pass.",
            "Use CDP computed style as evidence, not as a substitute for Roundtrip or screenshot validation.",
        ],
    }


def load_and_prepare_section_generation_input(
    inventory_path: str | Path,
    *,
    strict: bool = True,
) -> dict:
    path = Path(inventory_path).resolve()
    inventory = json.loads(path.read_text(encoding="utf-8"))
    return prepare_section_generation_input(inventory, path, strict=strict)
