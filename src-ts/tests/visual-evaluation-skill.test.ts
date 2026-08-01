import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { primitiveDomCompilationToBuildPlan, runComponentLibraryBuild } from "../production/component-library/index.js";
import type { PrimitiveDomCompilationGraph } from "../skills/primitive-dom.js";
import {
  createVisualEvaluationSkill,
  projectVisualEvaluationDelta,
  type VisualQualityEvaluator,
} from "../skills/visual-evaluation.js";
import type { QualityGateReport } from "../workflow/pipeline.js";

const repositoryRoot = new URL("../../", import.meta.url).pathname;

function reportMarker(passed: boolean): QualityGateReport {
  return {
    manifest: { meta: { source: "/tmp/reference.html" } },
    validation: { target: "/tmp/library" },
    scores: { dom: 1, visual: passed ? 1 : 0.9, overall: passed ? 1 : 0.95 },
    passed,
    gates: [{ id: "pixel-diff", passed, detail: passed ? "worstPixelDiff=0" : "worstPixelDiff=0.1" }],
    telemetry: { workload: { scenarioViewportRuns: 0 } },
  } as unknown as QualityGateReport;
}

test("visual-evaluation wrapper preserves QualityGateReport identity and fixes visual mode", async () => {
  const marker = reportMarker(true);
  const calls: Parameters<VisualQualityEvaluator>[0][] = [];
  const skill = createVisualEvaluationSkill(async (options) => { calls.push(options); return marker; });
  const output = await skill.execute({
    htmlPath: "/tmp/reference.html",
    libraryRoot: "/tmp/library",
    viewports: [{ id: "mobile", label: "Mobile", width: 390, height: 844 }],
    browserMode: "shared-browser",
    browserConcurrency: 2,
    browserResourceCache: "run-local",
    browserStability: "adaptive",
  });
  assert.strictEqual(output, marker);
  assert.equal(calls[0]?.visual, true);
  assert.equal(calls[0]?.libDir, "/tmp/library");
  assert.deepEqual(calls[0]?.viewports?.map((viewport) => viewport.id), ["mobile"]);
  assert.equal("thresholds" in (calls[0] ?? {}), false);
  assert.deepEqual(skill.manifest.sideEffects, ["filesystem", "browser", "network"]);
});

test("visual-evaluation projection records failed gates as review blockers", () => {
  const failed = reportMarker(false);
  const delta = projectVisualEvaluationDelta(failed);
  assert.equal(delta.nodes[0]?.kind, "visual-quality-evaluation");
  assert.equal(delta.nodes[0]?.attributes.failedGates instanceof Array, true);
  assert.equal(delta.unresolved[0]?.reason.includes("pixel-diff"), true);
  assert.equal(delta.reviewRequired, true);
  assert.equal(projectVisualEvaluationDelta(reportMarker(true)).reviewRequired, false);
});

test("visual-evaluation Skill runs the reviewed browser matrix through the generic CLI", async (context) => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-visual-skill-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const graph: PrimitiveDomCompilationGraph = {
    schemaVersion: "1.0", kind: "primitive-dom-compilation-graph",
    components: [{ componentId: "component:visual", componentName: "VisualCard", componentFile: "VisualCard.vue", reviewRequired: false, compilation: {
      schemaVersion: "1.0", kind: "primitive-dom-compilation", roots: ["node:visual"],
      nodes: [{ id: "node:visual", sourceNodeId: "source:visual", order: 0, sourceTag: "article", componentName: "VisualCard", renderTag: "article", renderStrategy: "native", classes: ["sg-visual-card"], attributes: { role: "article" }, inlineStyle: {}, content: [{ kind: "text", value: "Reviewed visual Skill" }], conditions: [], loops: [] }],
      styleRules: [{ sourceNodeId: "source:visual", selector: ".sg-visual-card", declarations: { padding: "16px", border: "1px solid var(--sg-line)", "border-radius": "6px" }, provenance: "source-inline-style" }], interactions: [],
      metrics: { sourceNodes: 1, compiledNodes: 1, primitiveNodes: 0, inlineStyleRules: 1, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 }, reviewReasons: [],
    } }],
    metrics: { components: 1, sourceNodes: 1, compiledNodes: 1, primitiveNodes: 0, inlineStyleRules: 1, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 }, reviewReasons: [], reviewRequired: false,
  };
  const plan = await primitiveDomCompilationToBuildPlan(graph, { sourceRoot: directory, libraryName: "Visual Skill Components", packageName: "visual-skill-components" });
  const libraryRoot = join(directory, "library");
  const build = await runComponentLibraryBuild(plan, libraryRoot);
  assert.equal(build.status, "review-required");
  const css = plan.files.find((file) => file.role === "style")!.content;
  const htmlPath = join(directory, "original.html");
  await writeFile(htmlPath, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="mount"><section class="sg-component-library" data-component-id="component:visual"><article data-primitive-node="node:visual" class="sg-visual-card" role="article">Reviewed visual Skill</article></section></div></body></html>`, "utf8");
  const inputPath = join(directory, "input.json");
  const outputPath = join(directory, "output.json");
  const evidencePath = join(directory, "evidence.json");
  const viewports = [
    { id: "desktop", label: "Desktop", width: 1024, height: 768 },
    { id: "mobile", label: "Mobile", width: 390, height: 700 },
  ];
  await writeFile(inputPath, `${JSON.stringify({ htmlPath, libraryRoot, visualArtifactsDir: join(directory, "artifacts"), viewports, browserMode: "shared-browser", browserConcurrency: 2, browserResourceCache: "run-local", browserStability: "adaptive", browserShutdown: "graceful" }, null, 2)}\n`, "utf8");
  execFileSync(process.execPath, ["dist-ts/cli.js", "skill-run", "visual-evaluation", "--input", inputPath, "--out", outputPath, "--evidence-out", evidencePath], { cwd: repositoryRoot, encoding: "utf8", timeout: 60_000 });
  const output = JSON.parse(await readFile(outputPath, "utf8")) as QualityGateReport;
  const evidence = JSON.parse(await readFile(evidencePath, "utf8")) as { status: string; skillId: string; sideEffects: string[] };
  assert.equal(output.passed, true, JSON.stringify(output.gates.filter((gate) => !gate.passed)));
  assert.deepEqual(output.browserMatrix?.viewports.map((viewport) => viewport.id), viewports.map((viewport) => viewport.id));
  assert.equal(output.browserMatrix?.viewports.every((viewport) => viewport.passed), true);
  assert.equal(output.browserMatrix?.worstComputedStyle, 1);
  assert.equal(output.browserMatrix?.worstPixelDiff, 0);
  assert.equal(output.telemetry.browser?.mode, "shared-browser");
  assert.equal(["graceful", "graceful-fallback"].includes(output.telemetry.browser?.browserShutdown ?? ""), true);
  assert.equal(output.telemetry.browser?.activeHandlesAfterClose.totalBlockingHandles, 0);
  assert.equal(evidence.status, "succeeded");
  assert.equal(evidence.skillId, "visual-evaluation");
  assert.deepEqual(evidence.sideEffects, ["filesystem", "browser", "network"]);
});
