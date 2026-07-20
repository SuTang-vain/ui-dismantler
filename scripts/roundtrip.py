"""Compatibility entry point for ``ui_dismantler.evaluation.roundtrip``.

规范化实现已迁移至 ``src/ui_dismantler/evaluation/roundtrip.py``（业务逻辑）和
``src/ui_dismantler/cli/roundtrip.py``（CLI）。本文件仅作桥接。

注意：``RENDERER`` 和 ``SKILL_DIR_DEFAULT`` 仍从此处导出（旧调用方可能引用），
它们来自 ``ui_dismantler.evaluation.roundtrip`` 模块。
"""

from _bootstrap import expose

expose("ui_dismantler.evaluation.roundtrip", globals())
expose("ui_dismantler.cli.roundtrip", globals())

if __name__ == "__main__":
    raise SystemExit(main())
