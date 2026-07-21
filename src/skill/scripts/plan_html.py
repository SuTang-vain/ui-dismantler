"""Compatibility entry point for ``ui_dismantler.cli.plan_html``."""
from _bootstrap import expose

expose("ui_dismantler.analysis.strategy", globals())
expose("ui_dismantler.cli.plan_html", globals())

if __name__ == "__main__":
    raise SystemExit(main())
