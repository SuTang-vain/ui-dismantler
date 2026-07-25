# TypeScript visual quality performance baseline — 2026-07-24

This baseline runs the strict quality gate three times for four representative cases using:

```text
browserMode=shared-browser
browserConcurrency=1
browserResourceCache=run-local
browserStability=adaptive
interactionCoverage=1
```

Raw samples and aggregate statistics are stored in `quality-baseline-2026-07-24.json`.

## Result

All 12 runs passed. Runtime errors, required resource failures, and stability failures were all zero.

| Case | Median total | Std dev | CV | Initial + scenario visual share | Stability failure rate |
|---|---:|---:|---:|---:|---:|
| BLACKPINK | 35.935s | 1.939s | 5.5% | 66.3% | 0% |
| Babelo | 58.773s | 3.539s | 6.0% | 78.8% | 0% |
| Qinshihuang | 13.336s | 0.189s | 1.4% | 51.4% | 0% |
| Sandadui | 15.889s | 1.279s | 8.4% | 49.0% | 0% |

## Browser phase medians

| Case | DOM stability | Network idle | Scenario execution | Screenshots | Pixel diff |
|---|---:|---:|---:|---:|---:|
| BLACKPINK | 12.818s | 3.556s | 14.073s | 3.826s | 0.467s |
| Babelo | 38.985s | 12.350s | 15.532s | 1.647s | 0.462s |
| Qinshihuang | 1.034s | 0.869s | 0.907s | 1.409s | 0.203s |
| Sandadui | 1.276s | 0.856s | 1.191s | 1.391s | 0.208s |

## Conclusions

1. Babelo and BLACKPINK are dominated by state settling and scenario execution rather than screenshot encoding or pixel diff.
2. Pixel comparison is below 0.5 seconds at the median for every case, so optimizing pixelmatch is not currently valuable.
3. Qinshihuang is the most stable timing reference; its total coefficient of variation is 1.4%.
4. Sandadui has the highest relative variance at 8.4%, but no quality or stability failures occurred.
5. The next performance work should target reference/generated resource-state synchronization and repeated scenario settling, not lower quality thresholds or longer global timeouts.

## Babelo readiness and font-alignment follow-up

After the baseline, the tool added font-face alignment telemetry and fixed adaptive readiness for offscreen controls. A three-run Babelo follow-up is stored in `babelo-readiness-font-alignment-2026-07-24.json`.

| Metric | Original median | Follow-up median | Change |
|---|---:|---:|---:|
| Total quality time | 58.773s | 61.780s | +5.1% |
| Initial visual matrix | 7.523s | 7.373s | -2.0% |
| Critical scenario visual matrix | 38.816s | 37.974s | -2.2% |
| DOM stability | 38.985s | 38.196s | -2.0% |
| Scenario execution | 15.532s | 15.382s | -1.0% |
| Browser close | 3.226s | 6.604s | +104.7% |

All three follow-up runs passed with zero stability failures. The active evaluation phases improved slightly, but total runtime did not improve because Chromium shutdown time increased by roughly 3.4 seconds. Therefore this iteration is classified as a **quality/stability improvement, not a proven end-to-end speedup**. The attempted global adaptive font-preflight skip was rejected and reverted after measurement showed no benefit.

## 2026-07-25 four-case repeat

A second four-case × three-run baseline is stored in `quality-baseline-2026-07-25.json`. All **12/12** runs passed with zero runtime, stability, required-resource, or navigation failures.

| Case | Median total | Std dev | Change from 2026-07-24 | Browser close median |
|---|---:|---:|---:|---:|
| BLACKPINK | 35.298s | 0.673s | -1.8% | 0.245s |
| Babelo | 61.299s | 0.791s | +4.3% | 7.976s |
| Qinshihuang | 12.474s | 0.243s | -6.5% | 0.246s |
| Sandadui | 14.666s | 0.084s | -7.7% | 0.244s |

The repeat confirms that Babelo is the only case with material Chromium shutdown latency. Its active quality phases remain stable; the close phase is the outlier.

### Explicit page-close experiment (rejected)

`babelo-explicit-page-close-2026-07-25.json` records a three-run experiment that explicitly closed both pages in parallel before closing each context and finally the browser.

| Metric | Baseline median | Explicit page close | Change |
|---|---:|---:|---:|
| Total quality time | 61.299s | 61.872s | +0.9% |
| Browser close | 7.976s | 7.099s | -11.0% |
| Explicit page close | — | 0.198s | added |
| Context close | — | 0.271s | measured |

All runs passed, but end-to-end time did not improve and variance increased. The explicit-close behavior was therefore reverted. The experiment narrows the remaining cost to final Chromium process shutdown rather than page/context cleanup.
