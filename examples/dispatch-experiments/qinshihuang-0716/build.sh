#!/usr/bin/env bash
set -euo pipefail
EXP="$(cd "$(dirname "$0")" && pwd)"
TSC="/Users/tangyaoyue/DEV/Baidu/ui-dismantler-component-planning/node_modules/.bin/tsc"
rm -rf "$EXP/.build-cjs" "$EXP/lib/src/components" "$EXP/lib/src/index.js" "$EXP/lib/src/constants.js" "$EXP/lib/src/types.js"
"$TSC" -p "$EXP/tsconfig.bundle.json"
node "$EXP/bundle-commonjs.mjs"
