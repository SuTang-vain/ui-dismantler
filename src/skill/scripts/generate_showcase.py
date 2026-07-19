#!/usr/bin/env python3
"""Compatibility entry point for ``ui_dismantler.generation.showcase``."""

from _bootstrap import expose

expose("ui_dismantler.generation.showcase", globals())
expose("ui_dismantler.cli.generate_showcase", globals())

if __name__ == "__main__":
    raise SystemExit(main())
