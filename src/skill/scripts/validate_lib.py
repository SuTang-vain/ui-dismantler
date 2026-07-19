#!/usr/bin/env python3
"""Compatibility entry point for ``ui_dismantler.validation.library``."""

from _bootstrap import expose

expose("ui_dismantler.validation.library", globals())
expose("ui_dismantler.cli.validate_lib", globals())

if __name__ == "__main__":
    raise SystemExit(main())
