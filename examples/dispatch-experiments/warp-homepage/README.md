# Warp homepage dispatch experiment

Source snapshot:

```text
/Users/<user>/Downloads/Warp — The Agentic Development Environment (2026_7_22 16：32：26).html
```

This case validates the TypeScript visual-quality pipeline against a 3.0 MB SingleFile archive with 1,035 classes, 23 IDs, 98 SVG elements, embedded fonts/media, Tailwind arbitrary-value selectors, 95 original links, and no executable application scripts.

## Inspect the generated library

```bash
cd /Users/<user>/DEV/Baidu/ui-dismantler-browser-matrix-reuse
python3 -m http.server 4192 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:4192/examples/dispatch-experiments/warp-homepage/lib/examples/warp.html
```

Final measured output is in `results.json`; the detailed analysis is in `RESULTS.md`. Screenshot artifacts are stored in `artifacts/`.
