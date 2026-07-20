"""Compatibility bootstrap for legacy Skill script entry points.

规范化实现位于 ``src/ui_dismantler`` 包。本模块让既有的
``python3 src/skill/scripts/<tool>.py`` 命令无需 editable 安装即可工作：
把 ``src`` 加入 ``sys.path`` 后，将规范模块的符号透出到旧扁平命名空间。

用法（在旧入口脚本中）::

    from _bootstrap import expose
    expose("ui_dismantler.core.common", globals())
"""

from __future__ import annotations

from importlib import import_module
from pathlib import Path
import sys
from types import ModuleType
from typing import MutableMapping

SOURCE_ROOT = Path(__file__).resolve().parents[2]
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))


def expose(module_name: str, namespace: MutableMapping[str, object]) -> ModuleType:
    """把规范模块的顶层符号透出到旧扁平命名空间。

    Args:
        module_name: 规范模块的完整 dotted path，如 ``ui_dismantler.core.common``。
        namespace: 旧入口脚本的 globals()，透出后旧脚本的 ``from _common import X`` 仍可用。
    """
    module = import_module(module_name)
    namespace.update(
        (name, value)
        for name, value in vars(module).items()
        if not name.startswith("__")
    )
    return module
