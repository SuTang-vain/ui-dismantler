import assert from "node:assert/strict";
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

const runGoldRegression = process.env.UI_DISMANTLER_GOLD_REGRESSION === "1";

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
