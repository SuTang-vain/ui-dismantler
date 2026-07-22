import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { analyzeHtml } from "../analysis/analyzer.js";
import { generateScenarios, loadScenarios } from "../evaluation/scenarios.js";
import { evaluateRoundtrip } from "../evaluation/roundtrip.js";
import { validateLibrary } from "../validation/library.js";
import { DISMANTLING_WORKFLOW, runQualityGate } from "../workflow/pipeline.js";

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

test("quality gate combines validation, render, structure and text gates", async () => {
  const report = await runQualityGate({ htmlPath: fixture, libDir: library, visual: false });
  assert.equal(report.passed, true);
  assert.deepEqual(report.gates.map((gate) => gate.id), ["validation", "render", "overall", "structure", "text"]);
  assert.equal(DISMANTLING_WORKFLOW.length, 6);
});
