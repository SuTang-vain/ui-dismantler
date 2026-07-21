"""Compatibility entry point for Gold delivery verification."""
from _bootstrap import expose

expose("ui_dismantler.evaluation.delivery", globals())
expose("ui_dismantler.cli.verify_delivery", globals())

if __name__ == "__main__":
    raise SystemExit(main())
