"""Compatibility entry point for ``ui_dismantler.analysis.detectors``.

规范化实现已迁移至 ``src/ui_dismantler/analysis/detectors.py``。本文件仅作
桥接，让既有脚本的 ``from view_detectors import X`` 调用无需改动。新代码
请直接 import ``ui_dismantler.analysis.detectors``。
"""

from _bootstrap import expose

expose("ui_dismantler.analysis.detectors", globals())
