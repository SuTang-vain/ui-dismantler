# Qinshihuang dispatch experiment results

Date: 2026-07-23

## Final verdict

**Visual and behavioral dispatch: PASS.**

**Planning budget correction: PASS after SVG geometry decomposition.**

The first six-component dispatch proved that the plan could preserve visual and behavioral quality, but it underestimated `RelationshipCanvas` at 99 planned lines versus 468 actual lines. The corrected planner now detects four independent SVG geometry responsibilities and emits a ten-component plan. The implementation was refactored to those boundaries without changing the 150-line budget, and Gold+ remained green.

## Quality comparison

| Metric | Existing control library | Refactored dispatched TypeScript library | Gate |
|---|---:|---:|---:|
| Validation | 10/10 | 10/10 | 10/10 |
| Final overall | 0.9945 | 0.9943 | >= 0.85 |
| DOM | 0.998 | 0.998 | structure >= 0.70 |
| Visual | 0.9921 | 0.9919 | combined gate |
| Viewports | 4/4 | 4/4 | 4/4 |
| Worst computed style | 0.9898 | 0.9898 | >= 0.98 |
| Worst pixel diff | 0.007154 | 0.007919 | <= 0.02 |
| Formal scenarios | 4/4 | 4/4 | 4/4 |
| Critical scenario matrices | 1/1 | 1/1 | 1/1 |
| Selector coverage | 1.000 | 1.000 | 1.000 |
| Verified interaction coverage | 1.000 | 1.000 | >= 0.80 |
| Runtime errors | 0 | 0 | 0 |

## Corrected planned versus actual source size

| Component | Planned lines | Actual lines | Absolute error | Budget result |
|---|---:|---:|---:|---|
| ApplicationShell | 80 | 128 | 48 | PASS |
| RelationshipCanvas | 114 | 97 | 17 | PASS |
| GraphLayout | 112 | 122 | 10 | PASS |
| EdgeRenderer | 72 | 77 | 5 | PASS |
| EdgeLabelPlacement | 97 | 96 | 1 | PASS |
| GraphAnimationLoop | 40 | 13 | 27 | PASS |
| GraphNodeControl | 150 | 93 | 57 | PASS |
| GraphNodeGesture | 105 | 102 | 3 | PASS |
| EventControls | 150 | 106 | 44 | PASS |
| ModaloverlayDialog | 125 | 109 | 16 | PASS |

All ten component files are at or below 128 lines. Integration files remain within the same limit:

- `index.ts`: 136 lines
- `types.ts`: 67 lines
- `constants.ts`: 10 lines

For the corrected graph-geometry cluster, planned total size is 435 lines and actual total size is 405 lines. Per-file mean absolute error is 12 lines. The original monolithic prediction error was 369 lines (`99` planned versus `468` actual).

## Algorithm correction

The analyzer now inspects executable inline and local external scripts for:

- recursive permutation/backtracking search;
- nested geometry loops;
- trigonometric and distance calculations;
- collision, overlap, clearance, and obstacle semantics;
- `createElementNS(...)` SVG construction and path `d` writes;
- `getComputedTextLength`, `getBBox`, and canvas text measurement;
- `getBoundingClientRect` and scaled logical/visual coordinate conversion;
- `requestAnimationFrame` synchronization loops.

When independent responsibility clusters are present, the graph plan can emit:

- `GraphLayout`
- `EdgeRenderer`
- `EdgeLabelPlacement`
- `GraphAnimationLoop`

Synthetic implementation-responsibility components cannot steal DOM event ownership. For example, the graph-wrap pointerdown interaction remains owned by `RelationshipCanvas`, while geometry components stay interaction-free.

The second calibration pass groups geometry evidence by owning function and records function names, source-line intervals, statements, loops, calls, anchors, and role-specific metrics. Multi-graph pages now compare graph/canvas identifiers and selectors against these anchors, so geometry responsibilities are emitted only for the referenced region instead of being copied to every graph.

## Regression evidence

- Python tests: 314/314 PASS
- TypeScript tests: 36/36 PASS
- TypeScript typecheck/build: PASS
- Seven-case planning matrix: 7/7 ready, 131/131 interactions owned, zero over-budget components, zero planning errors
- Gold+ dispatched verification: PASS

Geometry boundaries were added only where corresponding script evidence exists. Non-graph cases retained their previous component counts.

## Compatibility finding retained

The roundtrip jsdom renderer does not execute inline ESM. The experiment therefore still emits a dependency-free classic single browser bundle for verification. Planning should later express the delivery/runtime contract explicitly (`ESM`, classic bundle/IIFE, Web Component, or adapter); `targetFile` alone is not sufficient.

## Remaining estimator limitation

`GraphAnimationLoop` remains intentionally overestimated at the 40-line planning floor because the planner reserves lifecycle and teardown budget even when the implementation is a compact wrapper. Existing control/event components also remain conservative. Function-cluster ownership has removed the previous global-script inflation; further calibration should use statement-level responsibility slicing inside mixed functions such as edge update plus label placement.
