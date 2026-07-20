"""Compatibility entry point for ``ui_dismantler.generation.showcase``.

规范化实现已迁移至 ``src/ui_dismantler/generation/showcase.py``（业务逻辑）和
``src/ui_dismantler/cli/generate_showcase.py``（CLI）。本文件仅作桥接。
"""

from _bootstrap import expose

expose("ui_dismantler.generation.showcase", globals())
expose("ui_dismantler.cli.generate_showcase", globals())

if __name__ == "__main__":
    raise SystemExit(main())
