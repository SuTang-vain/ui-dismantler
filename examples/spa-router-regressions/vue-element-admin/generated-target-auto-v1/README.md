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
