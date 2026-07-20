#!/usr/bin/env python3
"""Validate the Quality capability matrix and report the repair acceptance gate."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from ui_dismantler.paths import SKILL_ROOT
from ui_dismantler.quality.capabilities import assess_acceptance_gate, load_capability_registry


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="validate Quality capabilities and assess automatic-repair readiness")
    default_root = SKILL_ROOT / "references" / "guidelines"
    parser.add_argument("--guidelines-root", type=Path, default=default_root)
    parser.add_argument("--registry", type=Path, default=default_root / "capabilities.json")
    parser.add_argument("-o", "--output", type=Path)
    parser.add_argument("--check", action="store_true", help="exit nonzero while the acceptance gate is blocked")
    args = parser.parse_args(argv)
    try:
        registry = load_capability_registry(args.registry)
        report = assess_acceptance_gate(registry, args.guidelines_root)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"[quality-gate] failed: {exc}", file=sys.stderr)
        return 1
    if args.output:
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"[quality-gate] {report['status'].upper()} guidelines={report['guidelineCount']} "
        f"capabilities={report['capabilityCount']} blockers={len(report['blockers'])}"
    )
    for blocker in report["blockers"]:
        scope = f" {blocker['guidelineId']}" if blocker["guidelineId"] else ""
        print(f"[quality-gate] blocker {blocker['code']}{scope}: {blocker['message']}")
    return 2 if args.check and report["status"] != "eligible" else 0


if __name__ == "__main__":
    raise SystemExit(main())
