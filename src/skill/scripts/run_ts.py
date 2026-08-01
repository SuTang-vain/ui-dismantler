#!/usr/bin/env python3
"""Run the canonical TypeScript CLI from an installed Skill bundle."""

from __future__ import annotations

import shutil
import subprocess
import sys


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args == ["--help"] or args == ["-h"]:
        print("usage: run_ts.py <ui-dismantler command> [arguments]")
        print("example: run_ts.py component-accept original.html --lib ./component-library")
        return 0
    node = shutil.which("node")
    if node is None:
        print("ERROR: node executable is unavailable", file=sys.stderr)
        return 2
    try:
        from _bootstrap import typescript_cli_path
        cli = typescript_cli_path()
    except (ImportError, RuntimeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    return subprocess.run([node, str(cli), *args], check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
