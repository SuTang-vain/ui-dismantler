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

## Automatic visual target v1 experiment

`visual-target.plan.json` is now generated from the SFC/ECharts responsibility graphs plus the reviewed route-shell plan. It records four route-state visual boundaries, 20 implementation owners, four chart owners, five responsive owners, and zero unresolved routes. Acceptance selectors remain separate from generated `data-visual-owner` selectors.

`generated-target-auto-v1/` is a separately served deterministic target. It was generated without copying the reviewed target implementation and records `modelCalls=0`, artifact `manualEdits=0`, and two generator-algorithm repair iterations.

Measured on July 27, 2026:

- Semantic navigation-only: `6/6 PASS`, navigation integrity `1.0`, runtime/network failures `0`;
- first visual pass: `0/5` route states, worst computed style `0.693`, worst pixel diff `0.105903`;
- repair 1: `1/5`, worst computed style `0.9474`, worst pixel diff `0.100716`;
- repair 2: `1/5`, worst computed style `0.9474`, worst pixel diff `0.101232`;
- best current iteration: repair 1;
- reviewed baseline remains `5/5`, computed style `0.9912`, pixel diff `0.012977`.

Therefore auto-v1 is a runnable and quantitatively comparable generated application, but **not** a Gold+ target. The remaining work is visual-generation quality, primarily Dashboard source geometry/responsive row reconstruction and Permission Element UI structure; route semantics, lifecycle, runtime, and network isolation are already passing.

### Template structure and primitive generation phase

The automatic visual planner now records SFC template topology, source component order, inline visual declarations, conditions, loops, slots, Element UI primitive ownership, and responsive `el-col` spans. The Vue Element Admin graph now contains 1,185 template nodes, 225 Element UI primitives, and 12 responsive grid nodes; the selected visual target consumes 166 nodes, 47 primitives, and 10 responsive grid nodes. ECharts owners additionally retain bounded `setOption` object slices, series counts, literal data-array counts, and container-height evidence.

The generated Dashboard grid is now derived from source `xs/sm/md/lg/xl` span evidence rather than fixed case-specific breakpoints. The formally correct topology keeps three desktop chart columns, one tablet chart column, a `12/6/6` desktop bottom row, a `24 + 12/12` tablet bottom row, and a stacked mobile row. The latest correct-topology matrix remains `1/5`; worst computed style is `0.9474` and worst pixel diff is `0.100226`. Semantic navigation remains `6/6`, navigation integrity `1.0`, and runtime/network/stability failures remain zero. This is not Gold+ yet, but the remaining gap is now isolated to primitive DOM/style/data materialization rather than route ownership or responsive-grid inference.


### Primitive DOM and source-style materialization phase

The automatic target now compiles selected `templateStructure.nodes` into auditable Primitive DOM nodes, style rules, and interaction bindings. Literal text order is preserved around child primitives, primitive identifiers are owner-scoped to prevent cross-component style collisions, local `SvgIcon` files are embedded by source evidence, and available SFC CSS/SCSS is compiled during analysis instead of recreating Login geometry from screenshot calibration.

The Vue graph records 17 embedded SVG assets, 74 compiled/raw style sheets, and four style sheets that remain explicit compile failures. The selected target compiles 60 Primitive DOM nodes, seven source/primitive style rules, and seven interaction bindings with `modelCalls=0` and artifact manual edits `0`.

The latest formal matrix on July 27, 2026 improved the automatic target from `1/5` to `3/5` route states:

- Login: style `1.0`, worst pixel diff `0.002634`, PASS across desktop/tablet/mobile;
- Permission: style `0.9825`, worst pixel diff `0.018210`, PASS across desktop/tablet;
- Nested: style `0.9825`, worst pixel diff `0.005009`, PASS;
- overall navigation integrity: `19/19 = 1.0`;
- runtime, required network, and stability failures: `0`;
- Dashboard/deep-link remain blocked at worst style `0.9474` and pixel diff `0.100789`.

The target is still **not** full Gold+. The next algorithm phase is the ECharts option-slice consumer plus Dashboard data-cardinality and selected child-style materialization; thresholds remain unchanged.

### ECharts option, data-cardinality, and source-layout consumer phase

The automatic generator now parses safe static JavaScript expressions into auditable literal/reference trees, records top-level SFC data bindings and array cardinalities, and consumes the real bounded ECharts option slices at runtime. Vue Element Admin currently contributes 19 static bindings and 47 cardinality records; Dashboard line-series data, Todo cardinality, four chart option objects, chart constants, chart heights, PanelGroup responsive spans/gutters, Dashboard row gutters, local panel SVG geometry, and selected child source styles are consumed without model calls or artifact edits. Unsupported expressions remain explicit review boundaries.

The first combined pass exposed a real regression (`worstPixelDiff=0.141507`) because fallback CSS and source-owned Todo/BoxCard primitives were both active. Boundary-level geometry telemetry then removed the conflicting fallback responsibility and derived responsive row/column gaps from `el-row`/`el-col` evidence. The latest measured matrix is still `3/5`, but Dashboard worst pixel diff improved from the prior `0.100789` baseline to `0.043440`; navigation integrity remains `1.0`, and runtime, required-network, and stability failures remain zero. This is a material automatic-fidelity improvement, but it is **not** Gold+ because Dashboard still exceeds `0.02` and computed style remains below `0.98`. The next blocker is the internal Element UI table/card/progress and API-fixture responsibility boundary, not route or responsive topology.
