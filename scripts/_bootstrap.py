"""Compatibility bootstrap for legacy ``scripts/`` entry points.

规范化实现位于 ``src/ui_dismantler`` 包。本模块让既有
``python3 scripts/<tool>.py`` 命令无需 editable 安装即可工作：
把 ``src`` 加入 ``sys.path`` 后，将规范模块的符号透出到旧扁平命名空间。

与 ``src/skill/scripts/_bootstrap.py`` 是对称的两份桥接基础设施
（分别服务 scripts/ 和 src/skill/scripts/ 两个旧入口目录）。
"""

from __future__ import annotations

from importlib import import_module
from pathlib import Path
import sys
from types import ModuleType
from typing import MutableMapping

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = PROJECT_ROOT / "src"
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))


def expose(module_name: str, namespace: MutableMapping[str, object]) -> ModuleType:
    """把规范模块的顶层符号透出到旧扁平命名空间。"""
    module = import_module(module_name)
    namespace.update(
        (name, value)
        for name, value in vars(module).items()
        if not name.startswith("__")
    )
    return module
