import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeHtml } from "../analysis/analyzer.js";
import { planComponents } from "../planning/components.js";
import { runQualityGate } from "../workflow/pipeline.js";

const root = new URL("../../", import.meta.url).pathname;

const planningCases = [
  { id: "blackpink-star-group-ts", html: "original.html", profile: "blackpink", base: "examples/cases" },
  { id: "ciyu-scrollbar-ts", html: "original.html", profile: "interactive-encyclopedia", base: "examples/cases" },
  { id: "diegovz-home-0722-ts", html: "planning-fixture.html", profile: "portfolio", base: "examples/cases" },
  { id: "liu-haocun-0722-ts", html: "original.html", profile: "liu-haocun-0722", base: "examples/cases" },
  { id: "qingyu-nian-graph-ts", html: "original.html", profile: "historical-drama", base: "examples/cases" },
  { id: "qinshihuang-0716-ts", html: "original.html", profile: "graph", base: "examples/cases" },
  { id: "sandadui-graph-ts", html: "original.html", profile: "generic", base: "examples/cases" },
  { id: "sun-wukong-0722-ts", html: "original.html", profile: "sun-wukong", base: "examples/cases" },
  { id: "babelo-landing", html: "source/index.html", profile: "generic", base: "examples/dispatch-experiments" },
  { id: "warp-homepage", html: "source/index.html", profile: "generic", base: "examples/dispatch-experiments" },
] as const;

test("formal planning regression keeps all representative cases dispatch-ready", () => {
  for (const item of planningCases) {
    const htmlPath = `${root}${item.base}/${item.id}/${item.html}`;
    const manifest = analyzeHtml(htmlPath, { profile: item.profile });
    const report = planComponents(manifest, { lineBudget: 150 });
    assert.equal(report.summary.ready, true, `${item.id}: planning must be dispatch-ready`);
    assert.equal(report.summary.overBudget, 0, `${item.id}: no component may exceed 150 lines`);
    assert.equal(report.summary.errors, 0, `${item.id}: planning errors must remain zero`);
    assert.equal(report.summary.unownedInteractions, 0, `${item.id}: every interaction must have an owner`);
    assert.equal(report.summary.ownedInteractions, report.summary.interactions, `${item.id}: interaction ownership must remain complete`);
  }
});

test("YesPlayMusic frozen Semantic Gold+ regression preserves reviewed route fidelity and artifact identity", () => {
  const caseDir = `${root}examples/spa-router-regressions/yesplaymusic-generated`;
  const config = JSON.parse(readFileSync(`${caseDir}/semantic-gold.config.json`, "utf8"));
  const report = JSON.parse(readFileSync(`${caseDir}/semantic-results.json`, "utf8"));
  const frozen = JSON.parse(readFileSync(`${caseDir}/frozen-artifact.json`, "utf8"));
  const routeShellPlan = JSON.parse(readFileSync(`${caseDir}/route-shell.plan.json`, "utf8"));
  const routeShellMetrics = JSON.parse(readFileSync(`${caseDir}/route-shell.metrics.json`, "utf8"));

  assert.equal(frozen.scope, "reviewed-partial-route-shell", "the generated route shell must not be represented as the full application");
  assert.equal(frozen.modelCallsDuringQualityRun, 0, "quality evidence must remain isolated from model API availability");
  for (const [relativePath, expectedHash] of Object.entries(frozen.files as Record<string, string>)) {
    const actualHash = createHash("sha256").update(readFileSync(`${caseDir}/${relativePath}`)).digest("hex");
    assert.equal(actualHash, expectedHash, `${relativePath}: frozen artifact hash changed without review`);
  }

  assert.equal(routeShellPlan.reviewRequired, true);
  assert.equal(routeShellPlan.generatedCode, false);
  assert.equal(routeShellPlan.routes.length, 5);
  assert.equal(routeShellPlan.transitions.some((transition: { action: string; from: string; to: string }) => transition.action === "guard-redirect" && transition.from === "/library" && transition.to === "/login"), true);
  assert.equal(routeShellMetrics.modelCalls, 0);
  assert.equal(routeShellMetrics.manualEdits, 0);
  assert.equal(routeShellMetrics.repairIterations, 0);
  assert.equal(routeShellMetrics.requiresHumanReview, true);

  assert.equal(config.navigationComparison, "semantic");
  assert.deepEqual(config.visualMatrix.viewports.map((viewport: { id: string }) => viewport.id), ["desktop", "tablet", "mobile"]);
  assert.equal(report.passed, true);
  assert.equal(report.scenariosPassed, 5);
  assert.equal(report.scenariosTotal, 5);
  assert.equal(report.navigationIntegrity.rate, 1);
  assert.equal(report.navigationIntegrity.failures, 0);
  assert.equal(report.visualMatrix.viewportRuns, 9);
  assert.equal(report.visualMatrix.worstComputedStyle >= 0.98, true);
  assert.equal(report.visualMatrix.worstPixelDiff <= 0.02, true);
  assert.equal(report.visualMatrix.stabilityFailures, 0);
  assert.ok(report.visualMatrix.preAnchorWaitMs > 0);
  assert.ok(report.visualMatrix.postAnchorWaitMs > 0);
  assert.equal(typeof report.visualMatrix.requestClassifications["non-blocking-telemetry"], "number");
  assert.equal(report.visualMatrix.scenarios.every((scenario: { viewports: Array<{ requiredNetworkFailureDetails: string[]; nonBlockingNetworkFailureDetails: string[] }> }) => scenario.viewports.every((viewport) => Array.isArray(viewport.requiredNetworkFailureDetails) && Array.isArray(viewport.nonBlockingNetworkFailureDetails))), true);
  assert.equal(report.runtimeErrors, 0);
  assert.equal(report.requiredNetworkFailures, 0);
  assert.equal(report.telemetry.activeHandlesAfterClose.totalBlockingHandles, 0);
});

const runGoldRegression = process.env.UI_DISMANTLER_GOLD_REGRESSION === "1";


test("YesPlayMusic automatic router adapter preserves the manual route shell quality contract", () => {
  const caseDir = `${root}examples/spa-router-regressions/yesplaymusic-generated/auto-router`;
  const frozen = JSON.parse(readFileSync(`${caseDir}/frozen-artifact.json`, "utf8"));
  const generation = JSON.parse(readFileSync(`${caseDir}/generation.metrics.json`, "utf8"));
  const experiment = JSON.parse(readFileSync(`${caseDir}/experiment.metrics.json`, "utf8"));
  const manual = JSON.parse(readFileSync(`${caseDir}/manual-control-results.json`, "utf8"));
  const automatic = JSON.parse(readFileSync(`${caseDir}/semantic-results.json`, "utf8"));
  const upstream = JSON.parse(readFileSync(`${caseDir}/semantic-upstream-results.json`, "utf8"));
  const performance = JSON.parse(readFileSync(`${caseDir}/performance-baseline.json`, "utf8"));
  const patch = JSON.parse(readFileSync(`${caseDir}/integration-patch/integration.metrics.json`, "utf8"));

  assert.equal(frozen.scope, "auto-router-adapter-experiment");
  assert.equal(frozen.generatedVisualDom, false);
  assert.equal(frozen.modelCalls, 0);
  for (const [relativePath, expectedHash] of Object.entries(frozen.files as Record<string, string>)) {
    const actualHash = createHash("sha256").update(readFileSync(`${caseDir}/${relativePath}`)).digest("hex");
    assert.equal(actualHash, expectedHash, `${relativePath}: automatic route-shell artifact changed without review`);
  }

  assert.equal(generation.generatedCode, true);
  assert.equal(generation.reviewRequired, true);
  assert.equal(generation.generatedLines, 165);
  assert.equal(generation.manualEdits, 3);
  assert.equal(generation.manualEditedLines, 22);
  assert.equal(generation.repairIterations, 0);
  assert.equal(generation.diff.responsibility.missingRoutes.length, 0);
  assert.equal(generation.diff.responsibility.missingGuards.length, 0);
  assert.equal(generation.diff.responsibility.missingCapabilities.length, 0);
  assert.equal(generation.qualityComparison.comparable, true);
  assert.equal(generation.qualityComparison.passed, true);

  for (const report of [manual, automatic]) {
    assert.equal(report.passed, true);
    assert.equal(report.scenariosPassed, 5);
    assert.equal(report.navigationIntegrity.rate, 1);
    assert.equal(report.visualMatrix.viewportRuns, 9);
    assert.equal(report.visualMatrix.worstComputedStyle, 1);
    assert.equal(report.visualMatrix.worstPixelDiff, 0);
    assert.equal(report.runtimeErrors, 0);
    assert.equal(report.visualMatrix.stabilityFailures, 0);
    assert.equal(report.requiredNetworkFailures, 0);
    assert.equal(report.telemetry.activeHandlesAfterClose.totalBlockingHandles, 0);
  }
  assert.equal(experiment.conclusion.qualityEquivalent, true);
  assert.equal(experiment.conclusion.singleRunPerformanceConclusionAllowed, false);
  assert.equal(experiment.conclusion.threeRunPerformanceBaselineAvailable, true);
  assert.equal(experiment.conclusion.performanceRegression, false);
  assert.equal(experiment.integrationPatch.blocked, false);
  assert.equal(experiment.integrationPatch.applied, false);
  assert.equal(experiment.integrationPatch.changedLines, 22);
  assert.equal(experiment.integrationPatch.manualCodeEditsAfterPatchGeneration, 0);
  assert.equal(experiment.integrationPatch.previewMatchesReviewedAdapter, true);
  assert.equal(patch.reviewRequired, true);
  assert.equal(patch.applied, false);
  assert.equal(patch.blocked, false);
  assert.equal(patch.changedLines, 22);
  assert.equal(patch.changedHunks, 6);
  assert.equal(readFileSync(`${caseDir}/integration-patch/app.js.preview`, "utf8"), readFileSync(`${caseDir}/app.js`, "utf8"));
  assert.equal(performance.runsPerVariant, 3);
  assert.equal(performance.manual.passRate, 1);
  assert.equal(performance.automatic.passRate, 1);
  assert.equal(performance.manual.stablePassRate, 1);
  assert.equal(performance.automatic.stablePassRate, 1);
  assert.equal(performance.conclusion.qualityEquivalent, true);
  assert.equal(performance.conclusion.performanceRegression, false);
  assert.ok(performance.automatic.totalMs.median <= performance.manual.totalMs.median * 1.1);
  assert.equal(experiment.delta.navigationIntegrity, 0);
  assert.equal(experiment.delta.worstComputedStyle, 0);
  assert.equal(experiment.delta.worstPixelDiff, 0);

  assert.equal(upstream.passed, false, "the diagnostic must remain visibly distinct from the passing control experiment");
  assert.equal(upstream.navigationIntegrity.rate, 1);
  assert.equal(upstream.generated.runtimeErrors, 0);
  assert.ok(upstream.reference.runtimeErrors > 0);
  assert.ok(upstream.visualMatrix.runtimeErrors > 0);
  assert.equal(upstream.requiredNetworkFailures, 0);
});

test("BLACKPINK Gold+ regression preserves initial and critical interaction matrices", { skip: !runGoldRegression, timeout: 600_000 }, async () => {
  const caseDir = `${root}examples/cases/blackpink-star-group-ts`;
  const browserMode = (process.env.UI_DISMANTLER_BROWSER_MODE ?? "legacy") as "legacy" | "shared-browser";
  const browserConcurrency = Number(process.env.UI_DISMANTLER_BROWSER_CONCURRENCY ?? "1");
  const browserResourceCache = (process.env.UI_DISMANTLER_BROWSER_RESOURCE_CACHE ?? "off") as "off" | "run-local";
  const browserStability = (process.env.UI_DISMANTLER_BROWSER_STABILITY ?? "fixed") as "fixed" | "adaptive";
  const report = await runQualityGate({
    htmlPath: `${caseDir}/original.html`,
    libDir: `${caseDir}/lib`,
    manifestPath: `${caseDir}/manifest.json`,
    scenarioPath: `${caseDir}/scenarios.json`,
    visualArtifactsDir: `${caseDir}/artifacts-regression`,
    browserMode,
    browserConcurrency,
    browserResourceCache,
    browserStability,
  });

  assert.equal(report.passed, true);
  assert.equal(report.validation.passed, 10);
  assert.equal(report.validation.failed, 0);
  assert.equal(report.roundtrip.score?.structure.nodeMatchRate, 1);
  assert.equal(report.roundtrip.score?.text.textMatchRate, 1);
  assert.equal(report.browserMatrix?.viewports.length, 4);
  assert.equal(report.browserMatrix?.runtimeErrors, 0);
  assert.ok((report.browserMatrix?.worstSelectorCoverage ?? 0) >= 1);
  assert.ok((report.browserMatrix?.worstComputedStyle ?? 0) >= 0.98);
  assert.ok((report.browserMatrix?.worstPixelDiff ?? 1) <= 0.02);

  const criticalIds = new Set((report.scenarioVisualMatrices ?? []).map((matrix) => matrix.scenarioId));
  for (const required of ["enter-members-and-select-jennie", "enter-works-and-next", "open-work-story", "open-more-modal-from-entry"]) {
    assert.equal(criticalIds.has(required), true, `missing critical visual matrix: ${required}`);
  }
  assert.equal(report.scenarioVisualMatrices?.every((matrix) => matrix.passed), true);
  assert.equal(report.coverage?.verifiedRate, 1);
  assert.equal(report.telemetry.workload.formalScenarios, 6);
  assert.equal(report.telemetry.workload.criticalScenarios, 4);
  assert.equal(report.telemetry.workload.viewports, 4);
  assert.equal(report.telemetry.workload.scenarioViewportRuns, 16);
  assert.ok(report.telemetry.timing.scenarioVisualMatrixMs > 0);
  assert.ok(report.telemetry.timing.totalMs > 0);
  if (browserMode !== "legacy") assert.equal(report.telemetry.browser?.mode, browserMode);
  if (browserResourceCache === "run-local") assert.ok((report.telemetry.browser?.workload.resourceCacheHits ?? 0) > 0);
});

test("Babelo Gold+ regression preserves structured coverage and critical visual matrices", { skip: !runGoldRegression, timeout: 900_000 }, async () => {
  const caseDir = `${root}examples/dispatch-experiments/babelo-landing`;
  const browserMode = (process.env.UI_DISMANTLER_BROWSER_MODE ?? "legacy") as "legacy" | "shared-browser";
  const browserConcurrency = Number(process.env.UI_DISMANTLER_BROWSER_CONCURRENCY ?? "1");
  const browserResourceCache = (process.env.UI_DISMANTLER_BROWSER_RESOURCE_CACHE ?? "off") as "off" | "run-local";
  const browserStability = (process.env.UI_DISMANTLER_BROWSER_STABILITY ?? "fixed") as "fixed" | "adaptive";
  const report = await runQualityGate({
    htmlPath: `${caseDir}/source/index.html`,
    libDir: `${caseDir}/lib`,
    manifestPath: `${caseDir}/manifest.json`,
    scenarioPath: `${caseDir}/scenarios.json`,
    visualArtifactsDir: `${caseDir}/artifacts-regression`,
    browserMode,
    browserConcurrency,
    browserResourceCache,
    browserStability,
    thresholds: { interactionCoverage: 1 },
  });

  assert.equal(report.passed, true, JSON.stringify({
    failedGates: report.gates.filter((gate) => !gate.passed),
    initialStability: report.browserMatrix?.viewports.flatMap((viewport) => viewport.stabilityFailureDetails.map((detail) => ({ viewport: viewport.id, ...detail }))),
    scenarioStability: report.scenarioVisualMatrices?.flatMap((matrix) => matrix.viewports.flatMap((viewport) => viewport.stabilityFailureDetails.map((detail) => ({ scenario: matrix.scenarioId, viewport: viewport.id, ...detail })))),
  }, null, 2));
  assert.equal(report.validation.passed, 10);
  assert.equal(report.validation.failed, 0);
  assert.equal(report.roundtrip.score?.structure.nodeMatchRate, 1);
  assert.equal(report.roundtrip.score?.text.textMatchRate, 1);
  assert.equal(report.browserMatrix?.viewports.length, 4);
  assert.equal(report.browserMatrix?.runtimeErrors, 0);
  assert.ok((report.browserMatrix?.worstSelectorCoverage ?? 0) >= 1);
  assert.ok((report.browserMatrix?.worstComputedStyle ?? 0) >= 0.98);
  assert.ok((report.browserMatrix?.worstPixelDiff ?? 1) <= 0.02);
  assert.equal(report.scenarios?.every((scenario) => scenario.passed), true);
  assert.equal(report.coverage?.totalInteractions, 42);
  assert.equal(report.coverage?.scenarioRequiredInteractions, 12);
  assert.equal(report.coverage?.lifecycleInteractions, 4);
  assert.equal(report.coverage?.navigationInteractions, 20);
  assert.equal(report.coverage?.noOpInteractions, 6);
  assert.equal(report.coverage?.nonScenarioInteractions, 30);
  assert.equal(report.coverage?.eligibleInteractions, 12);
  assert.equal(report.coverage?.waivedInteractions, 0);
  assert.equal(report.coverage?.verifiedRate, 1);

  const criticalIds = new Set((report.scenarioVisualMatrices ?? []).map((matrix) => matrix.scenarioId));
  for (const required of ["toggle-theme", "copy-install-command", "open-first-faq", "run-and-reset-demo"]) {
    assert.equal(criticalIds.has(required), true, `missing critical visual matrix: ${required}`);
  }
  assert.equal(report.scenarioVisualMatrices?.every((matrix) => matrix.passed), true);
  assert.equal(report.telemetry.workload.formalScenarios, 6);
  assert.equal(report.telemetry.workload.criticalScenarios, 4);
  assert.equal(report.telemetry.workload.viewports, 4);
  assert.equal(report.telemetry.workload.scenarioViewportRuns, 16);
  assert.ok(report.telemetry.timing.scenarioVisualMatrixMs > 0);
  if (browserMode !== "legacy") assert.equal(report.telemetry.browser?.mode, browserMode);
});


test("Warp Gold+ regression preserves large snapshot fidelity and reviewed search interaction", { skip: !runGoldRegression, timeout: 900_000 }, async () => {
  const caseDir = `${root}examples/dispatch-experiments/warp-homepage`;
  const browserMode = (process.env.UI_DISMANTLER_BROWSER_MODE ?? "legacy") as "legacy" | "shared-browser";
  const browserConcurrency = Number(process.env.UI_DISMANTLER_BROWSER_CONCURRENCY ?? "1");
  const browserResourceCache = (process.env.UI_DISMANTLER_BROWSER_RESOURCE_CACHE ?? "off") as "off" | "run-local";
  const browserStability = (process.env.UI_DISMANTLER_BROWSER_STABILITY ?? "fixed") as "fixed" | "adaptive";
  const report = await runQualityGate({
    htmlPath: `${caseDir}/source/index.html`,
    libDir: `${caseDir}/lib`,
    manifestPath: `${caseDir}/manifest.json`,
    scenarioPath: `${caseDir}/scenarios.json`,
    visualArtifactsDir: `${caseDir}/artifacts-regression`,
    browserMode,
    browserConcurrency,
    browserResourceCache,
    browserStability,
    thresholds: { interactionCoverage: 1 },
  });

  assert.equal(report.passed, true, JSON.stringify({ failedGates: report.gates.filter((gate) => !gate.passed) }, null, 2));
  assert.equal(report.validation.passed, 10);
  assert.equal(report.validation.failed, 0);
  assert.equal(report.roundtrip.score?.structure.nodeMatchRate, 1);
  assert.equal(report.roundtrip.score?.text.textMatchRate, 1);
  assert.equal(report.browserMatrix?.viewports.length, 4);
  assert.equal(report.browserMatrix?.runtimeErrors, 0);
  assert.equal(report.browserMatrix?.navigationFailures, 0);
  assert.equal(report.browserMatrix?.fontAlignmentFailures, 0);
  assert.ok((report.browserMatrix?.worstSelectorCoverage ?? 0) >= 1);
  assert.ok((report.browserMatrix?.worstComputedStyle ?? 0) >= 0.98);
  assert.ok((report.browserMatrix?.worstPixelDiff ?? 1) <= 0.02);
  assert.equal(report.coverage?.totalInteractions, 138);
  assert.equal(report.coverage?.scenarioRequiredInteractions, 1);
  assert.equal(report.coverage?.navigationInteractions, 69);
  assert.equal(report.coverage?.noOpInteractions, 68);
  assert.equal(report.coverage?.waivedInteractions, 0);
  assert.equal(report.coverage?.verifiedRate, 1);
  assert.deepEqual(report.scenarioVisualMatrices?.map((matrix) => matrix.scenarioId), ["edit-session-search"]);
  assert.equal(report.scenarioVisualMatrices?.every((matrix) => matrix.passed), true);
  assert.equal(report.telemetry.workload.formalScenarios, 1);
  assert.equal(report.telemetry.workload.criticalScenarios, 1);
  assert.equal(report.telemetry.workload.viewports, 4);
  assert.equal(report.telemetry.workload.scenarioViewportRuns, 1);
});
