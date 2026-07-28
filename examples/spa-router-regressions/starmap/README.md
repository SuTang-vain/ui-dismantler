# Starmap generated Gold+ regression

This case validates a responsibility-guided, independently implemented Vite/Vue 3 SPA target against the frozen Starmap reference build.

## Covered boundaries

- Vue Router 4 HTML5 history and strict history-state equivalence
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

The generated target does not copy the source Vue runtime implementation. It uses an independent History API route shell and materializes reviewed visual styles as scoped responsibility output. Dynamic task pages remain route-shell boundaries rather than being represented as fully generated business pages.
