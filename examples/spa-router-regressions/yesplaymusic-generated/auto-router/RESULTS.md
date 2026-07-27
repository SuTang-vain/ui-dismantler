# YesPlayMusic automatic router adapter experiment

## Scope

This experiment isolates route-shell generation from visual generation:

- the reviewed YesPlayMusic DOM and CSS are reused unchanged;
- only router, History API, guard redirect, and fixture registration responsibilities are generated;
- the generated scaffold does not claim to be a complete application;
- model calls during generation and quality execution are zero.

## Integration cost

- generated files: 5
- generated lines: 165
- adapter integration diff: 3 hunks / 22 changed lines
- repair iterations before the first control PASS: 0
- formal quality reports compared: 2

## Manual versus automatic-router control

Both targets use the same visual implementation. The generated target replaces the manual routing block with `generated/router.js`, `generated/routes.js`, and `generated/guards.js`.

| Gate | Manual control | Automatic router |
|---|---:|---:|
| Scenario protocol | 5/5 PASS | 5/5 PASS |
| Navigation integrity | 14/14 | 14/14 |
| Route visual states | 3/3 | 3/3 |
| Viewport runs | 9/9 | 9/9 |
| Worst computed style | 1.0000 | 1.0000 |
| Worst pixel diff | 0.000000 | 0.000000 |
| Runtime errors | 0 | 0 |
| Stability failures | 0 | 0 |
| Required network failures | 0 | 0 |
| Blocking handles after close | 0 | 0 |

The automatic router preserves route behavior and responsive visual output for this reviewed route shell.

## Upstream reference diagnostic

A separate run against the live Vue development reference preserved navigation integrity (`14/14`), computed style (`1.0`), and the prior reviewed pixel result (`0.006150`), but the run failed the runtime gate because the reference threw API response-shape errors such as `Cannot read properties of undefined (reading 'data')`. The automatic router target had zero runtime errors.

This diagnostic is not counted as an automatic-router quality failure. It shows why generated-router correctness and upstream fixture/runtime health must be reported independently.

## Performance boundary

A three-run alternating control baseline is now available:

| Metric | Manual median | Automatic median | Delta |
|---|---:|---:|---:|
| Total time | 13462.096 ms | 13355.836 ms | -106.260 ms |
| Visual matrix | 7218.733 ms | 7307.976 ms | +89.243 ms |
| Adaptive wait | 4352 ms | 4297 ms | -55 ms |
| Browser close | 13.956 ms | 12.798 ms | -1.158 ms |

Both variants passed 3/3 runs with zero runtime, stability, resource, and lifecycle failures. The automatic router shows no greater than 10% median total-time regression. This remains an experiment-scale result and should not be generalized to all SPA architectures.
