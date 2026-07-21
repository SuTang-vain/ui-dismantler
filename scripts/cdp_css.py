"""Compatibility entry point for the optional Chromium CDP CSS collector."""
from _bootstrap import expose

expose("ui_dismantler.cli.cdp_css", globals())

if __name__ == "__main__":
    raise SystemExit(main())
