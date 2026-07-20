"""Compatibility entry point for ``ui_dismantler.core.common``.

规范化实现已迁移至 ``src/ui_dismantler/core/common.py``。本文件仅作桥接，
让既有脚本的 ``from _common import X`` 调用无需改动。新代码请直接 import
``ui_dismantler.core.common``。
"""

from _bootstrap import expose

expose("ui_dismantler.core.common", globals())
