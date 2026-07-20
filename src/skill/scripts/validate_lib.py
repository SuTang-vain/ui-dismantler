"""Compatibility entry point for ``ui_dismantler.validation.library``.

规范化实现已迁移至 ``src/ui_dismantler/validation/library.py``（业务逻辑）和
``src/ui_dismantler/cli/validate_lib.py``（CLI）。本文件仅作桥接。
"""

from _bootstrap import expose

expose("ui_dismantler.validation.library", globals())
expose("ui_dismantler.cli.validate_lib", globals())

if __name__ == "__main__":
    raise SystemExit(main())
