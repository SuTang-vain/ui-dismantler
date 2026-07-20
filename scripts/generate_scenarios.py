"""Compatibility entry point for ``ui_dismantler.evaluation.scenario_generator``.

规范化实现已迁移至 ``src/ui_dismantler/evaluation/scenario_generator.py``（业务逻辑）和
``src/ui_dismantler/cli/generate_scenarios.py``（CLI）。本文件仅作桥接。
"""

from _bootstrap import expose

expose("ui_dismantler.evaluation.scenario_generator", globals())
expose("ui_dismantler.cli.generate_scenarios", globals())

if __name__ == "__main__":
    raise SystemExit(main())
