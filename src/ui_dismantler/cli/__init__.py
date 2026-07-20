"""Command-line entry implementations.

CLI 层只负责参数解析、文件 IO 和调用业务层（analysis/generation/validation），
不包含业务逻辑。旧入口 ``src/skill/scripts/<tool>.py`` 通过 ``_bootstrap.py``
桥接到本层。
"""
