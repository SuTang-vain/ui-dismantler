"""Compatibility entry point for ``ui_dismantler.evaluation.batch``.

规范化实现已迁移至 ``src/ui_dismantler/evaluation/batch.py``（业务逻辑）和
``src/ui_dismantler/cli/verify_all.py``（CLI）。本文件仅作桥接。
"""

from _bootstrap import expose

expose("ui_dismantler.evaluation.batch", globals())
expose("ui_dismantler.cli.verify_all", globals())

if __name__ == "__main__":
    raise SystemExit(main())
