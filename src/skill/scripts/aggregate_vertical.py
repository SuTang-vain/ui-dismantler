#!/usr/bin/env python3
"""Compatibility entry point for ``ui_dismantler.aggregation.vertical``."""

from _bootstrap import expose

expose("ui_dismantler.aggregation.vertical", globals())
expose("ui_dismantler.cli.aggregate_vertical", globals())

if __name__ == "__main__":
    raise SystemExit(main())
