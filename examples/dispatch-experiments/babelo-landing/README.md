# Babelo landing dispatch experiment

Source: `/Users/tangyaoyue/ZCodeProject/babelo-landing`

This case validates the TypeScript visual quality gates against a non-graph landing page containing Locomotive Scroll, async Google fonts, Blob URL data hydration, IntersectionObserver lazy/reveal behavior, nested horizontal scrolling, clipboard feedback, theme switching, and a long-running terminal demo state machine.

## Inspect the generated library

```bash
cd /Users/tangyaoyue/DEV/Baidu/ui-dismantler-browser-matrix-reuse
python3 -m http.server 4187 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:4187/examples/dispatch-experiments/babelo-landing/lib/examples/babelo.html
```

The compact measured result is in `results.json`; detailed conclusions are in `RESULTS.md`.
