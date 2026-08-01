"""Portable runtime locator for installed ui-dismantler Skill entry points.

The Skill bundle intentionally contains only guidance and thin wrappers. Canonical
Python and TypeScript implementations stay in the repository runtime selected by:

1. ``UI_DISMANTLER_RUNTIME_ROOT``
2. ``<skill>/.ui-dismantler-runtime.json``
3. ``~/.config/ui-dismantler/runtime.json``
4. the repository that contains this wrapper (development checkout only)
"""

from __future__ import annotations

from importlib import import_module
import json
import os
from pathlib import Path
import sys
from types import ModuleType
from typing import MutableMapping

SKILL_ROOT = Path(__file__).resolve().parents[1]
LOCAL_RUNTIME_LOCATOR = SKILL_ROOT / ".ui-dismantler-runtime.json"
USER_RUNTIME_LOCATOR = Path.home() / ".config" / "ui-dismantler" / "runtime.json"


def _locator_root(path: Path) -> Path | None:
    if not path.is_file():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"invalid ui-dismantler runtime locator: {path}: {error}") from error
    if isinstance(value, str):
        candidate = value
    elif isinstance(value, dict):
        candidate = value.get("runtimeRoot") or value.get("repositoryRoot")
    else:
        candidate = None
    if not isinstance(candidate, str) or not candidate.strip():
        raise RuntimeError(f"ui-dismantler runtime locator has no runtimeRoot: {path}")
    root = Path(os.path.expandvars(os.path.expanduser(candidate)))
    return root.resolve() if root.is_absolute() else (path.parent / root).resolve()


def _candidate_roots():
    """Yield candidates lazily so a valid higher-priority root masks stale lower-priority locators."""
    env_root = os.environ.get("UI_DISMANTLER_RUNTIME_ROOT", "").strip()
    if env_root:
        yield "UI_DISMANTLER_RUNTIME_ROOT", Path(os.path.expandvars(os.path.expanduser(env_root))).resolve()
    for label, locator in (("skill locator", LOCAL_RUNTIME_LOCATOR), ("user locator", USER_RUNTIME_LOCATOR)):
        root = _locator_root(locator)
        if root is not None:
            yield label, root
    yield "development checkout", Path(__file__).resolve().parents[3]


def locate_runtime_root(*, require_typescript: bool = False) -> Path:
    failures: list[str] = []
    for label, root in _candidate_roots():
        python_package = root / "src" / "ui_dismantler" / "__init__.py"
        typescript_cli = root / "dist-ts" / "cli.js"
        missing = []
        if not python_package.is_file():
            missing.append("src/ui_dismantler/__init__.py")
        if require_typescript and not typescript_cli.is_file():
            missing.append("dist-ts/cli.js")
        if not missing:
            return root
        failures.append(f"{label}={root} missing {', '.join(missing)}")
    detail = "; ".join(failures) or "no runtime candidates"
    raise RuntimeError(
        "ui-dismantler runtime is unavailable. Run scripts/install_skill.mjs from a built repository "
        "or set UI_DISMANTLER_RUNTIME_ROOT. " + detail
    )


RUNTIME_ROOT = locate_runtime_root()
SOURCE_ROOT = RUNTIME_ROOT / "src"
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))


def typescript_cli_path() -> Path:
    """Return the TypeScript CLI from the same canonical runtime used by Python."""
    cli = RUNTIME_ROOT / "dist-ts" / "cli.js"
    if not cli.is_file():
        raise RuntimeError(
            f"ui-dismantler TypeScript runtime is unavailable: {cli}. "
            "Run npm run build:ts in the configured runtime repository."
        )
    return cli


def expose(module_name: str, namespace: MutableMapping[str, object]) -> ModuleType:
    """Expose canonical module symbols through a legacy Skill wrapper namespace."""
    module = import_module(module_name)
    namespace.update(
        (name, value)
        for name, value in vars(module).items()
        if not name.startswith("__")
    )
    return module
