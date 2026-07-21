"""Compatibility entry point for section contract generation input."""
from _bootstrap import expose

expose("ui_dismantler.generation.section_contracts", globals())
expose("ui_dismantler.cli.prepare_section_generation", globals())

if __name__ == "__main__":
    raise SystemExit(main())
