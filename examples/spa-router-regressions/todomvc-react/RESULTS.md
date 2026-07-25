# TodoMVC React SPA regression — 2026-07-25

## Target selection

`https://todomvc.com/` is an implementation index rather than one application. This regression targets the official React implementation at:

```text
https://todomvc.com/examples/react/dist/
```

The application uses hash routes:

```text
#/
#/active
#/completed
```

Todo state is recreated inside every isolated BrowserContext; no backend Todo API fixture is required.

## Source contract

Eight reviewed scenarios were executed:

1. add two todos;
2. complete one item and open the Active route;
3. complete one item and open the Completed route;
4. double-click and edit a todo;
5. hover and destroy a completed todo;
6. clear completed todos;
7. toggle all todos;
8. navigate between filters and use browser back.

Actual result:

```text
8/8 scenarios PASS
runtime errors: 0
unmocked API requests: 0
source navigation contract: 8/8
```

The first run exposed an assertion precision issue: substring-based `absentText: "Task Alpha"` also matched `Task Alpha Updated`. The runner now supports `absentExactText`; the edit scenario passed without removing or weakening the assertion.

## Same-target route-state visual control

Four reviewed states were replayed at three viewports:

```text
1024x768
768x1024
390x844
```

Actual result:

```text
contract scenarios: 8/8 PASS
route states: 4/4 PASS
visual viewport runs: 12/12 PASS
worst computed style: 1.0
worst pixel diff: 0.0
navigation integrity: 20/20, rate 1.0
runtime errors: 0
unmocked API requests: 0
```

The control uses the live React application as both reference and generated target. It validates deterministic execution, selector capture, hash-route comparison, scroll-anchor normalization, computed-style comparison, and pixel comparison. It is not a translation-fidelity result because no generated TodoMVC target has been supplied.

## Protocol improvements produced by the case

The generic SPA scenario protocol now supports:

```text
dblclick
hover
absentExactText
absentSelector
selectorCount
```

A local synthetic regression covers these behaviors without depending on the public site.

## Execution reuse and adaptive stability optimization

The original dual-target contract plus visual matrix took:

```text
88.45 seconds
```

The optimized runner now:

- executes reference and generated contract targets in parallel;
- captures reviewed 1024x768 route states during the base contract run;
- reuses those captures in the desktop visual matrix;
- keeps tablet and mobile runs in fresh isolated BrowserContexts;
- waits for DOM mutation, ResizeObserver, layout signature, network, fonts, and images to settle before capture.

Three repeated live-site runs produced:

```text
round 1: 54.516s
round 2: 53.364s
round 3: 57.840s
median: 54.516s
mean: 55.240s
standard deviation: 2.324s
failure rate: 0%
stability failure rate: 0%
```

Median wall time improved by approximately 38.4% without reducing scenarios, viewports, or thresholds. Every round reported:

```text
contractTargetRuns: 16
visualTargetRuns: 24
visualTargetReusedRuns: 8
visualTargetFreshRuns: 16
stabilityFailures: 0
worstComputedStyle: 1.0
worstPixelDiff: 0.0
```

The adaptive stability negative regression continuously mutates a DOM attribute. It must fail both `visual-runtime` and `scenario-viewport-matrix`, proving that continuous mutation is not silently captured as stable.

## Artifacts

- `contract.config.json` — source-only reviewed contract;
- `contract-results.json` — actual source execution report;
- `dual-control.config.json` — same-target multi-viewport control;
- `dual-control-results.json` — actual dual-target control report;
- `router-contract.json` — route and readiness inventory;
- `performance-results.json` — three-run timing, variance, reuse, and stability measurements;
- `visual-artifacts/` — reference/generated/diff PNGs for four states across three viewports.
