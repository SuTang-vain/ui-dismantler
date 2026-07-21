"""Compatibility entry point for section-oriented scaffold generation."""
from _bootstrap import expose

expose("ui_dismantler.generation.section_scaffold", globals())
expose("ui_dismantler.cli.generate_section_scaffold", globals())

if __name__ == "__main__":
    raise SystemExit(main())
