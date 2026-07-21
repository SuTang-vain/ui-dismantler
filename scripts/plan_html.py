"""Compatibility entry point for the scale-aware HTML strategy planner."""
from _bootstrap import expose

expose("ui_dismantler.analysis.strategy", globals())
expose("ui_dismantler.cli.plan_html", globals())

if __name__ == "__main__":
    raise SystemExit(main())
