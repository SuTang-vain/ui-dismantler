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

A first-pass `generated-target-auto-v2/` candidate is also recorded beside the reviewed target. It consumes the Router-to-SFC, SFC visual, API fixture, SPA auth, transport proxy, and route-shell evidence, generated 5 route entries, compiled 2 owner roots into 133 visual nodes and 13 interaction bindings in 102 generated lines, and used 0 model calls / 0 manual edits. Its independent Semantic route contract passes 6/6 scenarios with navigation integrity 1.0, generated runtime errors 0, unmocked API requests 0, and blocking handles after close 0. It is intentionally not part of the Gold+ frozen target: the route contract is comparable, but computed-style/pixel fields are absent and no visual-equivalence claim is made.

The generated target does not copy the source Vue runtime implementation. It uses an independent History API route shell and materializes reviewed visual styles as scoped responsibility output. Dynamic task pages remain route-shell boundaries rather than being represented as fully generated business pages.
