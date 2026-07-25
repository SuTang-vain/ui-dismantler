import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateBenchmarkSamples, type BenchmarkSample } from "../benchmarks/quality-baseline.js";
import { summarizeNumbers } from "../benchmarks/statistics.js";

function sample(round: number, totalMs: number, stabilityFailures = 0, passed = true): BenchmarkSample {
  return {
    caseId: "fixture",
    round,
    passed,
    scores: { dom: 1, visual: 0.99, overall: 0.994 },
    failedGates: passed ? [] : ["viewport-matrix"],
    timing: { analyzeMs: 1, validateMs: 2, roundtripMs: 3, visualMatrixMs: 4, scenarioStateMs: 5, scenarioVisualMatrixMs: 6, spaRouterMs: 0, totalMs },
    browserTiming: { launchMs: 1, contextCreateMs: 1, contextInitMs: 1, pageCreateMs: 1, navigationMs: 2, settleMs: 3, domStabilityMs: 4, networkIdleMs: 5, fixedWaitMs: 0, fontPreflightMs: 0, timerGraceMs: 0, resourceScanMs: 1, signatureScanMs: 1, scenarioExecutionMs: 1, scrollAnchorMs: 0, snapshotEvaluationMs: 1, screenshotMs: 1, pixelDiffMs: 1, artifactWriteMs: 1, closeMs: 1, browserDisconnectMs: 0, browserProcessCloseMs: 1, totalMs: totalMs - 1 },
    workload: { interactions: 2, formalScenarios: 1, criticalScenarios: 1, coverageWaivers: 0, viewports: 4, scenarioViewportRuns: 4, spaRouterScenarios: 0, spaRouterViewportRuns: 0 },
    quality: { worstSelectorCoverage: 1, worstComputedStyle: 0.99, worstPixelDiff: 0.01, runtimeErrors: 0, stabilityFailures, resourceFailures: 0, externalAvailabilityFailures: 0, navigationFailures: 0, worstNavigationIntegrity: 1 },
  };
}

test("numeric summaries use sample variance and deterministic median", () => {
  assert.deepEqual(summarizeNumbers([100, 110, 130]), {
    count: 3,
    min: 100,
    max: 130,
    mean: 113.333,
    median: 110,
    variance: 233.333,
    standardDeviation: 15.275,
    coefficientOfVariation: 0.135,
  });
});

test("quality baseline aggregation reports median, variance, and failure rates", () => {
  const aggregate = aggregateBenchmarkSamples([sample(1, 100), sample(2, 110, 1, false), sample(3, 130)]).fixture;
  assert.equal(aggregate.samples, 3);
  assert.equal(aggregate.passedRuns, 2);
  assert.equal(aggregate.failedRuns, 1);
  assert.equal(aggregate.failureRate, 0.333333);
  assert.equal(aggregate.stabilityFailureRate, 0.333333);
  assert.equal(aggregate.timing.totalMs.median, 110);
  assert.equal(aggregate.timing.totalMs.variance, 233.333);
  assert.equal(aggregate.browserTiming.totalMs.median, 109);
});
