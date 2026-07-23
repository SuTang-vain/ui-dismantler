#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
EXP="$ROOT/examples/dispatch-experiments/qinshihuang-0716"
CASE="$ROOT/examples/cases/qinshihuang-0716-ts"
CLI="/Users/tangyaoyue/DEV/Baidu/ui-dismantler-component-planning/dist-ts/cli.js"
"$EXP/build.sh"
find "$EXP/lib/src" -name '*.js' -print0 | xargs -0 -n1 node --check
node "$CLI" validate "$EXP/lib"
node "$CLI" quality "$CASE/original.html" \
  --lib "$EXP/lib" \
  --manifest "$CASE/manifest.json" \
  --scenarios "$CASE/scenarios.json" \
  --interaction-coverage 0.8 \
  --viewports desktop,tablet,mobile,tiny \
  --out "$EXP/quality-report.json"
