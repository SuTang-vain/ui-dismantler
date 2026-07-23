import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeHtml } from "../analysis/analyzer.js";
import { planComponents } from "../planning/components.js";
import { runQualityGate } from "../workflow/pipeline.js";

const root = new URL("../../", import.meta.url).pathname;

const planningCases = [
  { id: "blackpink-star-group-ts", html: "original.html", profile: "blackpink" },
  { id: "ciyu-scrollbar-ts", html: "original.html", profile: "interactive-encyclopedia" },
  { id: "diegovz-home-0722-ts", html: "planning-fixture.html", profile: "portfolio" },
  { id: "liu-haocun-0722-ts", html: "original.html", profile: "liu-haocun-0722" },
  { id: "qingyu-nian-graph-ts", html: "original.html", profile: "historical-drama" },
  { id: "qinshihuang-0716-ts", html: "original.html", profile: "graph" },
  { id: "sandadui-graph-ts", html: "original.html", profile: "generic" },
  { id: "sun-wukong-0722-ts", html: "original.html", profile: "sun-wukong" },
] as const;

test("formal planning regression keeps all representative cases dispatch-ready", () => {
  for (const item of planningCases) {
    const htmlPath = `${root}examples/cases/${item.id}/${item.html}`;
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
  const report = await runQualityGate({
    htmlPath: `${caseDir}/original.html`,
    libDir: `${caseDir}/lib`,
    manifestPath: `${caseDir}/manifest.json`,
    scenarioPath: `${caseDir}/scenarios.json`,
    visualArtifactsDir: `${caseDir}/artifacts-regression`,
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
});
