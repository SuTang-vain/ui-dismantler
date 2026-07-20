"""Compatibility entry point for ``ui_dismantler.evaluation.scenario_coverage``.

规范化实现已迁移至 ``src/ui_dismantler/evaluation/scenario_coverage.py``。
本文件仅作桥接，让既有 ``from scenario_coverage import X`` 调用无需改动。
"""

from _bootstrap import expose

expose("ui_dismantler.evaluation.scenario_coverage", globals())
