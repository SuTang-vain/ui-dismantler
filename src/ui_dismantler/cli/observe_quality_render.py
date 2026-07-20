#!/usr/bin/env python3
"""Collect bounded render observations for explicit UI-IR targets."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from ui_dismantler.quality.observation import observe_render, targets_from_uiir

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="local HTML + UI-IR -> render observations")
    parser.add_argument("html", type=Path)
    parser.add_argument("uiir", type=Path)
    parser.add_argument("-o", "--output", type=Path)
    parser.add_argument("--viewport", action="append", default=[], metavar="ID:WIDTHxHEIGHT")
    parser.add_argument("--timeout", type=int, default=5000)
    parser.add_argument("--settle", type=int, default=100)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    try:
        uiir = json.loads(args.uiir.read_text(encoding="utf-8"))
        targets = targets_from_uiir(uiir)
        viewports = []
        for raw in args.viewport:
            viewport_id, dimensions = raw.split(":", 1)
            width, height = dimensions.lower().split("x", 1)
            viewports.append({"id": viewport_id, "width": int(width), "height": int(height)})
        report, warnings = observe_render(args.html, targets, viewports=viewports or None, timeout_ms=args.timeout, settle_ms=args.settle)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"[quality-render] failed: {exc}", file=sys.stderr); return 1
    for warning in warnings:
        print(f"[quality-render] warning: {warning}", file=sys.stderr)
    if args.check:
        print(f"[quality-render] OK targets={len(targets)} observations={len(report['observations'])} warnings={len(warnings)}"); return 0
    output = args.output or args.uiir.with_name(args.uiir.stem + ".render.json")
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[quality-render] wrote {output} observations={len(report['observations'])}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
