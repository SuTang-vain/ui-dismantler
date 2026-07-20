#!/usr/bin/env python3
"""Inspect canonical UI-IR with a composed quality profile."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from ui_dismantler.paths import SKILL_ROOT
from ui_dismantler.quality import inspect_uiir
from ui_dismantler.quality.knowledge import compose_profile, load_guidelines, load_profiles

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="UI-IR + quality profile -> Quality IR findings")
    parser.add_argument("uiir", type=Path)
    parser.add_argument("--profile", default="web-base")
    parser.add_argument("--guidelines-root", type=Path, default=SKILL_ROOT / "references" / "guidelines")
    parser.add_argument("-o", "--output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    try:
        document = json.loads(args.uiir.read_text(encoding="utf-8"))
        guidelines = load_guidelines(args.guidelines_root / "components")
        guidelines.update(load_guidelines(args.guidelines_root / "systems"))
        profiles = load_profiles(args.guidelines_root / "profiles")
        effective = compose_profile(args.profile, profiles, guidelines)
        report = inspect_uiir(document, effective)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"[quality] inspection failed: {exc}", file=sys.stderr); return 1
    if args.check:
        print(f"[quality] OK profile={effective['id']} findings={report['summary']['total']}"); return 0
    output = args.output or args.uiir.with_name(args.uiir.stem + ".quality.json")
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[quality] wrote {output} findings={report['summary']['total']}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
