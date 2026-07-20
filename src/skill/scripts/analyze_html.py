"""Compatibility entry point for ``ui_dismantler.analysis.html``.

规范化实现已迁移至 ``src/ui_dismantler/analysis/html.py``（业务逻辑）和
``src/ui_dismantler/cli/analyze_html.py``（CLI）。本文件仅作桥接，让既有
``python3 src/skill/scripts/analyze_html.py`` 命令无需改动。
"""

from _bootstrap import expose

expose("ui_dismantler.analysis.html", globals())
expose("ui_dismantler.cli.analyze_html", globals())

if __name__ == "__main__":
    raise SystemExit(main())
