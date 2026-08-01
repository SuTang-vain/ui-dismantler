#!/usr/bin/env python3
"""Fail-closed preflight for the portable ui-dismantler Skill runtime."""

from __future__ import annotations

import json
import shutil
import sys


def main() -> int:
    issues: list[str] = []
    runtime_root = None
    source_root = None
    cli = None
    try:
        from _bootstrap import RUNTIME_ROOT, SOURCE_ROOT, typescript_cli_path
        runtime_root = RUNTIME_ROOT
        source_root = SOURCE_ROOT
        cli = typescript_cli_path()
    except (ImportError, RuntimeError) as error:
        issues.append(str(error))
    if shutil.which("python3") is None:
        issues.append("python3 executable is unavailable")
    if shutil.which("node") is None:
        issues.append("node executable is unavailable")
    result = {
        "schemaVersion": "1.0",
        "kind": "ui-dismantler-tool-preflight",
        "ready": not issues,
        "runtimeRoot": str(runtime_root) if runtime_root else None,
        "pythonSourceRoot": str(source_root) if source_root else None,
        "typescriptCli": str(cli) if cli else None,
        "issues": issues,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ready"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
