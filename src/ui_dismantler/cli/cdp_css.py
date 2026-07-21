"""Optional Chromium CDP CSS evidence collector.

The collector is intentionally outside the static analyzer's default path:
Chrome availability, browser version, font loading and remote resources can
vary. A missing browser must become an explicit unavailable result, not a
false static pass.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys

from ui_dismantler.paths import PROJECT_ROOT


PROBE = PROJECT_ROOT / "scripts" / "cdp_css_probe.mjs"
DEFAULT_CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="用 Chromium CDP 采集页面 matched CSS/computed style 证据")
    ap.add_argument("html", help="HTML 文件路径")
    ap.add_argument("--manifest", help="包含 meta.analysisPlan.sectionInventory 的 manifest")
    ap.add_argument("--selector", action="append", default=[], help="额外 CSS selector，可重复")
    ap.add_argument("--out", required=True, help="CDP 证据 JSON 输出路径")
    ap.add_argument("--chrome", default=str(DEFAULT_CHROME), help="Chrome/Chromium 可执行文件")
    ap.add_argument("--max-samples", type=int, default=12)
    args = ap.parse_args(argv)

    html = Path(args.html).resolve()
    out = Path(args.out).resolve()
    if not html.is_file():
        print(f"ERROR: 文件不存在: {html}", file=sys.stderr)
        return 1
    if not PROBE.is_file():
        print(f"ERROR: CDP 探针不存在: {PROBE}", file=sys.stderr)
        return 2
    if not args.manifest and not args.selector:
        print("ERROR: 至少提供 --manifest 或 --selector", file=sys.stderr)
        return 2

    command = ["node", str(PROBE), str(html), "--out", str(out), "--chrome", args.chrome]
    if args.manifest:
        command.extend(["--selectors-file", str(Path(args.manifest).resolve())])
    for selector in args.selector:
        command.extend(["--selector", selector])
    if args.max_samples >= 0:
        command.extend(["--max-samples", str(args.max_samples)])
    proc = subprocess.run(command, capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stderr.strip() or f"CDP 探针退出码 {proc.returncode}", file=sys.stderr)
        return 2
    try:
        result = json.loads(out.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: CDP 结果读取失败: {exc}", file=sys.stderr)
        return 2
    print(f"状态: {result.get('status')} / comparable={result.get('comparable')}")
    print(f"证据文件: {out}")
    print(f"selectors: {len(result.get('selectors', []))}")
    if result.get("error"):
        print(f"告警: {result['error']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
