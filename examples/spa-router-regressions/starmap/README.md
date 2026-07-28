# Starmap generated Gold+ regression

This case validates a responsibility-guided, independently implemented Vite/Vue 3 SPA target against the frozen Starmap reference build.

## Covered boundaries

- Vue Router 4 HTML5 history and strict history-state equivalence
- router-to-import-to-SFC ownership graph for visual root selection
- Composition API `await` response-to-`ref.value` data flow
- Axios `get/post/put/delete` endpoint extraction
- dynamic `import()` API symbol ownership
- Vite `loadEnv` and dynamic proxy-prefix evidence
- query token → `sessionStorage` → Authorization header responsibility
- ThemeInput and ModelProfiles visual boundaries
- profile list and editor modal interaction states
- desktop, tablet, and mobile route-state visual matrices

## Frozen outcome

- Semantic route contract: 6/6 PASS
- Strict route contract: 6/6 PASS
- reviewed visual states: 3
- viewport runs: 9
- worst computed style: 1.0
- worst pixel diff: 0.002519
- navigation integrity: 1.0
- runtime/network/stability failures: 0
- blocking handles after close: 0
- model API calls during quality runs: 0

The router-to-SFC graph is review-only: unresolved route bindings block ownership promotion, and acceptance selectors/text never become implementation ownership evidence when the graph is available.

The deterministic `generated-target-auto-v2/` now consumes Router-to-SFC, SFC visual, reviewed API fixture, state-write, SPA auth, transport proxy, global style context, and route-shell evidence. It does not copy the source Vue runtime and uses no model calls or manual edits.

## Auto-v2 responsibility runtime outcome

The original first pass was recorded before repairs:

- reviewed-region worst computed style: `0.7018`
- reviewed-region worst pixel diff: `0.610122`
- full-viewport worst pixel diff: `0.727333`

The generic algorithm now provides:

- handler state-write evidence from SFC AST
- pure helper return extraction
- Primitive Interaction Executor
- conditional-region materialization
- reviewed fixture-driven `v-for` cardinality
- template field binding
- structurally inferred reviewed fixture selection
- structurally proven date/locale display functions
- router-view-owned global style context
- owner-scoped source style materialization
- transparent but actionable route behavior shell

Generated target evidence:

- independent Semantic route contract: `6/6 PASS`
- reviewed visual states: `3/3 PASS`
- reviewed-region viewport runs: `9/9 PASS`
- full-viewport runs: `9/9 PASS`
- worst computed style: `0.9868`
- worst pixel diff: `0.00295`
- navigation integrity: `1.0`
- runtime/network/stability failures: `0`
- blocking handles after close: `0`
- source stylesheets: `2/2`
- global style contexts: `1`
- executable interaction bindings: `11`
- executable state writes: `42`
- runtime condition bindings: `9`
- reviewed fixture bindings: `1`
- generated loop instances: `2`
- resolved/unresolved text bindings: `21/1`
- inferred fixture selections: `1`
- model calls: `0`
- manual edited lines: `0`
- repair iterations recorded in the generated artifact: `0`

This is a Gold+ pass for the reviewed ThemeInput, ModelProfiles list, and ModelProfiles editor boundaries across desktop, tablet, and mobile. `fullGeneratedApplication` remains `false`: dynamic progress, review, and export pages are still behavior-shell boundaries and are not claimed as fully generated visual pages. Raw before/after reports remain available, while `auto-v2-visual-baseline.summary.json` is the compact auditable comparison.
