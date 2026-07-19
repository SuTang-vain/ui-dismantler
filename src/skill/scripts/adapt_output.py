#!/usr/bin/env python3
"""Compatibility entry point for ``ui_dismantler.generation.adapt_output``."""

from _bootstrap import expose

expose("ui_dismantler.generation.adapt_output", globals())
expose("ui_dismantler.cli.adapt_output", globals())

if __name__ == "__main__":
    raise SystemExit(main())
