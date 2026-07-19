#!/usr/bin/env python3
"""Deprecated compatibility wrapper for ``python3 scripts/test.py``."""

from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).resolve().parents[1] / "test.py"), run_name="__main__")
