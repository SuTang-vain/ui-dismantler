import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyzeHtml } from "../analysis/analyzer.js";
import { computeCoverage, generateScenarios, loadScenarios } from "../evaluation/scenarios.js";
import { evaluateRoundtrip } from "../evaluation/roundtrip.js";
import { validateLibrary } from "../validation/library.js";
import { planComponents, validateComponentPlans } from "../planning/components.js";
import { DISMANTLING_WORKFLOW, runQualityGate } from "../workflow/pipeline.js";
import type { Interaction } from "../types.js";

const root = new URL("../../", import.meta.url).pathname;
const fixture = `${root}benchmark/original.html`;
const library = `${root}benchmark/lib`;
const execFileAsync = promisify(execFile);

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
  assert.equal(DISMANTLING_WORKFLOW.length, 7);
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


test("component planner turns manifest evidence into reviewable component specs", () => {
  const manifest = analyzeHtml(fixture, { profile: "benchmark" });
  const report = planComponents(manifest, { lineBudget: 1000 });
  assert.equal(report.schemaVersion, "1.0");
  assert.ok(report.components.length > 0);
  assert.equal(report.summary.ready, true);
  assert.ok(report.components.every((component) => component.sourceSelector.length > 0));
  assert.ok(report.components.every((component) => component.sourceSelectors.length > 0));
  assert.ok(report.components.every((component) => component.acceptance.viewports.length === 4));
  assert.ok(report.components.some((component) => component.interactionFingerprints.length > 0));
  assert.equal(report.summary.unownedInteractions, 0);
});

test("component planner blocks dispatch when the complexity budget is exceeded", () => {
  const report = planComponents(analyzeHtml(fixture), { lineBudget: 40 });
  assert.equal(report.summary.ready, false);
  assert.ok(report.issues.some((issue) => issue.code === "complexity-budget"));
});

test("component plan preflight catches missing state and viewport acceptance", () => {
  const report = planComponents(analyzeHtml(fixture), { lineBudget: 1000 });
  const broken = structuredClone(report.components[0]);
  broken.acceptance.states = [];
  broken.acceptance.viewports = [];
  const issues = validateComponentPlans([broken]);
  assert.ok(issues.some((issue) => issue.code === "missing-states"));
  assert.ok(issues.some((issue) => issue.code === "missing-viewports"));
});

test("component planner blocks dispatch when DOM interactions have no component owner", () => {
  const manifest = analyzeHtml(fixture);
  manifest.interactions.push({ trigger: "#outside-all-views", event: "click", action: "semantic-control", source: "semantic-control", fingerprint: "click|#outside-all-views|semantic-control" });
  const report = planComponents(manifest, { lineBudget: 1000 });
  assert.equal(report.summary.ready, false);
  assert.equal(report.summary.unownedInteractions, 1);
  assert.ok(report.issues.some((issue) => issue.code === "unowned-interactions"));
});


test("portfolio analyzer rejects isolated progress SVGs and emits heading-led sections", () => {
  const diegovz = `${root}examples/cases/diegovz-home-0722-ts/planning-fixture.html`;
  const manifest = analyzeHtml(diegovz, { profile: "portfolio" });
  assert.equal(manifest.structure.views.some((view) => view.type === "graph"), false);
  const sections = new Set(manifest.structure.views.filter((view) => view.type === "content-section").map((view) => view.semanticType));
  for (const expected of ["some-projects", "writing", "fragments-of-me", "education", "experience", "readings", "awards-features"]) assert.equal(sections.has(expected), true, `missing ${expected}`);
  const report = planComponents(manifest, { lineBudget: 1000 });
  assert.equal(report.components.some((item) => item.componentName.startsWith("SomeProjects")), true);
  assert.equal(report.components.every((item) => item.interactionFingerprints.length < manifest.interactions.length), true);
  const child = report.components.find((item) => item.parentId);
  assert.ok(child, "specialized widgets should retain their containing section dependency");
});

test("portfolio planner splits repeated items and localized interaction clusters", () => {
  const diegovz = `${root}examples/cases/diegovz-home-0722-ts/planning-fixture.html`;
  const report = planComponents(analyzeHtml(diegovz, { profile: "portfolio" }), { lineBudget: 150 });
  const awardItem = report.components.find((item) => item.id === "awards-features-item");
  const timelineItem = report.components.find((item) => item.id === "timeline-item");
  assert.equal(awardItem?.sourceSelectors.length, 10);
  assert.equal(timelineItem?.sourceSelectors.length, 6);
  assert.equal(awardItem?.parentId, "section-8-awards-features");
  assert.equal(timelineItem?.parentId, "timeline-2");
  assert.equal(timelineItem?.interactionFingerprints.length, 4);
  assert.equal(report.components.find((item) => item.id === "timeline-2")?.interactionFingerprints.length, 0);
  assert.ok(report.components.some((item) => item.id === "fragments-of-me-interactive-shell"));
  assert.ok(report.components.filter((item) => item.id.startsWith("fragments-of-me-bento-slot")).length >= 3);
  assert.equal(new Set(report.components.flatMap((item) => item.interactionFingerprints)).size, analyzeHtml(diegovz, { profile: "portfolio" }).interactions.length);
  assert.equal(report.summary.overBudget, 0);
  assert.equal(report.summary.ready, true);
});

test("analyzer budgets oversized styles and skips non-executable archive scripts", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-budget-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "archive.html");
  await writeFile(html, `<!doctype html><html><head><style>:root{--ink:#111}${".card{color:#111}".repeat(500)}</style><script type="application/ld+json">{"broken":</script></head><body><main><h1>Archive</h1><p>Full DOM stays available.</p></main></body></html>`);
  const manifest = analyzeHtml(html, { maxCssBytes: 400, maxStyleBytes: 400, maxScriptBytes: 100 });
  assert.match(manifest.warnings.join(" "), /CSS 分析预算生效/);
  assert.match(manifest.warnings.join(" "), /非可执行 script/);
  assert.equal(manifest.structure.views.some((view) => view.details.text === "Archive"), true);
});

test("self-contained transpiler ignores JSON-LD and supports pages without asset directories", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-ts-transpile-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "static.html");
  const out = join(dir, "lib");
  await writeFile(html, `<!doctype html><html><head><style>:root{--ink:#111}.card{color:var(--ink)}</style><script type="application/ld+json">{"@context":"https://schema.org"}</script></head><body><main class="card">Static</main></body></html>`);
  const { stdout } = await execFileAsync(process.execPath, [`${root}scripts/transpile_self_contained_case.mjs`, html, out, "StaticFixture", "static"]);
  const summary = JSON.parse(stdout);
  assert.equal(summary.skippedScripts, 1);
  assert.equal(summary.executableScripts, 0);
  assert.equal(summary.assetsCopied, false);
  assert.equal(summary.scriptParseWarning, null);
  assert.match(await readFile(join(out, "src", "static.js"), "utf8"), /StaticFixture/);
});
