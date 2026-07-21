"""Compatibility entry point for the scaffold generator."""
from _bootstrap import expose

expose("ui_dismantler.generation.scaffold", globals())
expose("ui_dismantler.cli.generate_scaffold", globals())

if __name__ == "__main__":
    raise SystemExit(main())
