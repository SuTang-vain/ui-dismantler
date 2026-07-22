import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyzeHtml } from "../analysis/analyzer.js";
import { computeCoverage, generateScenarios, loadScenarios } from "../evaluation/scenarios.js";
import { evaluateRoundtrip } from "../evaluation/roundtrip.js";
import { validateLibrary } from "../validation/library.js";
import { DISMANTLING_WORKFLOW, runQualityGate } from "../workflow/pipeline.js";
import type { Interaction } from "../types.js";

const root = new URL("../../", import.meta.url).pathname;
const fixture = `${root}benchmark/original.html`;
const library = `${root}benchmark/lib`;

test("TypeScript analyzer emits the compatible manifest contract", () => {
  const manifest = analyzeHtml(fixture, { profile: "benchmark" });
  assert.equal(manifest.schemaVersion, "1.0");
  assert.equal(manifest.meta.profile, "benchmark");
  assert.ok(manifest.theme.tokens.length > 0);
  assert.ok(manifest.structure.views.some((view) => view.type === "graph"));
  assert.ok(manifest.interactions.length > 0);
  assert.ok(Array.isArray(manifest.data.contracts));
});

test("TypeScript validator preserves the 9 quality checks", () => {
  const report = validateLibrary(library);
  assert.equal(report.total, 9);
  assert.equal(report.failed, 0);
  assert.equal(report.ok, true);
});

test("candidate scenarios remain review-gated", () => {
  const manifest = analyzeHtml(fixture);
  const document = generateScenarios(manifest);
  assert.equal(document.schemaVersion, "1.0");
  assert.ok(document.scenarios.length > 0);
  assert.equal(document.scenarios.every((scenario) => scenario.candidate === true), true);
  assert.doesNotThrow(() => loadScenarios(document));
});

test("roundtrip score is compatible with the existing benchmark score", async () => {
  const result = await evaluateRoundtrip(fixture, library);
  assert.ok(result.score);
  assert.equal(result.score?.scores.overall, 0.99);
  assert.ok((result.score?.text.textMatchRate ?? 0) >= 0.8);
  assert.ok((result.score?.structure.nodeMatchRate ?? 0) >= 0.7);
});

test("quality gate combines validation, render, structure and text gates when coverage is explicitly disabled", async () => {
  const report = await runQualityGate({ htmlPath: fixture, libDir: library, visual: false, thresholds: { interactionCoverage: null } });
  assert.equal(report.passed, true);
  assert.deepEqual(report.gates.map((gate) => gate.id), ["validation", "render", "overall", "structure", "text"]);
  assert.equal(DISMANTLING_WORKFLOW.length, 6);
});

test("strict quality gate rejects interactions without reviewed scenarios", async () => {
  const report = await runQualityGate({ htmlPath: fixture, libDir: library, visual: false });
  assert.equal(report.passed, false);
  assert.equal(report.gates.find((gate) => gate.id === "scenario-protocol")?.passed, false);
  assert.match(report.gates.find((gate) => gate.id === "scenario-protocol")?.detail ?? "", /未提供 scenarios/);
  assert.equal(report.gates.find((gate) => gate.id === "coverage")?.passed, false);
});

test("candidate-only scenario documents cannot produce a 0/0 pass", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-scenarios-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const scenarioPath = join(dir, "scenarios.json");
  await writeFile(scenarioPath, `${JSON.stringify(generateScenarios(analyzeHtml(fixture)), null, 2)}\n`, "utf8");
  const report = await runQualityGate({ htmlPath: fixture, libDir: library, visual: false, scenarioPath });
  assert.equal(report.passed, false);
  assert.equal(report.gates.find((gate) => gate.id === "scenario-protocol")?.passed, false);
  assert.equal(report.gates.find((gate) => gate.id === "scenarios")?.detail, "0/0 正式场景通过");
  assert.equal(report.gates.find((gate) => gate.id === "scenarios")?.passed, false);
  assert.equal(report.gates.find((gate) => gate.id === "coverage")?.passed, false);
});

test("coverage waivers exclude explicitly unreachable interactions with reasons", () => {
  const interactions: Interaction[] = [
    { trigger: "#visible", event: "click", action: "semantic-control", source: "semantic-control", fingerprint: "click|#visible|semantic-control" },
    { trigger: "#hidden", event: "click", action: "semantic-control", source: "semantic-control", fingerprint: "click|#hidden|semantic-control" },
  ];
  const document = loadScenarios({
    schemaVersion: "1.0",
    coverageWaivers: [{ fingerprint: "click|#hidden|semantic-control", reason: "基线状态不可达" }],
    scenarios: [{ id: "visible", covers: ["click|#visible|semantic-control"], steps: [{ action: "click", target: "#visible" }], assertions: [{ target: "#visible", visible: true }] }],
  });
  const coverage = computeCoverage(interactions, document, new Set(["click|#visible|semantic-control"]));
  assert.equal(coverage.eligibleInteractions, 1);
  assert.equal(coverage.waivedInteractions, 1);
  assert.equal(coverage.verifiedRate, 1);
  assert.equal(coverage.waivers[0].reason, "基线状态不可达");
});
