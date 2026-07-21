#!/usr/bin/env python3
"""Validate Quality capabilities and report Profile-scoped acceptance gates."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from ui_dismantler.paths import SKILL_ROOT
from ui_dismantler.quality.capabilities import assess_acceptance_gate, load_capability_registry


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="validate Quality capabilities and assess inspect/repair readiness")
    default_root = SKILL_ROOT / "references" / "guidelines"
    parser.add_argument("--guidelines-root", type=Path, default=default_root)
    parser.add_argument("--registry", type=Path, default=default_root / "capabilities.json")
    parser.add_argument("--profile", default="web-base", help="Profile ID, or 'all' for repository-wide assessment")
    parser.add_argument("-o", "--output", type=Path)
    checks = parser.add_mutually_exclusive_group()
    checks.add_argument("--check", "--check-repair", dest="check_repair", action="store_true", help="exit nonzero while the automatic-repair gate is blocked")
    checks.add_argument("--check-inspect", action="store_true", help="exit nonzero while the selected Profile is not inspect-ready")
    args = parser.parse_args(argv)
    try:
        registry = load_capability_registry(args.registry)
        profile_id = None if args.profile == "all" else args.profile
        report = assess_acceptance_gate(registry, args.guidelines_root, profile_id=profile_id)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"[quality-gate] failed: {exc}", file=sys.stderr)
        return 1
    if args.output:
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    scope = report["profile"]["id"] if report["profile"] else "all"
    print(
        f"[quality-gate] {report['status'].upper()} profile={scope} "
        f"inspect={report['inspectStatus'].upper()} enabled={report['enabledGuidelineCount']} "
        f"capabilities={report['capabilityCount']} blockers={len(report['blockers'])}"
    )
    for blocker in report["blockers"]:
        target = f" {blocker['guidelineId']}" if blocker["guidelineId"] else ""
        print(f"[quality-gate] blocker {blocker['phase']}:{blocker['code']}{target}: {blocker['message']}")
    if args.check_inspect and report["inspectStatus"] != "ready":
        return 2
    if args.check_repair and report["status"] != "eligible":
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
