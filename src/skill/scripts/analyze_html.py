#!/usr/bin/env python3
"""Compatibility entry point for ``ui_dismantler.analysis.html``."""

from _bootstrap import expose

expose("ui_dismantler.analysis.html", globals())
expose("ui_dismantler.cli.analyze_html", globals())

if __name__ == "__main__":
    raise SystemExit(main())
