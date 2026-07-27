# Generated visual target auto-v1

Deterministic visual target generated from the reviewed route-shell plan and visual responsibility evidence.

- model calls: 0
- artifact manual edits: 0
- generated files: 4
- generated lines: 363
- selected visual owners: 20
- primitive DOM nodes: 86
- primitive style rules: 11
- primitive interaction bindings: 7
- review required: true
- reviewed target source copied: no

Run Semantic navigation before visual Gold+. Formal measured iterations and remaining blockers are recorded in experiment.metrics.json and the parent case README.

## Final measured status

The API-fixture + Element UI primitive + canvas-stability phase continues to pass the formal Semantic Gold+ matrix after the Canvas efficiency work:

- scenario protocol: 6/6
- visual states: 5/5
- viewport runs: 13
- navigation integrity: 1.0
- worst computed style: 0.9825
- worst pixel diff: 0.018210
- runtime / required-network / stability failures: 0
- model calls: 0
- generated artifact manual edits: 0

The reviewed `authenticated-dashboard-default` visual equivalence class reuses the stable Dashboard capture for `admin-deep-link-reload` only after matching role, viewport, capture selectors, final route, successful scenario assertions, and a failure-free source capture. Three repeated Gold+ runs retained the same quality result. Reviewed Dashboard state reuse reduced median total runtime to 60.91 s; isolated `visualConcurrency=3` viewport execution then reduced it to 47.67 s. Relative to the 77.99 s baseline, total runtime fell 38.88%, visual-matrix wall time fell 51.21%, and aggregate adaptive wait fell from 79.25 s to 42.28 s.

Canvas telemetry now reports pixel-scan time, candidate samples, cache hits, signature changes, coalesced invalidation batches, post-anchor skips, and reviewed state reuse. API fixtures use reviewed `transport-suffix` matching; the planner records `/dev-api`, `/prod-api`, and `/stage-api` from the imported request client plus concrete `.env` assignments instead of depending on one handwritten transport path.

Evidence: `semantic-navigation-reviewed-state-reuse-final.results.json`, `semantic-gold-reviewed-state-reuse-final.results.json`, `semantic-gold-reviewed-state-reuse-summary.json`, and `semantic-gold-parallel-viewports-summary.json`.


### Auditable animation completion and reviewed setup reuse

The visual runner now recognizes ZRender canvases through `data-zr-dom-id` and attributes them to ECharts only when an `_echarts_instance_` host is present. A completion signal is emitted only for a specific Canvas version after its draw invalidations drain through the existing quiet window; the global DOM/layout/network checks and settled-frame requirement remain unchanged. The three formal setup-reuse runs observed `57..62` ECharts completion signals and zero standalone ZRender signals.

Authenticated scenarios explicitly declare the reviewed setup class `authenticated-admin`, a three-step login checkpoint, and resume route `/#/dashboard`. One full login is still executed per reference/generated target. Later scenarios restore the captured cookies/local storage into a **new isolated BrowserContext**, skip only the reviewed three-step prefix, and execute their remaining route contract normally. No Page, BrowserContext, DOM, network activity, or runtime object is shared.

A controlled three-run A/B comparison on July 27, 2026 retained all unchanged Gold+ gates in both variants. Setup reuse skipped `24` contract steps and `54` visual steps, reducing median total runtime from `51.63 s` to `49.02 s` (`5.06%`), contract time from `24.96 s` to `23.04 s` (`7.69%`), and visual-matrix time from `25.91 s` to `25.06 s` (`3.27%`). Evidence: `semantic-gold-setup-reuse-final.results.json`, the three `semantic-gold-setup-reuse-run-*.results.json` files, and `semantic-gold-setup-reuse-summary.json`.
