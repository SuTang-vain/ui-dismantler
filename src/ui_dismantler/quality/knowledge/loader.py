"""Load and validate versioned knowledge records."""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Callable
from ..schema import validate_guideline, validate_profile

class KnowledgeLoadError(ValueError):
    pass

def _load(root: Path, validator: Callable[[Any], list[str]], kind: str) -> dict[str, dict[str, Any]]:
    if not root.is_dir():
        raise KnowledgeLoadError(f"{kind} directory does not exist: {root}")
    records: dict[str, dict[str, Any]] = {}
    for path in sorted(root.rglob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise KnowledgeLoadError(f"cannot load {path}: {exc}") from exc
        items = payload if isinstance(payload, list) else [payload]
        for index, item in enumerate(items):
            errors = validator(item)
            if errors:
                raise KnowledgeLoadError(f"invalid {kind} {path}[{index}]: {'; '.join(errors)}")
            if item["id"] in records:
                raise KnowledgeLoadError(f"duplicate {kind} id: {item['id']}")
            records[item["id"]] = dict(item, _path=str(path))
    return records

def load_guidelines(root: str | Path) -> dict[str, dict[str, Any]]:
    return _load(Path(root), validate_guideline, "guideline")

def load_profiles(root: str | Path) -> dict[str, dict[str, Any]]:
    return _load(Path(root), validate_profile, "profile")
