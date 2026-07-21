"""Compatibility entry point for bounded section artifact extraction."""
from _bootstrap import expose

expose("ui_dismantler.analysis.chunks", globals())
expose("ui_dismantler.cli.extract_sections", globals())

if __name__ == "__main__":
    raise SystemExit(main())
