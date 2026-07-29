import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyzeHtml } from "../analysis/analyzer.js";
import { planComponents } from "../planning/components.js";
import { evaluateSpaRouterContract, type SpaRouterContractConfig } from "../evaluation/spa-router.js";
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

test("Vue Element Admin frozen Semantic Gold+ regression preserves reviewed SPA fidelity", () => {
  const caseDir = `${root}examples/spa-router-regressions/vue-element-admin`;
  const config = JSON.parse(readFileSync(`${caseDir}/reference-generated-semantic.config.json`, "utf8"));
  const report = JSON.parse(readFileSync(`${caseDir}/reference-generated-semantic.network-isolated.results.json`, "utf8"));
  const repeat = JSON.parse(readFileSync(`${caseDir}/network-isolated-repeat-summary.json`, "utf8"));
  const frozen = JSON.parse(readFileSync(`${caseDir}/frozen-artifact.json`, "utf8"));
  const responsibility = JSON.parse(readFileSync(`${caseDir}/vue-router-responsibility.graph.json`, "utf8"));
  const sfcVisual = JSON.parse(readFileSync(`${caseDir}/sfc-visual-responsibility.graph.json`, "utf8"));
  const echarts = JSON.parse(readFileSync(`${caseDir}/echarts-responsibility.graph.json`, "utf8"));
  const strictReport = JSON.parse(readFileSync(`${caseDir}/reference-generated-strict-navigation-only.results.json`, "utf8"));
  const autoGeneration = JSON.parse(readFileSync(`${caseDir}/generated-target-auto/generation.metrics.json`, "utf8"));
  const autoExperiment = JSON.parse(readFileSync(`${caseDir}/generated-target-auto/experiment.metrics.json`, "utf8"));
  const autoVisualFinal = JSON.parse(readFileSync(`${caseDir}/generated-target-auto-v1/semantic-gold-reviewed-state-reuse-final.results.json`, "utf8"));
  const autoVisualRepeat = JSON.parse(readFileSync(`${caseDir}/generated-target-auto-v1/semantic-gold-reviewed-state-reuse-summary.json`, "utf8"));
  const autoParallelRepeat = JSON.parse(readFileSync(`${caseDir}/generated-target-auto-v1/semantic-gold-parallel-viewports-summary.json`, "utf8"));
  const autoSetupFinal = JSON.parse(readFileSync(`${caseDir}/generated-target-auto-v1/semantic-gold-setup-reuse-final.results.json`, "utf8"));
  const autoSetupRepeat = JSON.parse(readFileSync(`${caseDir}/generated-target-auto-v1/semantic-gold-setup-reuse-summary.json`, "utf8"));
  const autoOverlapProfile = JSON.parse(readFileSync(`${caseDir}/generated-target-auto-v1/semantic-gold-setup-owner-profile.results.json`, "utf8"));
  const autoOverlapFinal = JSON.parse(readFileSync(`${caseDir}/generated-target-auto-v1/semantic-gold-setup-overlap-fast-final.results.json`, "utf8"));
  const autoOverlapRepeat = JSON.parse(readFileSync(`${caseDir}/generated-target-auto-v1/semantic-gold-setup-overlap-fast-summary.json`, "utf8"));

  assert.equal(frozen.scope, "reviewed-behavior-and-visual-generated-target");
  assert.equal(frozen.reviewRequired, true);
  assert.equal(frozen.fullGeneratedApplication, false, "the reviewed route target must not be represented as a complete generated Vue application");
  assert.equal(frozen.modelCalls, 0, "frozen quality evidence must remain independent of model API availability");
  assert.equal(frozen.networkIsolated, true);
  assert.equal(frozen.sourceCommit, "6858a9ad67483025f6a9432a926beb9327037be3");
  for (const [relativePath, expectedHash] of Object.entries(frozen.files as Record<string, string>)) {
    const actualHash = createHash("sha256").update(readFileSync(`${caseDir}/${relativePath}`)).digest("hex");
    assert.equal(actualHash, expectedHash, `${relativePath}: frozen Vue Element Admin artifact changed without review`);
  }

  assert.equal(responsibility.metrics.filesScanned, 195);
  assert.equal(responsibility.metrics.routesDiscovered, 78);
  assert.equal(responsibility.metrics.dynamicRoutes, 2);
  assert.equal(responsibility.metrics.roleProtectedRoutes, 6);
  assert.equal(responsibility.metrics.evidenceCount, 152);
  assert.equal(responsibility.capabilities.hashMode, true);
  assert.equal(responsibility.capabilities.historyMode, false);

  assert.equal(sfcVisual.kind, "sfc-visual-responsibility-graph");
  assert.equal(sfcVisual.reviewRequired, true);
  assert.equal(sfcVisual.metrics.components, 131);
  assert.equal(sfcVisual.metrics.interactiveComponents, 71);
  assert.equal(sfcVisual.metrics.chartComponents, 7);
  assert.equal(sfcVisual.blockers.length, 0);
  assert.equal(sfcVisual.apiFixtures.metrics.matchedFixtures, 1);
  assert.equal(sfcVisual.apiFixtures.metrics.transportPrefixesInferred, 3);
  assert.equal(sfcVisual.apiFixtures.metrics.runtimeSelectionsInferred, 3);
  assert.equal(sfcVisual.apiFixtures.metrics.proxyRoutesInferred, 0);
  assert.equal(sfcVisual.apiFixtures.metrics.proxyTargetsInferred, 0);
  assert.equal(sfcVisual.apiFixtures.metrics.proxyRewriteRulesInferred, 0);
  assert.deepEqual(sfcVisual.apiFixtures.responsibilities[0].apiCall.transportPathCandidates, [
    "/dev-api/vue-element-admin/transaction/list",
    "/prod-api/vue-element-admin/transaction/list",
    "/stage-api/vue-element-admin/transaction/list",
  ]);
  assert.equal(sfcVisual.apiFixtures.responsibilities.some((item: { componentName: string; consumption: { sliceLimit?: number }; renderedFields: Array<{ field: string }> }) => item.componentName === "TransactionTable" && item.consumption.sliceLimit === 8 && item.renderedFields.map((field) => field.field).join(",") === "order_no,price,status"), true);
  assert.equal(sfcVisual.components.some((component: { componentName: string; childComponents: string[] }) => component.componentName === "DashboardAdmin" && component.childComponents.includes("LineChart") && component.childComponents.includes("PanelGroup")), true);

  assert.equal(echarts.kind, "echarts-responsibility-graph");
  assert.equal(echarts.reviewRequired, true);
  assert.equal(echarts.metrics.chartFiles, 7);
  assert.deepEqual(echarts.chartTypes, ["bar", "line", "pie", "radar"]);
  assert.deepEqual(echarts.themes, ["macarons"]);
  assert.equal(echarts.blockers.length, 0);
  assert.equal(echarts.components.every((component: { capabilities: { initializesChart: boolean; disposesChart: boolean; resizesChart: boolean } }) => component.capabilities.initializesChart && component.capabilities.disposesChart && component.capabilities.resizesChart), true);

  assert.equal(config.navigationComparison, "semantic");
  assert.deepEqual(config.visualMatrix.viewports.map((viewport: { id: string }) => viewport.id), ["desktop", "tablet", "mobile"]);
  const automaticConfig = JSON.parse(readFileSync(`${caseDir}/reference-generated-semantic.auto-v1.config.json`, "utf8"));
  assert.equal(automaticConfig.execution.contractConcurrency, 3);
  assert.equal(automaticConfig.execution.visualConcurrency, 3);
  assert.equal(automaticConfig.execution.browserShutdown, "fast-kill");
  assert.equal(automaticConfig.scenarios.filter((scenario: { setupState?: unknown }) => scenario.setupState).every((scenario: { setupState: { checkpointAssertions: { hash: string; visibleSelector: string } } }) => scenario.setupState.checkpointAssertions.hash === "#/dashboard" && scenario.setupState.checkpointAssertions.visibleSelector === ".dashboard-container"), true);
  assert.equal(report.passed, true);
  assert.equal(report.scenariosPassed, 6);
  assert.equal(report.scenariosTotal, 6);
  assert.equal(report.navigationIntegrity.rate, 1);
  assert.equal(report.navigationIntegrity.failures, 0);
  assert.equal(report.visualMatrix.scenarioCount, 5);
  assert.equal(report.visualMatrix.viewportRuns, 13);
  assert.equal(report.visualMatrix.worstComputedStyle >= 0.98, true);
  assert.equal(report.visualMatrix.worstPixelDiff <= 0.02, true);
  assert.equal(report.visualMatrix.stabilityFailures, 0);
  assert.equal(report.runtimeErrors, 0);
  assert.equal(report.requiredNetworkFailures, 0);
  assert.equal(report.nonBlockingNetworkFailures, 0);
  assert.equal(report.telemetry.activeHandlesAfterClose.totalBlockingHandles, 0);

  assert.equal(repeat.networkIsolated, true);
  assert.equal(repeat.modelCalls, 0);
  assert.equal(repeat.suite.stable, true);
  assert.equal(repeat.suite.runs.length, 3);
  assert.equal(repeat.suite.runs.every((run: { passed: boolean; worstComputedStyle: number; worstPixelDiff: number; blockingHandlesAfterClose: number }) => run.passed && run.worstComputedStyle >= 0.98 && run.worstPixelDiff <= 0.02 && run.blockingHandlesAfterClose === 0), true);
  assert.deepEqual(repeat.beforeAfter.formalMatrixPassingStates, ["1/5", "5/5"]);

  assert.equal(autoGeneration.reviewRequired, true);
  assert.equal(autoGeneration.generatedCode, true);
  assert.equal(autoGeneration.modelCalls, 0);
  assert.equal(autoGeneration.manualEditedLines, 0);
  assert.equal(autoGeneration.repairIterations, 0);
  assert.equal(autoGeneration.diff.changedLines, 0);
  assert.equal(autoGeneration.diff.responsibility.missingRoutes.length, 0);
  assert.equal(autoGeneration.diff.responsibility.missingGuards.length, 0);
  assert.equal(autoGeneration.qualityComparison.comparable, false);
  assert.equal(autoExperiment.fullGeneratedApplication, false);
  assert.equal(autoExperiment.generatedVisualDom, false);
  assert.equal(autoExperiment.automaticCandidate.routeResponsibilities.matched, 6);
  assert.equal(autoExperiment.automaticCandidate.guardResponsibilities.matched, 1);
  assert.equal(autoExperiment.automaticCandidate.visualQualityAvailable, false);

  assert.equal(autoVisualFinal.passed, true);
  assert.equal(autoVisualFinal.visualMatrix.scenarioCount, 5);
  assert.equal(autoVisualFinal.visualMatrix.viewportRuns, 13);
  assert.equal(autoVisualFinal.visualMatrix.worstComputedStyle >= 0.98, true);
  assert.equal(autoVisualFinal.visualMatrix.worstPixelDiff <= 0.02, true);
  assert.equal(autoVisualFinal.telemetry.visualStateReusedRuns, 3);
  assert.equal(autoVisualFinal.telemetry.visualConcurrency, 3);
  assert.equal(autoVisualFinal.telemetry.visualPostAnchorSkippedRuns, 10);
  assert.equal(autoVisualFinal.telemetry.visualCanvas.canvasInvalidations < 5_000, true);
  assert.equal(autoVisualFinal.visualMatrix.scenarios.find((scenario: { scenarioId: string }) => scenario.scenarioId === "admin-deep-link-reload").viewports.every((viewport: { visualStateReused: boolean; referenceVisualStateReuseKey: string; generatedVisualStateReuseKey: string }) => viewport.visualStateReused && viewport.referenceVisualStateReuseKey === "authenticated-dashboard-default" && viewport.generatedVisualStateReuseKey === "authenticated-dashboard-default"), true);
  assert.equal(autoVisualRepeat.quality.runsPassed, 3);
  assert.equal(autoVisualRepeat.quality.runsTotal, 3);
  assert.equal(autoVisualRepeat.improvement.totalMsPercent > 20, true);
  assert.equal(autoVisualRepeat.improvement.adaptiveWaitMsPercent > 40, true);
  assert.equal(autoParallelRepeat.quality.runsPassed, 3);
  assert.equal(autoParallelRepeat.quality.runsTotal, 3);
  assert.equal(autoParallelRepeat.improvement.totalMsPercent > 35, true);
  assert.equal(autoParallelRepeat.improvement.visualMatrixMsPercent > 50, true);
  assert.equal(autoParallelRepeat.isolation.qualityThresholdsChanged, false);
  assert.equal(autoSetupFinal.passed, true);
  assert.equal(autoSetupFinal.visualMatrix.worstComputedStyle >= 0.98, true);
  assert.equal(autoSetupFinal.visualMatrix.worstPixelDiff <= 0.02, true);
  assert.equal(autoSetupFinal.telemetry.contractSetupStateReusedRuns, 8);
  assert.equal(autoSetupFinal.telemetry.contractSetupStepsSkipped, 24);
  assert.equal(autoSetupFinal.telemetry.visualSetupStateReusedRuns, 18);
  assert.equal(autoSetupFinal.telemetry.visualSetupStepsSkipped, 54);
  assert.equal(autoSetupFinal.telemetry.visualCanvas.echartsCompletionSignals > 0, true);
  assert.equal(autoSetupFinal.telemetry.visualCanvas.zrenderCompletionSignals, 0);
  assert.equal(autoSetupFinal.reference.results.filter((result: { setupCheckpointPublished?: boolean }) => result.setupCheckpointPublished).length, 1);
  assert.equal(autoSetupFinal.generated.results.filter((result: { setupCheckpointPublished?: boolean }) => result.setupCheckpointPublished).length, 1);
  assert.equal(autoSetupRepeat.control.totalMs.values.length, 3);
  assert.equal(autoSetupRepeat.setup.totalMs.values.length, 3);
  assert.equal(autoSetupRepeat.delta.totalMs.percent <= -5, true);
  assert.equal(autoSetupRepeat.delta.contractMs.percent <= -7, true);
  assert.equal(autoOverlapProfile.passed, true);
  assert.equal(autoOverlapProfile.telemetry.contractSetupOwnerTiming.ownerRuns, 2);
  assert.equal(autoOverlapProfile.telemetry.contractSetupOwnerTiming.visualCaptureMs / autoOverlapProfile.telemetry.contractSetupOwnerTiming.totalMs > 0.7, true);
  assert.equal(autoOverlapFinal.passed, true);
  assert.equal(autoOverlapFinal.visualMatrix.worstComputedStyle >= 0.98, true);
  assert.equal(autoOverlapFinal.visualMatrix.worstPixelDiff <= 0.02, true);
  assert.equal(autoOverlapFinal.telemetry.fastShutdownUsed, true);
  assert.equal(autoOverlapFinal.telemetry.fastShutdownConfirmed, true);
  assert.equal(autoOverlapFinal.telemetry.activeHandlesAfterClose.totalBlockingHandles, 0);
  assert.equal(autoOverlapRepeat.variants.control.passed, 3);
  assert.equal(autoOverlapRepeat.variants.optimized.passed, 3);
  assert.equal(autoOverlapRepeat.improvement.totalMs.percent <= -20, true);
  assert.equal(autoOverlapRepeat.improvement.contractMs.percent <= -45, true);
  assert.equal(autoOverlapRepeat.qualityThresholdsChanged, false);
  assert.equal(autoOverlapRepeat.browserContextIsolation, true);
  assert.equal(autoOverlapRepeat.settledFrameRequirementChanged, false);
  assert.equal(autoOverlapRepeat.networkQuietRequirementChanged, false);

  assert.equal(strictReport.passed, false, "Semantic Gold+ must not be relabeled as Vue Router Strict PASS");
});

test("Starmap frozen generated Gold+ preserves Vite SPA route visual auth and API responsibilities", () => {
  const caseDir = `${root}examples/spa-router-regressions/starmap`;
  const frozen = JSON.parse(readFileSync(`${caseDir}/frozen-artifact.json`, "utf8"));
  const semantic = JSON.parse(readFileSync(`${caseDir}/semantic-gold.final.results.json`, "utf8"));
  const strict = JSON.parse(readFileSync(`${caseDir}/strict-route-contract.final.results.json`, "utf8"));
  const router = JSON.parse(readFileSync(`${caseDir}/vue-router-responsibility.graph.json`, "utf8"));
  const routerSfc = JSON.parse(readFileSync(`${caseDir}/router-sfc-responsibility.graph.json`, "utf8"));
  const visual = JSON.parse(readFileSync(`${caseDir}/sfc-visual-responsibility.graph.json`, "utf8"));
  const targetPlan = JSON.parse(readFileSync(`${caseDir}/visual-target.plan.json`, "utf8"));
  const auth = JSON.parse(readFileSync(`${caseDir}/spa-auth-responsibility.graph.json`, "utf8"));
  const proxy = JSON.parse(readFileSync(`${caseDir}/transport-proxy-responsibility.graph.json`, "utf8"));

  assert.equal(frozen.scope, "reviewed-generated-vite-spa-route-visual-target");
  assert.equal(frozen.modelCalls, 0);
  assert.equal(frozen.networkIsolated, true);
  assert.equal(frozen.fullGeneratedApplication, false);
  for (const [relativePath, expectedHash] of Object.entries(frozen.files as Record<string, string>)) {
    const actualHash = createHash("sha256").update(readFileSync(`${caseDir}/${relativePath}`)).digest("hex");
    assert.equal(actualHash, expectedHash, `${relativePath}: frozen Starmap artifact changed without review`);
  }

  assert.equal(router.framework.router, "vue-router");
  assert.equal(router.framework.routerMajor, 4);
  assert.equal(router.metrics.routesDiscovered, 5);
  assert.equal(router.metrics.dynamicRoutes, 3);
  assert.equal(router.capabilities.historyMode, true);
  assert.equal(router.capabilities.hashMode, false);
  assert.equal(routerSfc.kind, "router-to-sfc-responsibility-graph");
  assert.equal(routerSfc.framework.routerMajor, 4);
  assert.equal(routerSfc.metrics.routeBindings, 5);
  assert.equal(routerSfc.metrics.resolvedRoutes, 5);
  assert.equal(routerSfc.metrics.unresolvedRoutes, 0);
  assert.equal(routerSfc.routes.every((route: { confidence: string; sfcFile: string | null }) => route.confidence === "high" && route.sfcFile), true);
  assert.equal(targetPlan.source.routerSfcGraphKind, "router-to-sfc-responsibility-graph");
  assert.equal(targetPlan.source.routerSfcResolvedRoutes, 5);
  assert.equal(proxy.metrics.astRoutes, 2);
  assert.equal(proxy.metrics.fallbackRoutes, 0);
  assert.equal(visual.apiFixtures.metrics.matchedFixtures, 1);
  assert.equal(visual.apiFixtures.metrics.materializedBindings, 1);
  assert.deepEqual(visual.apiFixtures.responsibilities.map((item: { componentName: string; apiCall: { localName: string }; consumption: { targetBinding: string; responsePath: string } }) => [item.componentName, item.apiCall.localName, item.consumption.targetBinding, item.consumption.responsePath]), [
    ["ModelProfiles", "listProfiles", "profiles", "data"],
  ]);
  assert.equal(targetPlan.metrics.boundaries, 2);
  assert.equal(targetPlan.metrics.unresolvedRoutes, 0);
  assert.deepEqual(targetPlan.boundaries.map((boundary: { route: string }) => boundary.route), ["/", "/profiles"]);
  assert.equal(auth.metrics.completeQueryStorageAuthorizationChains, 1);
  assert.deepEqual(auth.contracts.queryToStorage[0], { queryKey: "token", storage: "sessionStorage", storageKey: "api_token", files: ["src/api/request.js"] });
  assert.deepEqual(auth.contracts.storageToAuthorization[0], { storage: "sessionStorage", storageKey: "api_token", header: "Authorization", files: ["src/api/request.js"] });
  assert.equal(auth.contracts.unauthorizedRedirect[0].status, 401);
  assert.equal(auth.contracts.freshAuthenticationRequired, true);
  assert.equal(auth.contracts.crossRunPersistenceAllowed, false);

  assert.equal(semantic.passed, true);
  assert.equal(semantic.scenariosPassed, 6);
  assert.equal(semantic.scenariosTotal, 6);
  assert.equal(semantic.navigationIntegrity.rate, 1);
  assert.equal(semantic.visualMatrix.scenarioCount, 3);
  assert.equal(semantic.visualMatrix.viewportRuns, 9);
  assert.equal(semantic.visualMatrix.worstComputedStyle, 1);
  assert.ok(semantic.visualMatrix.worstPixelDiff <= 0.02);
  assert.equal(semantic.visualMatrix.stabilityFailures, 0);
  assert.equal(semantic.runtimeErrors, 0);
  assert.equal(semantic.requiredNetworkFailures, 0);
  assert.equal(semantic.telemetry.activeHandlesAfterClose.totalBlockingHandles, 0);

  assert.equal(strict.passed, true);
  assert.equal(strict.scenariosPassed, 6);
  assert.equal(strict.scenariosTotal, 6);
  assert.equal(strict.navigationIntegrity.rate, 1);
  assert.equal(strict.navigationIntegrity.failures, 0);
  assert.equal(strict.runtimeErrors, 0);
  assert.equal(strict.requiredNetworkFailures, 0);
  assert.equal(strict.telemetry.activeHandlesAfterClose.totalBlockingHandles, 0);
});

const runGoldRegression = process.env.UI_DISMANTLER_GOLD_REGRESSION === "1";
const vueElementAdminSource = process.env.UI_DISMANTLER_VUE_ELEMENT_ADMIN_SOURCE;
const starmapSource = process.env.UI_DISMANTLER_STARMAP_SOURCE;
const runVueElementAdminGold = runGoldRegression && Boolean(vueElementAdminSource);
const runStarmapGold = runGoldRegression && Boolean(starmapSource);

async function waitForHttp(url: string, timeoutMs = 90_000): Promise<void> {
  const started = Date.now();
  let lastError: unknown = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`);
}

async function stopDetachedProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const signal = (name: NodeJS.Signals): void => {
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, name);
      else child.kill(name);
    } catch {}
  };
  signal("SIGTERM");
  const exited = once(child, "exit");
  const graceful = await Promise.race([exited.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000))]);
  if (!graceful) { signal("SIGKILL"); await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 2_000))]); }
}



test("Vue XS Admin blind route API ownership preserves reviewed nested route evidence", () => {
  const caseDir = `${root}examples/spa-router-regressions/vue-xs-admin-blind`;
  const identity = JSON.parse(readFileSync(`${caseDir}/source-identity.json`, "utf8"));
  const fixture = JSON.parse(readFileSync(`${caseDir}/reviewed-route-fixture.config.json`, "utf8"));
  const ownership = JSON.parse(readFileSync(`${caseDir}/api-route-ownership.graph.json`, "utf8"));
  const routePlan = JSON.parse(readFileSync(`${caseDir}/route-shell.plan.json`, "utf8"));
  const generation = JSON.parse(readFileSync(`${caseDir}/generated-route-shell/generation.metrics.json`, "utf8"));
  const semantic = JSON.parse(readFileSync(`${caseDir}/generated-semantic.results.json`, "utf8"));
  const runtime = JSON.parse(readFileSync(`${caseDir}/reference-runtime.identity.json`, "utf8"));
  const routerSfc = JSON.parse(readFileSync(`${caseDir}/router-sfc-responsibility.graph.json`, "utf8"));
  const visualGraph = JSON.parse(readFileSync(`${caseDir}/sfc-visual-responsibility.graph.json`, "utf8"));
  const visualPlan = JSON.parse(readFileSync(`${caseDir}/visual-target.plan.json`, "utf8"));
  const authGraph = JSON.parse(readFileSync(`${caseDir}/spa-auth-responsibility.graph.json`, "utf8"));
  const autoV2 = JSON.parse(readFileSync(`${caseDir}/generated-target-auto-v2-owned-tree/generation.metrics.json`, "utf8"));
  const strictLogin = JSON.parse(readFileSync(`${caseDir}/strict-login-owned-tree.results.json`, "utf8"));
  const visualBaseline = JSON.parse(readFileSync(`${caseDir}/login-visual-owned-tree.results.json`, "utf8"));
  const loginVisualFinal = JSON.parse(readFileSync(`${caseDir}/login-visual-element-plus.results.json`, "utf8"));
  const generatedApp = readFileSync(`${caseDir}/generated-target-auto-v2-owned-tree/public/app.js`, "utf8");

  assert.equal(identity.commit, "99027d176d3c23643bd4c25ba00ec77d2b72bb56");
  assert.equal(identity.routeMock.sha256, "cb8d02deedccd65ddfa9f149cddd45596d42880c8a90e8e56cd4c4c9d15fb931");
  assert.equal(identity.sourceModified, false);
  assert.equal(fixture.fixtures[0].review.reviewed, true);
  assert.equal(fixture.fixtures[0].review.sourceHash, identity.routeMock.sha256);
  assert.equal(fixture.fixtures[0].review.requestSelection.name, "admin");
  assert.equal(fixture.fixtures[0].body.data.length, 9);

  assert.equal(ownership.kind, "api-route-ownership-graph");
  assert.equal(ownership.metrics.dynamicRouteFlows, 1);
  assert.equal(ownership.metrics.routeLinks, 1);
  assert.equal(ownership.metrics.reviewedFixtures, 1);
  assert.equal(ownership.metrics.matchedRouteRecords, 33);
  assert.equal(ownership.metrics.unresolvedFlows, 0);
  assert.deepEqual(ownership.unresolved, []);
  assert.equal(ownership.links[0].shape.shape, "route-record-array");
  assert.equal(ownership.links[0].shape.cardinality, 9);
  assert.deepEqual(ownership.links[0].shape.fields, ["children", "name", "path"]);
  assert.equal(ownership.links[0].routeOwnership.requiresReview, false);
  assert.equal(ownership.links[0].routeOwnership.matches.some((match: { apiName: string; routePath: string; matchKind: string }) => match.apiName === "RtGitLink" && match.routePath === "/external-link/embedded-page" && match.matchKind === "name"), true);
  assert.equal(ownership.links[0].routeOwnership.matches.some((match: { routePath: string; leafOwners: string[] }) => match.routePath === "/nested/menu1/menu1-1" && match.leafOwners.includes("views/nested/menu1/menu1-1/index.vue")), true);

  assert.deepEqual(routePlan.routes.map((route: { route: string }) => route.route), ["/login", "/welcome", "/nested/menu1/menu1-1", "/echarts"]);
  assert.equal(routePlan.capabilities.reload, true);
  assert.equal(routePlan.capabilities.reviewedVisualStates, 0);
  assert.equal(generation.modelCalls, 0);
  assert.equal(generation.manualEdits, 0);
  assert.equal(generation.repairIterations, 0);
  assert.equal(generation.reviewRequired, true);

  assert.equal(semantic.passed, true);
  assert.equal(semantic.scenariosPassed, 4);
  assert.equal(semantic.scenariosTotal, 4);
  assert.equal(semantic.navigationIntegrity.rate, 1);
  assert.equal(semantic.runtimeErrors, 0);
  assert.equal(semantic.requiredNetworkFailures, 0);
  assert.equal(semantic.telemetry.activeHandlesAfterClose.totalBlockingHandles, 0);
  assert.equal(semantic.visualMatrix, undefined);

  assert.equal(runtime.runtime.node, "v22.23.0");
  assert.equal(runtime.runtime.pnpm, "9.0.0");
  assert.equal(runtime.dependencyIdentity.pnpmLockSha256, "408ed95bfb777ce5c985953eb459f1df0226e795b602cc1e4dbc749b6d25b235");
  assert.equal(runtime.dependencyIdentity.frozenLockfile, true);
  assert.equal(runtime.qualityNetworkPolicy, "offline-after-install");
  assert.equal(runtime.sourceStatusCleanAfterInstall, true);
  assert.equal(routerSfc.metrics.resolvedRoutes, 50);
  assert.equal(routerSfc.metrics.unresolvedRoutes, 0);
  const login = visualGraph.components.find((component: { file: string }) => component.file === "src/views/login/index.vue");
  const loginForm = visualGraph.components.find((component: { file: string }) => component.file === "src/views/login/compoontne/form.vue");
  assert.equal(login.childComponents.includes("Form"), true);
  assert.equal(loginForm.stateResponsibility.parsed, true);
  assert.equal(loginForm.stateResponsibility.parseMode, "typescript-erasure");
  assert.equal(loginForm.stateResponsibility.metrics.initialBindings, 3);
  assert.equal(loginForm.templateStructure.primitiveCounts.checkbox, 1);
  assert.equal(visualGraph.metrics.globalStyleSheets, 2);
  assert.equal(visualGraph.metrics.compiledGlobalStyleSheets, 1);
  assert.equal(visualGraph.globalStyles.find((style: { sourceFile: string }) => style.sourceFile === "src/styles/index.scss").compileStatus, "compiled");
  assert.deepEqual(visualPlan.boundaries.map((boundary: { route: string }) => boundary.route), ["/login", "/welcome", "/nested/menu1/menu1-1", "/echarts/bar"]);
  assert.equal(visualPlan.boundaries.find((boundary: { route: string }) => boundary.route === "/login").ownerIds.includes("visual:sfc:63"), true);
  assert.equal(authGraph.schemaVersion, "1.1");
  assert.equal(authGraph.metrics.storageAdapters, 1);
  assert.equal(authGraph.metrics.resolvedStorageAdapters, 1);
  assert.equal(authGraph.metrics.completeLoginFlows, 1);
  assert.equal(authGraph.metrics.completeRouteGuards, 1);
  assert.equal(authGraph.metrics.completeDynamicRouteInitializers, 1);
  assert.equal(authGraph.contracts.storageAdapters[0].storage, "localStorage");
  assert.equal(authGraph.contracts.storageAdapters[0].prefix, "XsAdmin");
  assert.equal(authGraph.contracts.storageAdapters[0].keys.find((item: { logicalKey: string }) => item.logicalKey === "userInfo").effectiveKey, "XsAdmin_userInfo");
  assert.equal(authGraph.contracts.loginFlows[0].endpoint.path, "/mock_api/login");
  assert.equal(authGraph.contracts.loginFlows[0].identityWrite.storageKey, "userInfo");
  assert.equal(authGraph.contracts.loginFlows[0].routeInitialization, "initRoute");
  assert.equal(authGraph.contracts.routeGuards[0].authenticatedStatePath, "userInfoStore.userInfo");
  assert.equal(authGraph.contracts.routeGuards[0].freshLoadRouteInitialization, "initRoute");
  assert.equal(authGraph.contracts.routeGuards[0].dynamicRouteMutation, "addRoute");
  assert.equal(authGraph.contracts.loginFlows[0].requiresReview, true);
  assert.equal(authGraph.contracts.routeGuards[0].requiresReview, true);
  assert.equal(autoV2.modelCalls, 0);
  assert.equal(autoV2.manualEditedLines, 0);
  assert.equal(autoV2.routeEntries, 50);
  assert.equal(autoV2.visualOwners, 15);
  assert.equal(autoV2.initialStateBindings, 3);
  assert.equal(autoV2.reviewedApiRouteLinks, 1);
  assert.equal(autoV2.apiRouteOwnedRecords, 33);
  assert.equal(autoV2.globalStyleSheetsMaterialized, 1);
  assert.equal(generatedApp.includes("el-form-item__content"), true);
  assert.equal(generatedApp.includes("el-input__wrapper"), true);
  assert.equal(generatedApp.includes("el-checkbox__inner"), true);
  assert.equal(strictLogin.passed, true);
  assert.equal(strictLogin.navigationIntegrity.rate, 1);
  assert.equal(strictLogin.runtimeErrors, 0);
  assert.equal(strictLogin.requiredNetworkFailures, 0);
  assert.equal(strictLogin.telemetry.activeHandlesAfterClose.totalBlockingHandles, 0);
  assert.equal(visualBaseline.passed, false, "first-pass visual baseline must not be relabeled as Gold+");
  assert.equal(visualBaseline.visualMatrix.viewportRuns, 3);
  assert.equal(visualBaseline.visualMatrix.worstComputedStyle < 0.98, true);
  assert.equal(visualBaseline.visualMatrix.worstPixelDiff > 0.02, true);
  assert.equal(visualBaseline.visualMatrix.stabilityFailures, 0);
  assert.equal(visualBaseline.runtimeErrors, 0);
  assert.equal(visualBaseline.requiredNetworkFailures, 0);
  assert.equal(visualBaseline.telemetry.activeHandlesAfterClose.totalBlockingHandles, 0);
  assert.equal(loginVisualFinal.passed, true);
  assert.equal(loginVisualFinal.visualMatrix.viewportRuns, 3);
  assert.equal(loginVisualFinal.visualMatrix.worstComputedStyle, 1);
  assert.equal(loginVisualFinal.visualMatrix.worstPixelDiff <= 0.02, true);
  assert.equal(loginVisualFinal.navigationIntegrity.rate, 1);
  assert.equal(loginVisualFinal.runtimeErrors, 0);
  assert.equal(loginVisualFinal.requiredNetworkFailures, 0);
  assert.equal(loginVisualFinal.visualMatrix.stabilityFailures, 0);
  assert.equal(loginVisualFinal.telemetry.activeHandlesAfterClose.totalBlockingHandles, 0);
});

test("Starmap generated-target-auto-v2 preserves independent Semantic and reviewed visual Gold+ evidence", () => {
  const caseDir = `${root}examples/spa-router-regressions/starmap`;
  const contract = JSON.parse(readFileSync(`${caseDir}/auto-v2-route-contract.final.results.json`, "utf8"));
  const manifest = JSON.parse(readFileSync(`${caseDir}/generated-target-auto-v2/artifact.manifest.json`, "utf8"));
  const generation = JSON.parse(readFileSync(`${caseDir}/generated-target-auto-v2/generation.metrics.json`, "utf8"));
  const visual = JSON.parse(readFileSync(`${caseDir}/auto-v2-visual-final-full.results.json`, "utf8"));
  const summary = JSON.parse(readFileSync(`${caseDir}/auto-v2-visual-baseline.summary.json`, "utf8"));
  assert.equal(contract.passed, true);
  assert.equal(contract.scenariosPassed, 6);
  assert.equal(contract.scenariosTotal, 6);
  assert.equal(contract.navigationIntegrity.rate, 1);
  assert.equal(contract.reference.passed, true);
  assert.equal(contract.generated.passed, true);
  assert.equal(contract.generated.runtimeErrors, 0);
  assert.equal(contract.generated.unmockedApiRequests, 0);
  assert.equal(contract.telemetry.activeHandlesAfterClose.totalBlockingHandles, 0);
  const generatedTransitions = contract.generated.results.flatMap((result: { transitions: Array<{ method: string }> }) => result.transitions.map((transition) => transition.method));
  assert.equal(generatedTransitions.includes("replaceState"), true);
  assert.equal(generatedTransitions.includes("pushState"), true);
  assert.equal(generatedTransitions.includes("popstate"), true);
  assert.equal(manifest.kind, "generated-target-auto-v2");
  assert.equal(manifest.fullGeneratedApplication, false);
  assert.equal(manifest.qualityComparison.routeComparable, true);
  assert.equal(manifest.qualityComparison.comparable, true);
  assert.equal(manifest.qualityComparison.generated.passed, true);
  assert.equal(manifest.qualityComparison.generated.computedStyle >= 0.98, true);
  assert.equal(manifest.qualityComparison.generated.pixelDiff <= 0.02, true);
  assert.equal(generation.modelCalls, 0);
  assert.equal(generation.manualEditedLines, 0);
  assert.equal(generation.executableInteractionBindings, 11);
  assert.equal(generation.runtimeConditionBindings, 9);
  assert.equal(generation.reviewedFixtureBindings, 1);
  assert.equal(generation.generatedLoopInstances, 2);
  assert.equal(generation.inferredFixtureSelections, 1);
  assert.equal(generation.globalStyleSheetsMaterialized, 1);
  assert.equal(visual.passed, true);
  assert.equal(visual.visualMatrix.scenarioCount, 3);
  assert.equal(visual.visualMatrix.viewportRuns, 9);
  assert.equal(visual.visualMatrix.worstComputedStyle >= 0.98, true);
  assert.equal(visual.visualMatrix.worstPixelDiff <= 0.02, true);
  assert.equal(visual.telemetry.activeHandlesAfterClose.totalBlockingHandles, 0);
  assert.equal(summary.afterResponsibilityRuntime.reviewedRegion.passed, true);
  assert.equal(summary.afterResponsibilityRuntime.fullViewport.passed, true);
});

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

test("Vue Element Admin live Semantic Gold+ regression preserves the frozen route-state matrix", { skip: !runVueElementAdminGold, timeout: 240_000 }, async () => {
  const caseDir = `${root}examples/spa-router-regressions/vue-element-admin`;
  const sourceDir = vueElementAdminSource as string;
  const lockedCommit = JSON.parse(readFileSync(`${caseDir}/source-lock.json`, "utf8")).commit as string;
  const actualCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceDir, encoding: "utf8" }).trim();
  assert.equal(actualCommit, lockedCommit, "Vue Element Admin live regression must use the locked source commit");

  const offset = process.pid % 1000;
  const referencePort = 19000 + offset * 2;
  const generatedPort = referencePort + 1;
  const referenceBaseUrl = `http://127.0.0.1:${referencePort}`;
  const generatedBaseUrl = `http://127.0.0.1:${generatedPort}`;
  const artifacts = mkdtempSync(join(tmpdir(), "ui-dismantler-vue-admin-gold-"));
  const reference = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(referencePort)], {
    cwd: sourceDir, detached: true, stdio: "ignore", env: { ...process.env, NODE_OPTIONS: "--openssl-legacy-provider" },
  });
  const generated = spawn(process.execPath, ["server.mjs"], {
    cwd: `${caseDir}/generated-target`, detached: true, stdio: "ignore", env: { ...process.env, PORT: String(generatedPort) },
  });
  reference.unref();
  generated.unref();

  try {
    await Promise.all([waitForHttp(`${referenceBaseUrl}/#/login`), waitForHttp(`${generatedBaseUrl}/#/login`)]);
    const config = JSON.parse(readFileSync(`${caseDir}/reference-generated-semantic.config.json`, "utf8")) as SpaRouterContractConfig;
    config.referenceBaseUrl = referenceBaseUrl;
    config.generatedBaseUrl = generatedBaseUrl;
    if (config.visualMatrix) config.visualMatrix.artifactDir = artifacts;
    const report = await evaluateSpaRouterContract(config);
    assert.equal(report.passed, true, JSON.stringify(report.qualityGates.filter((gate) => !gate.passed), null, 2));
    assert.equal(report.scenariosPassed, 6);
    assert.equal(report.scenariosTotal, 6);
    assert.equal(report.navigationIntegrity.rate, 1);
    assert.equal(report.visualMatrix?.scenarioCount, 5);
    assert.equal(report.visualMatrix?.viewportRuns, 13);
    assert.ok((report.visualMatrix?.worstComputedStyle ?? 0) >= 0.98);
    assert.ok((report.visualMatrix?.worstPixelDiff ?? 1) <= 0.02);
    assert.equal(report.visualMatrix?.stabilityFailures, 0);
    assert.equal(report.runtimeErrors, 0);
    assert.equal(report.requiredNetworkFailures, 0);
    assert.equal(report.nonBlockingNetworkFailures, 0);
    assert.equal(report.telemetry.activeHandlesAfterClose.totalBlockingHandles, 0);
  } finally {
    await Promise.all([stopDetachedProcess(reference), stopDetachedProcess(generated)]);
    rmSync(artifacts, { recursive: true, force: true });
  }
});

test("Starmap live Semantic and Strict Gold+ regression preserves the frozen generated target", { skip: !runStarmapGold, timeout: 240_000 }, async () => {
  const caseDir = `${root}examples/spa-router-regressions/starmap`;
  const sourceDir = starmapSource as string;
  const identity = JSON.parse(readFileSync(`${caseDir}/source-identity.json`, "utf8"));
  for (const [relativePath, expectedHash] of Object.entries(identity.files as Record<string, string>)) {
    const actualHash = createHash("sha256").update(readFileSync(`${sourceDir}/${relativePath}`)).digest("hex");
    assert.equal(actualHash, expectedHash, `${relativePath}: live Starmap source identity mismatch`);
  }

  const offset = process.pid % 1000;
  const referencePort = 22000 + offset * 2;
  const generatedPort = referencePort + 1;
  const referenceBaseUrl = `http://127.0.0.1:${referencePort}`;
  const generatedBaseUrl = `http://127.0.0.1:${generatedPort}`;
  const artifacts = mkdtempSync(join(tmpdir(), "ui-dismantler-starmap-gold-"));
  const reference = spawn(process.execPath, ["reference-server.mjs"], {
    cwd: caseDir, detached: true, stdio: "ignore", env: { ...process.env, PORT: String(referencePort), STARMAP_SOURCE_DIST: `${sourceDir}/dist` },
  });
  const generated = spawn(process.execPath, ["server.mjs"], {
    cwd: `${caseDir}/generated-target`, detached: true, stdio: "ignore", env: { ...process.env, PORT: String(generatedPort) },
  });
  reference.unref();
  generated.unref();

  try {
    await Promise.all([waitForHttp(`${referenceBaseUrl}/`), waitForHttp(`${generatedBaseUrl}/`)]);
    const semanticConfig = JSON.parse(readFileSync(`${caseDir}/semantic-gold.config.json`, "utf8")) as SpaRouterContractConfig;
    semanticConfig.referenceBaseUrl = referenceBaseUrl;
    semanticConfig.generatedBaseUrl = generatedBaseUrl;
    if (semanticConfig.visualMatrix) semanticConfig.visualMatrix.artifactDir = artifacts;
    const semantic = await evaluateSpaRouterContract(semanticConfig);
    assert.equal(semantic.passed, true, JSON.stringify(semantic.qualityGates.filter((gate) => !gate.passed), null, 2));
    assert.equal(semantic.scenariosPassed, 6);
    assert.equal(semantic.visualMatrix?.scenarioCount, 3);
    assert.equal(semantic.visualMatrix?.viewportRuns, 9);
    assert.ok((semantic.visualMatrix?.worstComputedStyle ?? 0) >= 0.98);
    assert.ok((semantic.visualMatrix?.worstPixelDiff ?? 1) <= 0.02);
    assert.equal(semantic.navigationIntegrity.rate, 1);
    assert.equal(semantic.runtimeErrors, 0);
    assert.equal(semantic.requiredNetworkFailures, 0);
    assert.equal(semantic.visualMatrix?.stabilityFailures, 0);
    assert.equal(semantic.telemetry.activeHandlesAfterClose.totalBlockingHandles, 0);

    const strictConfig = JSON.parse(readFileSync(`${caseDir}/strict-route-contract.config.json`, "utf8")) as SpaRouterContractConfig;
    strictConfig.referenceBaseUrl = referenceBaseUrl;
    strictConfig.generatedBaseUrl = generatedBaseUrl;
    const strict = await evaluateSpaRouterContract(strictConfig);
    assert.equal(strict.passed, true, JSON.stringify(strict.navigationIntegrity.failures, null, 2));
    assert.equal(strict.scenariosPassed, 6);
    assert.equal(strict.navigationIntegrity.rate, 1);
    assert.equal(strict.runtimeErrors, 0);
    assert.equal(strict.requiredNetworkFailures, 0);
    assert.equal(strict.telemetry.activeHandlesAfterClose.totalBlockingHandles, 0);
  } finally {
    await Promise.all([stopDetachedProcess(reference), stopDetachedProcess(generated)]);
    rmSync(artifacts, { recursive: true, force: true });
  }
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
