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


### Overlapped reviewed setup checkpoint and proxy transport evidence

The setup owner profile showed that visual capture consumed `76.61%` of the two authenticated owner runs, while storage serialization consumed less than `0.03%`. The runner now verifies a reviewed dashboard checkpoint (`hash` plus visible selector), publishes its storage state before the owner begins visual capture, and lets isolated contract consumers proceed concurrently. The owner still completes its full visual, runtime, resource, navigation, and lifecycle gates; a later owner failure still fails the complete report.

`contractConcurrency=3` overlaps only fresh BrowserContexts. No Page, DOM, network activity, or JavaScript runtime object is shared. Final assertions now use bounded adaptive polling so a route that is semantically complete but one render tick late does not create a concurrency-only false failure. The existing settled-frame, network-quiet, computed-style, pixel, and navigation thresholds remain unchanged.

A same-server three-run fast-shutdown A/B matrix retained `3/3` Gold+ passes for both variants. Median total runtime fell from `42.57 s` to `32.04 s` (`24.75%`), and median contract time fell from `21.10 s` to `10.27 s` (`51.34%`). Visual-matrix time changed by `+1.59%`, showing that the improvement comes from overlapping contract setup work rather than weakening visual waits. Fast shutdown was confirmed in all six runs, and blocking handles after close remained zero.

Transport planning now records runtime environment selections and separately models Vue/webpack dev-server proxy target and `pathRewrite` evidence. Rewritten upstream paths are not incorrectly added to browser fixture paths. The Vue Element Admin source has three runtime base-URL selections and no proxy route; dedicated fixtures verify dynamic proxy keys, environment-specific targets, and rewrite output.

Cross-run storage-state persistence remains disabled. An identity gate now proves that source commit, fixture hash, and setup/config hash—including the reviewed target revision—must all match before a persisted artifact could be considered. Current-run login verification remains mandatory. Evidence: `semantic-gold-setup-owner-profile.results.json`, `semantic-gold-setup-overlap-fast-final.results.json`, the three `semantic-gold-setup-overlap-fast-control-run-*.results.json` files, the three optimized `semantic-gold-setup-overlap-fast-run-*.results.json` files, and `semantic-gold-setup-overlap-fast-summary.json`.

### Resource-aware visual scheduling and phase telemetry

The route-state matrix now reports cumulative queue time, context creation, navigation, initial settle, scenario steps, pre/post-anchor stability, computed-style capture, PNG encoding, pixel comparison, context close, DOM/layout/network blocker samples, Canvas scan cost, and peak active BrowserContexts. These measurements are observational and do not shorten the existing settled-frame, network-quiet, style, pixel, navigation, or lifecycle gates.

Reviewed visual states declare either `dom` or `canvas` resource profiles. The Vue Element Admin matrix keeps `visualConcurrency=3`, but limits target capture to three, Canvas/ECharts capture to two, and PNG comparison to one. Every target still runs in a fresh isolated BrowserContext; only admission to the capture and comparison critical sections is scheduled.

A same-server three-run A/B comparison retained `3/3` Semantic Gold+ for both variants. Median total time changed from `31.10 s` to `30.97 s` (`0.42%` lower), while median visual-matrix time changed from `20.84 s` to `20.72 s` (`0.58%` lower). More importantly, visual-matrix standard deviation fell `43.94%` and its range fell `49.71%`. The formal run recorded zero network-blocked stability samples, confirming that the observed variance belongs to Canvas/layout scheduling rather than public-network or model-API instability.

To prevent Git evidence growth, the repository keeps one final full report plus `semantic-gold-resource-aware-summary.json`; the six raw A/B reports remain external and are represented by SHA-256 hashes in the summary.
