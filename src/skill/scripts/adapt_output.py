"""Compatibility entry point for ``ui_dismantler.generation.adapt_output``.

规范化实现已迁移至 ``src/ui_dismantler/generation/adapt_output.py``（业务逻辑）和
``src/ui_dismantler/cli/adapt_output.py``（CLI）。本文件仅作桥接。
"""

from _bootstrap import expose

expose("ui_dismantler.generation.adapt_output", globals())
expose("ui_dismantler.cli.adapt_output", globals())

if __name__ == "__main__":
    raise SystemExit(main())
