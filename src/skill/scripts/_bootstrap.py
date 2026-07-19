"""Compatibility bootstrap for legacy Skill script entry points.

Canonical implementations live in ``src/ui_dismantler``.  This module keeps
existing ``python src/skill/scripts/<tool>.py`` commands working without an
editable package installation.
"""

from importlib import import_module
from pathlib import Path
import sys
from types import ModuleType
from typing import MutableMapping

SOURCE_ROOT = Path(__file__).resolve().parents[2]
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))


def expose(module_name: str, namespace: MutableMapping[str, object]) -> ModuleType:
    """Expose a canonical module through a legacy flat module path."""
    module = import_module(module_name)
    namespace.update(
        (name, value)
        for name, value in vars(module).items()
        if not name.startswith("__")
    )
    return module
