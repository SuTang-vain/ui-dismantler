# Vue Element Admin SPA Router generalization case

## Source lock

- Repository: `https://github.com/PanJiaChen/vue-element-admin.git`
- Locked commit: `6858a9ad67483025f6a9432a926beb9327037be3`
- Framework: Vue 2.6.10 + Vue Router 3.0.2 + Vuex 3.1.0 + Element UI 2.13.2
- Source clone: external read-only test source; do not apply generated patches to it.

## Current evidence

### Static responsibility graph

`vue-router-responsibility.graph.json` records 195 scanned source files, 78 routes, 2 dynamic route patterns, 6 role-protected routes, and 152 evidence items. It identifies the framework-owned responsibilities:

- route construction and constant/async route tables;
- modular routes and lazy component imports;
- default Hash mode;
- `beforeEach`/`afterEach` guards;
- login whitelist and token check;
- role filtering and `router.addRoutes` dynamic injection;
- guard redirects, `router-view`, `router-link`, and matcher reset.

The graph is review-only and does not claim that a generic router can replace Vue Router.

### Semantic source baseline

`semantic-source.results.json` currently passes 6/6 scenarios:

1. unauthenticated Dashboard guard redirect;
2. admin login to Dashboard;
3. nested route after expanding `Nested Routes` and `Menu 1`;
4. Documentation navigation followed by history back;
5. admin Permission → Directive Permission;
6. Dashboard deep-link reload.

Observed gates:

- navigation integrity: `1.0`;
- runtime errors: `0`;
- required network failures: `0`;
- unmocked API requests: `0`;
- lifecycle blocking handles after close: `0`.

This is a source-only semantic baseline, **not** a generated-app fidelity claim.

### Patch comparison

- `phase-0-existing-algorithm/integration-patch-final/`: generic patch against Vue Router source; blocked with accurate reasons because no local `history.back()` helper or generic lifecycle bootstrap exists.
- `phase-1-vue-router-adapter/integration-patch/`: review-only Vue-aware observer patch; `applied=false`, `blocked=false`, 6 responsibility groups covered, 9 changed lines in 2 hunks. It observes framework-owned navigation and does not generate visual DOM/CSS.

## Gold+ acceptance result

The reviewed generated target now reconstructs the visual responsibilities that were previously placeholders:

- Login form structure, icons, tips, responsive layout, and password visibility control;
- Permission role switch, permission alerts, source tags, explanatory panel, and tab boundary;
- Dashboard panel group plus line, radar, pie, and bar chart responsibilities using the locked ECharts runtime;
- responsive Dashboard heights and component stacking for desktop, tablet, and mobile.

The target remains a **reviewed behavior-and-visual route target**, not a claim that the complete upstream Vue application was generated automatically. Vue Router ownership and dynamic route injection remain framework-owned.

## Network-isolated reference/generated Gold+ baseline

The formal matrix is stored in `reference-generated-semantic.network-isolated.results.json`, with three raw repetitions in `full-network-isolated-run-1.results.json` through `full-network-isolated-run-3.results.json`. All three runs produced identical quality metrics:

- scenario protocol: `6/6 PASS`;
- visual route states: `5/5 PASS`;
- viewport runs: `13`;
- worst computed style: `0.9912`;
- worst pixel diff: `0.012977`;
- navigation integrity: `19/19 = 1.0`;
- runtime errors: `0`;
- required and non-blocking network failures: `0`;
- stability failures: `0`;
- blocking handles after close: `0`;
- model calls: `0`.

The three-run total time range is `64090.468–64350.196 ms`; browser close is stable at `233.362–239.818 ms`. This excludes the earlier one-off Chromium close outlier and confirms that current fidelity results are deterministic under exact image fixtures.

Before/after changes:

- Permission tablet pixel diff: `0.028475 → 0.006511`;
- Login worst pixel diff: `0.157136 → 0.011186`;
- Dashboard desktop pixel diff: `0.151814 → 0.007159`;
- formal visual states: `1/5 → 5/5`.

The public-network and model-API disturbance variables are isolated: only exact `hostname + path + resourceType=image` fixtures are used, the upstream source is locked to commit `6858a9ad67483025f6a9432a926beb9327037be3`, and this generation/repair phase records `modelCalls=0`.

## SFC and ECharts responsibility graphs

The post-Gold+ generalization phase records the visual reconstruction responsibilities without applying source rewrites:

- `sfc-visual-responsibility.graph.json` covers 131 Vue SFC components, 69 interactive components, 7 direct chart components, scoped styles, media queries, template events, lifecycle hooks, child-component topology, and third-party dependencies.
- `echarts-responsibility.graph.json` covers 7 ECharts owners, the `macarons` theme, line/bar/pie/radar renderer types, option/data ownership, resize, watch, initialization, and dispose lifecycles.

Both graphs are review-only. They describe ownership needed by a future automatic target generator; they do not copy or apply upstream component code, and they do not change the requirement to pass the same Semantic Gold+ visual matrix.

## Automatic target candidate baseline

`generated-target-auto/` is a deterministic, review-only route/history/guard/fixture candidate generated from `route-shell.plan.json`. It intentionally contains no complex visual DOM or CSS.

Current automatic-candidate evidence:

- generated files: 5;
- generated lines: 174;
- model calls: 0;
- manual edits: 0;
- repair iterations: 0;
- matched routes: 6/6;
- matched guard responsibilities: 1/1;
- matched history responsibilities: `historyBack`;
- semantic responsibility delta against the reviewed target: 0;
- visual quality comparison: unavailable by design.

This candidate is not a full generated application and is not a Gold+ result. The next generator phase must materialize reviewed SFC visual owners and ECharts lifecycle boundaries into a separately served target before quality comparison is allowed.
