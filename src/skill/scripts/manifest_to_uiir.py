#!/usr/bin/env python3
"""Compatibility entry point; implementation: ``ui_dismantler.cli.manifest_to_uiir``."""

from _bootstrap import expose

expose("ui_dismantler.cli.manifest_to_uiir", globals())

if __name__ == "__main__":
    raise SystemExit(main())
