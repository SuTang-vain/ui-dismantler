import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  componentPlanningReportToBuildPlan,
  createComponentLibraryBuildPlan,
  enrichComponentLibraryBuildPlan,
  executeReviewedStateWrite,
  materializeComponentLibrary,
  primitiveDomCompilationToBuildPlan,
  runComponentLibraryBuild,
  visualTargetPlanToBuildPlan,
  runComponentLibraryRuntimeSmoke,
  validateComponentLibraryBuildPlan,
  type ComponentLibraryBuildPlanInput,
} from "../production/component-library/index.js";
import type { PrimitiveDomCompilationGraph } from "../skills/primitive-dom.js";
import type { ComponentPlanningReport } from "../planning/components.js";
import type { VisualTargetPlan } from "../planning/visual-target-plan.js";
import { analyzeSfcTemplateStructure } from "../planning/sfc-template-structure.js";

const root = new URL("../../", import.meta.url).pathname;
const benchmarkRoot = resolve(root, "benchmark/lib");

function benchmarkInput(): ComponentLibraryBuildPlanInput {
  const file = (path: string, role: ComponentLibraryBuildPlanInput["files"][number]["role"], publish: boolean) => ({
    path,
    role,
    sourcePath: resolve(benchmarkRoot, path),
    publish,
    reviewed: true,
    provenance: [{ kind: "reviewed-file" as const, reference: `benchmark/lib/${path}` }],
  });
  return {
    schemaVersion: "1.0",
    sourceRoot: benchmarkRoot,
    library: { name: "Glossary Explorer", packageName: "ui-dismantler-glossary-explorer" },
    files: [
      { ...file("package.json", "package-metadata", true), provenance: [{ kind: "generated-metadata", reference: "benchmark/lib/package.json" }] },
      file("src/glossary.js", "runtime", true),
      { ...file("src/glossary.css", "style", true), provenance: [{ kind: "source-style", reference: "benchmark/lib/src/glossary.css" }] },
      file("README.md", "documentation", true),
      file("docs/设计规范.md", "documentation", true),
      file("examples/template.html", "example", false),
      file("examples/case.html", "example", false),
    ],
    smoke: {
      runtimePath: "src/glossary.js",
      globalName: "GlossaryExplorer",
      mountMethod: "mount",
      hostSelector: "#mount",
      options: {},
      cleanupRequired: false,
    },
  };
}

test("Component Library Build Plan is deterministic and records file provenance", async () => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-build-plan-"));
  try {
    const configPath = join(directory, "config.json");
    await writeFile(configPath, "{}", "utf8");
    const first = await createComponentLibraryBuildPlan(benchmarkInput(), configPath);
    const second = await createComponentLibraryBuildPlan(benchmarkInput(), configPath);
    assert.deepEqual(first, second);
    assert.equal(validateComponentLibraryBuildPlan(first).ready, true);
    assert.equal(first.files.find((file) => file.path === "src/glossary.js")?.contentHash.length, 64);
    assert.equal(first.files.find((file) => file.path === "examples/case.html")?.publish, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Component Library Materializer runs Runtime Smoke before structural validation", async () => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-build-runtime-"));
  try {
    const configPath = join(directory, "config.json");
    await writeFile(configPath, "{}", "utf8");
    const plan = await createComponentLibraryBuildPlan(benchmarkInput(), configPath);
    const outputRoot = join(directory, "library");
    const materialized = await materializeComponentLibrary(plan, outputRoot);
    assert.equal(materialized.status, "succeeded");
    const smoke = await runComponentLibraryRuntimeSmoke(plan, outputRoot);
    assert.equal(smoke.passed, true);
    assert.equal(smoke.moduleLoaded, true);
    assert.equal(smoke.mountCalled, true);
    assert.ok(smoke.mountedNodeCount > 0);
    const report = await runComponentLibraryBuild(plan, join(directory, "pipeline"));
    assert.equal(report.status, "succeeded");
    assert.equal(report.smoke?.passed, true);
    assert.equal(report.validation?.ok, true);
    assert.equal(JSON.parse(await readFile(join(directory, "pipeline", ".ui-dismantler", "build-report.json"), "utf8")).kind, "component-library-build-report");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Component Library Build Plan blocks unsafe paths, publishable fixtures, and unresolved review state", async () => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-build-blocked-"));
  try {
    const configPath = join(directory, "config.json");
    await writeFile(configPath, "{}", "utf8");
    const input = benchmarkInput();
    await assert.rejects(() => createComponentLibraryBuildPlan({
      ...input,
      files: input.files.map((file, index) => index === 5 ? { ...file, path: "../fixture.js", publish: true, role: "fixture" as const } : file),
    }, configPath), /must be a safe relative path/);
    const blocked = await createComponentLibraryBuildPlan({
      ...input,
      unresolved: ["component owner requires review"],
    }, configPath);
    const validation = validateComponentLibraryBuildPlan(blocked);
    assert.equal(validation.valid, true);
    assert.equal(validation.ready, false);
    const report = await runComponentLibraryBuild(blocked, join(directory, "output"), { reportPath: join(directory, "blocked-report.json") });
    assert.equal(report.status, "blocked");
    assert.equal(report.materialization, undefined);
    assert.equal(JSON.parse(await readFile(join(directory, "blocked-report.json"), "utf8")).status, "blocked");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("component-build CLI materializes a reviewed plan without publishing examples", async (context) => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-build-cli-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = join(directory, "config.json");
  const planPath = join(directory, "plan.json");
  const outputRoot = join(directory, "library");
  const input = benchmarkInput();
  await writeFile(configPath, JSON.stringify(input), "utf8");
  execFileSync(process.execPath, ["dist-ts/cli.js", "component-build-plan", configPath, "--out", planPath], { cwd: root, encoding: "utf8" });
  execFileSync(process.execPath, ["dist-ts/cli.js", "component-build", planPath, "--out-dir", outputRoot], { cwd: root, encoding: "utf8" });
  const packageJson = JSON.parse(await readFile(join(outputRoot, "package.json"), "utf8")) as { files?: string[] };
  assert.equal(packageJson.files?.some((entry) => entry.startsWith("examples")), false);
  assert.equal(JSON.parse(await readFile(join(outputRoot, ".ui-dismantler", "build-report.json"), "utf8")).status, "succeeded");
});


test("Primitive DOM adapter projects reviewed static evidence into a runnable Build Plan", async (context) => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-primitive-build-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const graph: PrimitiveDomCompilationGraph = {
    schemaVersion: "1.0",
    kind: "primitive-dom-compilation-graph",
    components: [{
      componentId: "component:demo",
      componentName: "DemoCard",
      componentFile: "DemoCard.vue",
      reviewRequired: false,
      compilation: {
        schemaVersion: "1.0",
        kind: "primitive-dom-compilation",
        roots: ["node:root"],
        nodes: [{ id: "node:root", sourceNodeId: "source:root", order: 0, sourceTag: "div", componentName: "DemoCard", renderTag: "section", renderStrategy: "native", classes: ["sg-demo-card"], attributes: { role: "region" }, inlineStyle: {}, content: [{ kind: "text", value: "Reviewed component" }], conditions: [], loops: [] }],
        styleRules: [{ sourceNodeId: "source:root", selector: "[data-primitive-node=\\\"node:root\\\"]", declarations: { color: "var(--sg-ink)" }, provenance: "source-inline-style" }],
        interactions: [],
        metrics: { sourceNodes: 1, compiledNodes: 1, primitiveNodes: 1, inlineStyleRules: 1, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 },
        reviewReasons: [],
      },
    }],
    metrics: { components: 1, sourceNodes: 1, compiledNodes: 1, primitiveNodes: 1, inlineStyleRules: 1, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 },
    reviewReasons: [],
    reviewRequired: false,
  };
  const plan = await primitiveDomCompilationToBuildPlan(graph, { sourceRoot: directory, libraryName: "Reviewed Components", packageName: "reviewed-components" });
  assert.equal(plan.reviewRequired, false);
  assert.equal(validateComponentLibraryBuildPlan(plan).ready, true);
  const report = await runComponentLibraryBuild(plan, join(directory, "library"));
  assert.equal(report.status, "succeeded");
  assert.equal(report.smoke?.passed, true);
  assert.equal(report.validation?.ok, true);
});

test("Component Planning adapter preserves missing executable evidence as a review blocker", async () => {
  const report: ComponentPlanningReport = {
    schemaVersion: "1.0",
    generatedFrom: "/tmp/source.html",
    generatedAt: "2026-07-31T00:00:00.000Z",
    lineBudget: 150,
    components: [],
    issues: [],
    summary: { components: 0, overBudget: 0, errors: 0, warnings: 0, interactions: 0, ownedInteractions: 0, unownedInteractions: 0, ready: false },
  };
  const plan = await componentPlanningReportToBuildPlan(report, { sourceRoot: "/tmp/source.html", libraryName: "Review Required", packageName: "review-required" });
  const validation = validateComponentLibraryBuildPlan(plan);
  assert.equal(plan.reviewRequired, true);
  assert.equal(validation.valid, true);
  assert.equal(validation.ready, false);
  assert.equal(validation.blockers.some((issue) => issue.message.includes("executable DOM topology")), true);
  assert.equal(validation.blockers.some((issue) => issue.message.includes("missing required runtime")), true);
});


test("Visual Target Plan adapter consumes scoped source style evidence and remains review-gated", async () => {
  const templateStructure = analyzeSfcTemplateStructure(`<section class="panel"><h2>Reviewed visual owner</h2></section>`);
  const plan = {
    schemaVersion: "1.0",
    kind: "visual-target-plan",
    reviewRequired: true,
    generatedCode: false,
    source: { sfcGraphKind: "sfc-visual-responsibility-graph", routePlanKind: "spa-route-shell-plan", sourceRoot: "/tmp/source", graphComponents: 1, graphChartComponents: 0 },
    selectorPolicy: { implementationSelectorsIndependent: true, acceptanceSelectorsPreserved: true, implementationAttribute: "data-visual-owner" },
    boundaries: [{ id: "boundary:/reviewed", route: "/reviewed", scenarioIds: [], rootOwnerId: "owner:reviewed", acceptance: { visibleSelectors: [], visibleText: [], screenshotAnchors: [], screenshotRegions: [], styleTargets: [], viewports: ["desktop"] }, ownerIds: ["owner:reviewed"], resourceProfileProposal: { profile: "dom", confidence: 1, evidence: [], reviewRequired: true }, reviewRequired: true, reviewReasons: ["route state requires review"] }],
    owners: [{ id: "owner:reviewed", componentId: "owner:reviewed", componentName: "ReviewedPanel", sourceFile: "src/ReviewedPanel.vue", kind: "component", implementationSelector: "[data-visual-owner=owner:reviewed]", acceptanceSelectors: [], childComponents: [], templateStructure, dataCardinality: { collections: [], unresolved: [] }, stateResponsibility: { state: [], handlers: [], unresolved: [] }, apiFixtures: [], interactions: { events: [], models: [], conditions: [], loops: [] }, lifecycle: [], responsiveMediaQueries: [], sourceStyleSheets: [{ index: 0, scoped: true, compiledCss: ".panel{color:var(--sg-ink)}", compileStatus: "compiled" }], runtimeDependencies: [], confidence: "high", reviewReasons: [] }],
    unresolved: [],
    metrics: { visualRoutes: 1, boundaries: 1, owners: 1, chartOwners: 0, responsiveOwners: 0, interactiveOwners: 0, apiFixtureOwners: 0, canvasProfileProposals: 0, domProfileProposals: 1, unresolvedRoutes: 0 },
    measurementTemplate: { modelCalls: 0, generationMs: 0, reviewMs: null, generatedLines: null, manualEdits: null, manualEditedLines: null, repairIterations: null, semanticRuns: null, visualRuns: null },
    reviewReasons: ["visual target plan is review-only"],
  } as unknown as VisualTargetPlan;
  const buildPlan = await visualTargetPlanToBuildPlan(plan, { sourceRoot: "/tmp/source", libraryName: "Reviewed Visual", packageName: "reviewed-visual" });
  const validation = validateComponentLibraryBuildPlan(buildPlan);
  assert.equal(buildPlan.reviewRequired, true);
  assert.equal(validation.ready, false);
  assert.equal(buildPlan.files.find((file) => file.role === "style")?.content.includes("data-visual-owner"), true);
  assert.equal(validation.blockers.some((issue) => issue.message.includes("VisualTargetPlan is review-only")), true);
});


test("State and Data Surface evidence enrich a Build Plan without embedding values or bypassing review", async () => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-build-evidence-"));
  try {
    const configPath = join(directory, "config.json");
    await writeFile(configPath, "{}", "utf8");
    const basePlan = await createComponentLibraryBuildPlan(benchmarkInput(), configPath);
    const enriched = enrichComponentLibraryBuildPlan(basePlan, {
      state: {
        schemaVersion: "1.0",
        kind: "sfc-state-responsibility",
        parsed: true,
        parseMode: "javascript",
        initialState: { open: false },
        handlers: [{ handler: "openEditor", writes: [{ path: "open", expression: "open.value = true", sourceLine: 4, confidence: "high" }], helperCalls: [], sourceLine: 4 }],
        displayFunctions: [],
        unresolvedWrites: [],
        metrics: { initialBindings: 1, handlers: 1, handlersWithWrites: 1, stateWrites: 1, displayFunctions: 0, unresolvedWrites: 0 },
        reviewReasons: [],
      },
      dataSurface: {
        unresolved: [],
        reviewRequired: false,
        surfaces: [{
          id: "prop:demo:items",
          owner: { componentId: "component:demo", componentName: "Demo", componentFile: "Demo.vue" },
          source: { primary: "component-prop", prop: { binding: "items", evidence: ["template-prop"] } },
          shape: { kind: "collection", itemKind: "record", cardinality: null, evidence: ["prop-shape"] },
          fields: [{ path: "id", consumers: ["component:demo"], evidence: ["rendered-field"] }],
          consumers: [{ componentId: "component:demo", componentName: "Demo", componentFile: "Demo.vue", targetBinding: "items", renderedFields: ["id"] }],
          injection: { kind: "component-prop", target: "items", reviewed: true },
          references: [],
          evidence: [{ source: "template", detail: "items prop", confidence: "high" }],
          unresolved: [],
          reviewRequired: false,
        }],
      } as never,
    });
    const validation = validateComponentLibraryBuildPlan(enriched);
    assert.equal(enriched.interactions.length, 1);
    assert.equal(enriched.interactions[0]?.target, "open");
    assert.equal(enriched.interactions[0]?.materialized, false);
    assert.equal(enriched.interactions[0]?.executionEvidence?.status, "verified");
    assert.equal(enriched.interactions[0]?.executionEvidence?.transitionKind, "set-literal");
    assert.equal(enriched.dataBindings.length, 1);
    assert.equal(enriched.dataBindings[0]?.externalOnly, true);
    assert.equal(JSON.stringify(enriched).includes('"value"'), false);
    assert.equal(validation.ready, false);
    assert.equal(validation.blockers.some((issue) => issue.message.includes("metadata-only")), true);
    assert.equal(validation.blockers.some((issue) => issue.message.includes("not materialized")), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test("Reviewed interaction executor supports only auditable state transitions without eval", () => {
  const set = executeReviewedStateWrite({ path: "dialog.open", value: true, expression: "dialog.open = true", sourceLine: 1, confidence: "high" }, { dialog: { open: false } });
  assert.equal(set.status, "materialized");
  assert.equal((set.state.dialog as { open: boolean }).open, true);
  assert.equal(set.transition?.kind, "set-literal");
  const toggle = executeReviewedStateWrite({ path: "dialog.open", expression: "dialog.open = !dialog.open", sourceLine: 2, confidence: "high" }, { dialog: { open: true } });
  assert.equal(toggle.status, "materialized");
  assert.equal((toggle.state.dialog as { open: boolean }).open, false);
  const increment = executeReviewedStateWrite({ path: "index", expression: "index++", sourceLine: 3, confidence: "high" }, { index: 1 });
  assert.equal(increment.status, "materialized");
  assert.equal(increment.state.index, 2);
  const blocked = executeReviewedStateWrite({ path: "dialog.open", expression: "dialog.open = computeVisibility()", sourceLine: 4, confidence: "high" }, { dialog: { open: false } });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blockers.some((reason) => reason.includes("unsupported state expression")), true);
});
