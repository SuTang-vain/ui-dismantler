#!/usr/bin/env python3
"""Compatibility entry point; implementation: ``ui_dismantler.cli.uiir_diff``."""

from _bootstrap import expose

expose("ui_dismantler.cli.uiir_diff", globals())

if __name__ == "__main__":
    raise SystemExit(main())
