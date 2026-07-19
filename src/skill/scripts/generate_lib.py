#!/usr/bin/env python3
"""Compatibility entry point for ``ui_dismantler.generation.library``."""

from _bootstrap import expose

expose("ui_dismantler.generation.library", globals())
expose("ui_dismantler.cli.generate_lib", globals())

if __name__ == "__main__":
    raise SystemExit(main())
