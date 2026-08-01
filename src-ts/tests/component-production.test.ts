import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";
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
  type ComponentLibraryStateEvidenceMap,
} from "../production/component-library/index.js";
import type { PrimitiveDomCompilationGraph } from "../skills/primitive-dom.js";
import type { ComponentPlanningReport } from "../planning/components.js";
import type { VisualTargetPlan } from "../planning/visual-target-plan.js";
import { analyzeSfcTemplateStructure } from "../planning/sfc-template-structure.js";
import type { SfcStateResponsibility } from "../planning/sfc-state-responsibility.js";
import { analyzeHtml } from "../analysis/analyzer.js";
import { interactionFingerprint } from "../evaluation/scenarios.js";

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


test("State and Data Surface evidence does not invent runtime interactions without Primitive ownership", async () => {
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
    assert.equal(enriched.interactions.length, 0);
    assert.equal(enriched.dataBindings.length, 1);
    assert.equal(enriched.dataBindings[0]?.externalOnly, true);
    assert.equal(enriched.dataBindings.every((binding) => !("value" in binding)), true);
    assert.equal(validation.ready, false);
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


test("Reviewed primitive interaction bindings materialize into runtime state transitions", async (context) => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-interaction-runtime-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const graph: PrimitiveDomCompilationGraph = {
    schemaVersion: "1.0",
    kind: "primitive-dom-compilation-graph",
    components: [{
      componentId: "component:button",
      componentName: "StateButton",
      componentFile: "StateButton.vue",
      reviewRequired: false,
      compilation: {
        schemaVersion: "1.0",
        kind: "primitive-dom-compilation",
        roots: ["node:button"],
        nodes: [{ id: "node:button", sourceNodeId: "source:button", order: 0, sourceTag: "button", componentName: "StateButton", renderTag: "button", renderStrategy: "button", classes: ["sg-state-button"], attributes: { type: "button" }, inlineStyle: {}, content: [{ kind: "text", value: "Open" }], conditions: [], loops: [] }],
        styleRules: [{ sourceNodeId: "source:button", selector: "[data-primitive-node=\\\"node:button\\\"]", declarations: { color: "var(--sg-ink)" }, provenance: "source-inline-style" }],
        interactions: [{ sourceNodeId: "source:button", event: "click", expression: "openEditor", modifiers: [], target: "[data-primitive-node=\\\"source:button\\\"]" }],
        metrics: { sourceNodes: 1, compiledNodes: 1, primitiveNodes: 1, inlineStyleRules: 1, responsiveRules: 0, interactionBindings: 1, unsupportedPrimitiveNodes: 0 },
        reviewReasons: [],
      },
    }],
    metrics: { components: 1, sourceNodes: 1, compiledNodes: 1, primitiveNodes: 1, inlineStyleRules: 1, responsiveRules: 0, interactionBindings: 1, unsupportedPrimitiveNodes: 0 },
    reviewReasons: [],
    reviewRequired: false,
  };
  const basePlan = await primitiveDomCompilationToBuildPlan(graph, { sourceRoot: directory, libraryName: "State Components", packageName: "state-components" });
  assert.equal(validateComponentLibraryBuildPlan(basePlan).ready, false);
  const enriched = enrichComponentLibraryBuildPlan(basePlan, {
    state: {
      schemaVersion: "1.0", kind: "sfc-state-responsibility", parsed: true, parseMode: "javascript", initialState: { open: false },
      handlers: [{ handler: "openEditor", writes: [{ path: "open", value: true, expression: "open.value = true", sourceLine: 2, confidence: "high" }], helperCalls: [], sourceLine: 2 }],
      displayFunctions: [], unresolvedWrites: [], metrics: { initialBindings: 1, handlers: 1, handlersWithWrites: 1, stateWrites: 1, displayFunctions: 0, unresolvedWrites: 0 }, reviewReasons: [],
    },
  });
  assert.equal(enriched.interactions[0]?.materialized, true);
  assert.equal(enriched.reviewRequired, false);
  assert.equal(validateComponentLibraryBuildPlan(enriched).ready, true);
  const outputRoot = join(directory, "library");
  const report = await runComponentLibraryBuild(enriched, outputRoot);
  assert.equal(report.status, "succeeded");
  const runtimeFile = enriched.files.find((file) => file.role === "runtime")!;
  const dom = new JSDOM(`<!doctype html><div id="mount"></div>`, { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.eval(runtimeFile.content);
  const api = (dom.window as unknown as { StateComponents: { mount: (host: Element, options: unknown) => { state: { open: boolean }; unmount: () => void } } }).StateComponents;
  const instance = api.mount(dom.window.document.getElementById("mount")!, {});
  dom.window.document.querySelector<HTMLButtonElement>("[data-primitive-node='node:button']")!.click();
  assert.equal(instance.state.open, true);
  instance.unmount();
  dom.window.close();
});


test("Reviewed component-prop Data Surface binds external options without embedding business values", async (context) => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-data-runtime-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const graph: PrimitiveDomCompilationGraph = {
    schemaVersion: "1.0", kind: "primitive-dom-compilation-graph",
    components: [{ componentId: "component:label", componentName: "DataLabel", componentFile: "DataLabel.vue", reviewRequired: false, compilation: {
      schemaVersion: "1.0", kind: "primitive-dom-compilation", roots: ["node:label"],
      nodes: [{ id: "node:label", sourceNodeId: "source:label", order: 0, sourceTag: "span", componentName: "DataLabel", renderTag: "span", renderStrategy: "native", classes: ["sg-data-label"], attributes: { ":aria-label": "title" }, inlineStyle: {}, content: [{ kind: "text", value: "{{ title }}" }], conditions: [], loops: [] }],
      styleRules: [{ sourceNodeId: "source:label", selector: "[data-primitive-node=\\\"node:label\\\"]", declarations: { color: "var(--sg-ink)" }, provenance: "source-inline-style" }], interactions: [],
      metrics: { sourceNodes: 1, compiledNodes: 1, primitiveNodes: 1, inlineStyleRules: 1, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 }, reviewReasons: [],
    } }],
    metrics: { components: 1, sourceNodes: 1, compiledNodes: 1, primitiveNodes: 1, inlineStyleRules: 1, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 }, reviewReasons: [], reviewRequired: false,
  };
  const basePlan = await primitiveDomCompilationToBuildPlan(graph, { sourceRoot: directory, libraryName: "Data Components", packageName: "data-components" });
  const enriched = enrichComponentLibraryBuildPlan(basePlan, { dataSurface: {
    unresolved: [], reviewRequired: false, surfaces: [{ id: "prop:label:title", owner: { componentId: "component:label", componentName: "DataLabel", componentFile: "DataLabel.vue" }, source: { primary: "component-prop", prop: { binding: "title", evidence: ["template-prop"] } }, shape: { kind: "scalar", itemKind: "scalar", cardinality: null, evidence: ["prop"] }, fields: [{ path: "title", consumers: ["component:label"], evidence: ["rendered-field"] }], consumers: [{ componentId: "component:label", componentName: "DataLabel", componentFile: "DataLabel.vue", targetBinding: "title", renderedFields: ["title"] }], injection: { kind: "component-prop", target: "title", reviewed: true }, references: [], evidence: [{ source: "template", detail: "title prop", confidence: "high" }], unresolved: [], reviewRequired: false }],
  } as never });
  assert.equal(enriched.dataBindings[0]?.materialized, true);
  assert.equal(validateComponentLibraryBuildPlan(enriched).ready, true);
  const runtime = enriched.files.find((file) => file.role === "runtime")!.content;
  const dom = new JSDOM(`<!doctype html><div id="mount"></div>`, { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.eval(runtime);
  const api = (dom.window as unknown as { DataComponents: { mount: (host: Element, options: unknown) => { unmount: () => void } } }).DataComponents;
  const instance = api.mount(dom.window.document.getElementById("mount")!, { data: { title: "Injected title" } });
  const label = dom.window.document.querySelector("[data-primitive-node='node:label']")!;
  assert.equal(label.getAttribute("aria-label"), "Injected title");
  assert.equal(label.textContent, "Injected title");
  assert.equal(runtime.includes("Injected title"), false);
  instance.unmount();
  dom.window.close();
});

test("Reviewed collection Data Surface materializes repeated DOM from external options", async (context) => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-collection-runtime-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const graph: PrimitiveDomCompilationGraph = {
    schemaVersion: "1.0", kind: "primitive-dom-compilation-graph",
    components: [{ componentId: "component:list", componentName: "ItemList", componentFile: "ItemList.vue", reviewRequired: false, compilation: {
      schemaVersion: "1.0", kind: "primitive-dom-compilation", roots: ["node:item"],
      nodes: [{ id: "node:item", sourceNodeId: "source:item", order: 0, sourceTag: "article", componentName: "ItemList", renderTag: "article", renderStrategy: "native", classes: ["sg-item"], attributes: { ":data-index": "index" }, inlineStyle: {}, content: [{ kind: "text", value: "{{ index }}:{{ item.name }}" }], conditions: [], loops: ["(item, index) in items"] }],
      styleRules: [{ sourceNodeId: "source:item", selector: "[data-primitive-node=\\\"node:item\\\"]", declarations: { color: "var(--sg-ink)" }, provenance: "source-inline-style" }], interactions: [],
      metrics: { sourceNodes: 1, compiledNodes: 1, primitiveNodes: 0, inlineStyleRules: 1, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 }, reviewReasons: [],
    } }],
    metrics: { components: 1, sourceNodes: 1, compiledNodes: 1, primitiveNodes: 0, inlineStyleRules: 1, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 },
    reviewReasons: ["v-for cardinality requires data-source evidence"], reviewRequired: true,
  };
  const basePlan = await primitiveDomCompilationToBuildPlan(graph, { sourceRoot: directory, libraryName: "Collection Components", packageName: "collection-components" });
  const enriched = enrichComponentLibraryBuildPlan(basePlan, {
    primitiveGraph: graph,
    dataSurface: {
      unresolved: [], reviewRequired: false, surfaces: [{ id: "prop:list:items", owner: { componentId: "component:list", componentName: "ItemList", componentFile: "ItemList.vue" }, source: { primary: "component-prop", prop: { binding: "items", evidence: ["template-repeat"] } }, shape: { kind: "collection", itemKind: "record", cardinality: null, evidence: ["template repeat consumes component prop items"] }, fields: [{ path: "name", consumers: ["component:list"], evidence: ["rendered-field"] }], consumers: [{ componentId: "component:list", componentName: "ItemList", componentFile: "ItemList.vue", targetBinding: "items", renderedFields: ["name"] }], injection: { kind: "component-prop", target: "items", reviewed: true }, references: [], evidence: [{ source: "template", detail: "items collection", confidence: "high" }], unresolved: [], reviewRequired: false }],
    } as never,
  });
  assert.equal(enriched.dataBindings[0]?.materialized, true);
  assert.equal(validateComponentLibraryBuildPlan(enriched).ready, true);
  const report = await runComponentLibraryBuild(enriched, join(directory, "library"));
  assert.equal(report.status, "succeeded");
  const runtime = enriched.files.find((file) => file.role === "runtime")!.content;
  const dom = new JSDOM(`<!doctype html><div id="mount"></div>`, { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.eval(runtime);
  const api = (dom.window as unknown as { CollectionComponents: { mount: (host: Element, options: unknown) => { unmount: () => void } } }).CollectionComponents;
  const instance = api.mount(dom.window.document.getElementById("mount")!, { data: { items: [{ name: "One" }, { name: "Two" }] } });
  assert.deepEqual([...dom.window.document.querySelectorAll("[data-primitive-node='node:item']")].map((node) => ({ text: node.textContent, index: node.getAttribute("data-index") })), [{ text: "0:One", index: "0" }, { text: "1:Two", index: "1" }]);
  instance.unmount();
  dom.window.close();
});


test("Reviewed collection runtime preserves Vue aliases for object and literal numeric loops", async (context) => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-loop-alias-runtime-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const graph: PrimitiveDomCompilationGraph = {
    schemaVersion: "1.0", kind: "primitive-dom-compilation-graph",
    components: [
      { componentId: "component:object-list", componentName: "ObjectList", componentFile: "ObjectList.vue", reviewRequired: false, compilation: {
        schemaVersion: "1.0", kind: "primitive-dom-compilation", roots: ["node:object-item"],
        nodes: [{ id: "node:object-item", sourceNodeId: "source:object-item", order: 0, sourceTag: "article", componentName: "ObjectList", renderTag: "article", renderStrategy: "native", classes: [], attributes: {}, inlineStyle: {}, content: [{ kind: "text", value: "{{ index }}:{{ key }}={{ item.name }}/{{ item.value }}" }], conditions: [], loops: ["(item, key, index) in items"] }],
        styleRules: [], interactions: [], metrics: { sourceNodes: 1, compiledNodes: 1, primitiveNodes: 0, inlineStyleRules: 0, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 }, reviewReasons: [],
      } },
      { componentId: "component:count-list", componentName: "CountList", componentFile: "CountList.vue", reviewRequired: false, compilation: {
        schemaVersion: "1.0", kind: "primitive-dom-compilation", roots: ["node:count-item"],
        nodes: [{ id: "node:count-item", sourceNodeId: "source:count-item", order: 0, sourceTag: "span", componentName: "CountList", renderTag: "span", renderStrategy: "native", classes: [], attributes: {}, inlineStyle: {}, content: [{ kind: "text", value: "{{ n }}" }], conditions: [], loops: ["n in +3"] }],
        styleRules: [], interactions: [], metrics: { sourceNodes: 1, compiledNodes: 1, primitiveNodes: 0, inlineStyleRules: 0, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 }, reviewReasons: [],
      } },
    ],
    metrics: { components: 2, sourceNodes: 2, compiledNodes: 2, primitiveNodes: 0, inlineStyleRules: 0, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 },
    reviewReasons: ["v-for cardinality requires data-source evidence"], reviewRequired: true,
  };
  const basePlan = await primitiveDomCompilationToBuildPlan(graph, { sourceRoot: directory, libraryName: "Loop Components", packageName: "loop-components" });
  const enriched = enrichComponentLibraryBuildPlan(basePlan, {
    primitiveGraph: graph,
    dataSurface: {
      unresolved: [], reviewRequired: false, surfaces: [{ id: "prop:object-list:items", owner: { componentId: "component:object-list", componentName: "ObjectList", componentFile: "ObjectList.vue" }, source: { primary: "component-prop", prop: { binding: "items", evidence: ["template-repeat"] } }, shape: { kind: "collection", itemKind: "record", cardinality: null, evidence: ["template repeat consumes component prop items"] }, fields: [{ path: "name", consumers: ["component:object-list"], evidence: ["rendered-field"] }], consumers: [{ componentId: "component:object-list", componentName: "ObjectList", componentFile: "ObjectList.vue", targetBinding: "items", renderedFields: ["name"] }], injection: { kind: "component-prop", target: "items", reviewed: true }, references: [], evidence: [{ source: "template", detail: "items object", confidence: "high" }], unresolved: [], reviewRequired: false }],
    } as never,
  });
  assert.equal(validateComponentLibraryBuildPlan(enriched).ready, true);
  const runtime = enriched.files.find((file) => file.role === "runtime")!.content;
  const dom = new JSDOM(`<!doctype html><div id="object"></div><div id="count"></div>`, { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.eval(runtime);
  const api = (dom.window as unknown as { LoopComponents: { mount: (host: Element, options: unknown) => { unmount: () => void } } }).LoopComponents;
  const objectInstance = api.mount(dom.window.document.getElementById("object")!, { componentId: "component:object-list", data: { items: { alpha: { name: "One", value: "A" }, beta: { name: "Two", value: "B" } } } });
  const countInstance = api.mount(dom.window.document.getElementById("count")!, { componentId: "component:count-list" });
  assert.deepEqual([...dom.window.document.querySelectorAll("#object [data-primitive-node='node:object-item']")].map((node) => node.textContent), ["0:alpha=One/A", "1:beta=Two/B"]);
  assert.deepEqual([...dom.window.document.querySelectorAll("#count [data-primitive-node='node:count-item']")].map((node) => node.textContent), ["1", "2", "3"]);
  objectInstance.unmount();
  countInstance.unmount();
  dom.window.close();
});

test("Collection review lifting is scoped to the matching Primitive graph and component owner", async (context) => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-loop-review-scope-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const graph: PrimitiveDomCompilationGraph = {
    schemaVersion: "1.0", kind: "primitive-dom-compilation-graph",
    components: [{ componentId: "component:list", componentName: "ScopedList", componentFile: "ScopedList.vue", reviewRequired: false, compilation: {
      schemaVersion: "1.0", kind: "primitive-dom-compilation", roots: ["node:item"],
      nodes: [{ id: "node:item", sourceNodeId: "source:item", order: 0, sourceTag: "div", componentName: "ScopedList", renderTag: "div", renderStrategy: "native", classes: [], attributes: {}, inlineStyle: {}, content: [{ kind: "text", value: "{{ item.name }}" }], conditions: [], loops: ["item in items"] }],
      styleRules: [], interactions: [], metrics: { sourceNodes: 1, compiledNodes: 1, primitiveNodes: 0, inlineStyleRules: 0, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 }, reviewReasons: [],
    } }],
    metrics: { components: 1, sourceNodes: 1, compiledNodes: 1, primitiveNodes: 0, inlineStyleRules: 0, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 }, reviewReasons: ["v-for cardinality requires data-source evidence"], reviewRequired: true,
  };
  const basePlan = await primitiveDomCompilationToBuildPlan(graph, { sourceRoot: directory, libraryName: "Scoped Loop Components", packageName: "scoped-loop-components" });
  const wrongOwner = enrichComponentLibraryBuildPlan(basePlan, {
    primitiveGraph: graph,
    dataSurface: { unresolved: [], reviewRequired: false, surfaces: [{ id: "prop:other:items", owner: { componentId: "component:other", componentName: "Other", componentFile: "Other.vue" }, source: { primary: "component-prop", prop: { binding: "items", evidence: ["template-repeat"] } }, shape: { kind: "collection", itemKind: "record", cardinality: null, evidence: ["template repeat"] }, fields: [], consumers: [{ componentId: "component:other", componentName: "Other", componentFile: "Other.vue", targetBinding: "items", renderedFields: [] }], injection: { kind: "component-prop", target: "items", reviewed: true }, references: [], evidence: [{ source: "template", detail: "other items", confidence: "high" }], unresolved: [], reviewRequired: false }] } as never,
  });
  assert.equal(wrongOwner.reviewRequired, true);
  assert.equal(wrongOwner.unresolved.some((reason) => reason.includes("repeated region requires reviewed collection binding")), true);

  const foreignGraph = JSON.parse(JSON.stringify(graph)) as PrimitiveDomCompilationGraph;
  (foreignGraph.components[0] as { componentFile: string }).componentFile = "Foreign.vue";
  const wrongIdentity = enrichComponentLibraryBuildPlan(basePlan, { primitiveGraph: foreignGraph });
  assert.equal(wrongIdentity.reviewRequired, true);
  assert.equal(wrongIdentity.unresolved.includes("primitive-dom: graph identity does not match build plan sourceHash"), true);
});


test("Reviewed conditional interaction runs through the configured component quality contract", async (context) => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-component-quality-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const originalPath = join(directory, "original.html");
  const scenarioPath = join(directory, "scenarios.json");
  await writeFile(originalPath, `<!doctype html><html lang="en"><body><section class="sg-component-library" data-component-id="component:toggle"><button class="sg-toggle" type="button">Toggle details</button><div class="sg-panel" hidden>Details content</div></section><script>const button=document.querySelector('.sg-toggle');const panel=document.querySelector('.sg-panel');button.addEventListener('click',()=>{panel.hidden=!panel.hidden;});</script></body></html>`, "utf8");
  const manifest = analyzeHtml(originalPath);
  await writeFile(scenarioPath, `${JSON.stringify({ schemaVersion: "1.0", scenarios: [{ id: "toggle-details", label: "Toggle reviewed conditional region", covers: manifest.interactions.map(interactionFingerprint), steps: [{ action: "click", target: { reference: ".sg-toggle", library: ".sg-toggle" } }], assertions: [{ target: { reference: ".sg-panel", library: ".sg-panel" }, visible: true, text: "Details content" }] }] }, null, 2)}\n`, "utf8");
  const graph: PrimitiveDomCompilationGraph = {
    schemaVersion: "1.0", kind: "primitive-dom-compilation-graph",
    components: [{ componentId: "component:toggle", componentName: "ToggleDetails", componentFile: "ToggleDetails.vue", reviewRequired: false, compilation: {
      schemaVersion: "1.0", kind: "primitive-dom-compilation", roots: ["node:button", "node:panel"],
      nodes: [
        { id: "node:button", sourceNodeId: "source:button", order: 0, sourceTag: "button", componentName: "ToggleDetails", renderTag: "button", renderStrategy: "button", classes: ["sg-toggle"], attributes: { type: "button" }, inlineStyle: {}, content: [{ kind: "text", value: "Toggle details" }], conditions: [], loops: [] },
        { id: "node:panel", sourceNodeId: "source:panel", order: 1, sourceTag: "div", componentName: "ToggleDetails", renderTag: "div", renderStrategy: "native", classes: ["sg-panel"], attributes: {}, inlineStyle: {}, content: [{ kind: "text", value: "Details content" }], conditions: ["open"], conditionDirective: { kind: "show", expression: "open" }, loops: [] },
      ],
      styleRules: [
        { sourceNodeId: "source:button", selector: "[data-primitive-node=\"node:button\"]", declarations: { color: "var(--sg-ink)" }, provenance: "source-inline-style" },
        { sourceNodeId: "source:panel", selector: "[data-primitive-node=\"node:panel\"]", declarations: { color: "var(--sg-ink)" }, provenance: "source-inline-style" },
      ],
      interactions: [{ sourceNodeId: "source:button", event: "click", expression: "toggleDetails", modifiers: [], target: ".sg-toggle" }],
      metrics: { sourceNodes: 2, compiledNodes: 2, primitiveNodes: 1, inlineStyleRules: 2, responsiveRules: 0, interactionBindings: 1, unsupportedPrimitiveNodes: 0 }, reviewReasons: [],
    } }],
    metrics: { components: 1, sourceNodes: 2, compiledNodes: 2, primitiveNodes: 1, inlineStyleRules: 2, responsiveRules: 0, interactionBindings: 1, unsupportedPrimitiveNodes: 0 }, reviewReasons: [], reviewRequired: false,
  };
  const basePlan = await primitiveDomCompilationToBuildPlan(graph, {
    sourceRoot: directory,
    libraryName: "Conditional Components",
    packageName: "conditional-components",
    quality: { originalHtmlPath: originalPath, scenarioPath, visual: false },
  });
  assert.equal(basePlan.unresolved.some((reason) => reason.includes("conditional region requires state materialization")), true);
  const state: SfcStateResponsibility = {
    schemaVersion: "1.0", kind: "sfc-state-responsibility", parsed: true, parseMode: "javascript", initialState: { open: false },
    handlers: [{ handler: "toggleDetails", writes: [{ path: "open", expression: "open.value = !open.value", sourceLine: 2, confidence: "high" }], helperCalls: [], sourceLine: 2 }],
    displayFunctions: [], unresolvedWrites: [], metrics: { initialBindings: 1, handlers: 1, handlersWithWrites: 1, stateWrites: 1, displayFunctions: 0, unresolvedWrites: 0 }, reviewReasons: [],
  };
  const missingPrimitiveEvidence = enrichComponentLibraryBuildPlan(basePlan, { state });
  assert.equal(missingPrimitiveEvidence.unresolved.some((reason) => reason.includes("conditional region requires state materialization")), true);
  const enriched = enrichComponentLibraryBuildPlan(basePlan, { primitiveGraph: graph, state });
  assert.equal(enriched.unresolved.some((reason) => reason.includes("conditional region requires state materialization")), false);
  assert.equal(validateComponentLibraryBuildPlan(enriched).ready, true);
  const report = await runComponentLibraryBuild(enriched, join(directory, "library"));
  assert.equal(report.status, "succeeded");
  assert.equal(report.quality?.passed, true);
  assert.equal(report.quality?.scenarios?.[0]?.passed, true);
  assert.equal(report.quality?.coverage?.verifiedRate, 1);
});

test("Reviewed v-model binding updates state and dependent DOM without unreviewed execution", async (context) => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-model-runtime-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const graph: PrimitiveDomCompilationGraph = {
    schemaVersion: "1.0", kind: "primitive-dom-compilation-graph",
    components: [{ componentId: "component:model", componentName: "ModelField", componentFile: "ModelField.vue", reviewRequired: false, compilation: {
      schemaVersion: "1.0", kind: "primitive-dom-compilation", roots: ["node:input", "node:output"],
      nodes: [
        { id: "node:input", sourceNodeId: "source:input", order: 0, sourceTag: "input", componentName: "ModelField", renderTag: "input", renderStrategy: "input", classes: ["sg-name-input"], attributes: { type: "text", "v-model": "name.value", "aria-label": "Name" }, inlineStyle: {}, content: [], conditions: [], loops: [] },
        { id: "node:output", sourceNodeId: "source:output", order: 1, sourceTag: "output", componentName: "ModelField", renderTag: "output", renderStrategy: "native", classes: ["sg-name-output"], attributes: {}, inlineStyle: {}, content: [{ kind: "text", value: "{{ name }}" }], conditions: [], loops: [] },
      ],
      styleRules: [], interactions: [], metrics: { sourceNodes: 2, compiledNodes: 2, primitiveNodes: 1, inlineStyleRules: 0, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 }, reviewReasons: [],
    } }],
    metrics: { components: 1, sourceNodes: 2, compiledNodes: 2, primitiveNodes: 1, inlineStyleRules: 0, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 }, reviewReasons: [], reviewRequired: false,
  };
  const basePlan = await primitiveDomCompilationToBuildPlan(graph, { sourceRoot: directory, libraryName: "Model Components", packageName: "model-components" });
  assert.equal(basePlan.unresolved.some((reason) => reason.includes("model binding requires reviewed state materialization")), true);
  const state: SfcStateResponsibility = {
    schemaVersion: "1.0", kind: "sfc-state-responsibility", parsed: true, parseMode: "javascript", initialState: { name: "" }, handlers: [], displayFunctions: [], unresolvedWrites: [],
    metrics: { initialBindings: 1, handlers: 0, handlersWithWrites: 0, stateWrites: 0, displayFunctions: 0, unresolvedWrites: 0 }, reviewReasons: [],
  };
  const missingPrimitiveEvidence = enrichComponentLibraryBuildPlan(basePlan, { state });
  assert.equal(missingPrimitiveEvidence.reviewRequired, true);
  const enriched = enrichComponentLibraryBuildPlan(basePlan, { primitiveGraph: graph, state });
  assert.equal(validateComponentLibraryBuildPlan(enriched).ready, true);
  const runtime = enriched.files.find((file) => file.role === "runtime")!.content;
  const dom = new JSDOM(`<!doctype html><div id="mount"></div>`, { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.eval(runtime);
  const api = (dom.window as unknown as { ModelComponents: { mount: (host: Element, options: unknown) => { state: { name: string }; unmount: () => void } } }).ModelComponents;
  const instance = api.mount(dom.window.document.getElementById("mount")!, {});
  const input = dom.window.document.querySelector<HTMLInputElement>(".sg-name-input")!;
  input.focus();
  input.value = "Ada Lovelace";
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  const replacement = dom.window.document.querySelector<HTMLInputElement>(".sg-name-input")!;
  assert.equal(instance.state.name, "Ada Lovelace");
  assert.equal(dom.window.document.querySelector(".sg-name-output")?.textContent, "Ada Lovelace");
  assert.equal(replacement.value, "Ada Lovelace");
  assert.equal(dom.window.document.activeElement, replacement);
  instance.unmount();
  dom.window.close();

  const modifierGraph = JSON.parse(JSON.stringify(graph)) as PrimitiveDomCompilationGraph;
  const modifierAttributes = modifierGraph.components[0].compilation.nodes[0].attributes;
  delete modifierAttributes["v-model"];
  modifierAttributes["v-model.trim"] = "name.value";
  const modifierPlan = await primitiveDomCompilationToBuildPlan(modifierGraph, { sourceRoot: directory, libraryName: "Modifier Model Components", packageName: "modifier-model-components" });
  const blockedModifier = enrichComponentLibraryBuildPlan(modifierPlan, { primitiveGraph: modifierGraph, state });
  assert.equal(blockedModifier.reviewRequired, true);
  assert.equal(blockedModifier.unresolved.some((reason) => reason.includes("model binding requires reviewed state materialization")), true);
});

test("Owner-scoped state evidence isolates same-named handlers across generated components", async (context) => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-owner-state-runtime-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const component = (ownerId: string, nodeId: string, name: string) => ({
    componentId: ownerId, componentName: name, componentFile: `${name}.vue`, reviewRequired: false,
    compilation: {
      schemaVersion: "1.0" as const, kind: "primitive-dom-compilation" as const, roots: [nodeId],
      nodes: [{ id: nodeId, sourceNodeId: `${nodeId}:source`, order: 0, sourceTag: "button", componentName: name, renderTag: "button", renderStrategy: "button" as const, classes: [`sg-${name.toLowerCase()}`], attributes: { type: "button" }, inlineStyle: {}, content: [{ kind: "text" as const, value: name }], conditions: [], loops: [] }],
      styleRules: [], interactions: [{ sourceNodeId: `${nodeId}:source`, event: "click", expression: "toggle", modifiers: [], target: `[data-primitive-node=\"${nodeId}\"]` }],
      metrics: { sourceNodes: 1, compiledNodes: 1, primitiveNodes: 1, inlineStyleRules: 0, responsiveRules: 0, interactionBindings: 1, unsupportedPrimitiveNodes: 0 }, reviewReasons: [],
    },
  });
  const graph: PrimitiveDomCompilationGraph = {
    schemaVersion: "1.0", kind: "primitive-dom-compilation-graph",
    components: [component("component:a", "node:a", "Alpha"), component("component:b", "node:b", "Beta")],
    metrics: { components: 2, sourceNodes: 2, compiledNodes: 2, primitiveNodes: 2, inlineStyleRules: 0, responsiveRules: 0, interactionBindings: 2, unsupportedPrimitiveNodes: 0 }, reviewReasons: [], reviewRequired: false,
  };
  const basePlan = await primitiveDomCompilationToBuildPlan(graph, { sourceRoot: directory, libraryName: "Owner State Components", packageName: "owner-state-components" });
  const alphaState: SfcStateResponsibility = {
    schemaVersion: "1.0", kind: "sfc-state-responsibility", parsed: true, parseMode: "javascript", initialState: { active: false },
    handlers: [{ handler: "toggle", writes: [{ path: "active", value: true, expression: "active.value = true", sourceLine: 1, confidence: "high" }], helperCalls: [], sourceLine: 1 }], displayFunctions: [], unresolvedWrites: [],
    metrics: { initialBindings: 1, handlers: 1, handlersWithWrites: 1, stateWrites: 1, displayFunctions: 0, unresolvedWrites: 0 }, reviewReasons: [],
  };
  const betaState: SfcStateResponsibility = {
    schemaVersion: "1.0", kind: "sfc-state-responsibility", parsed: true, parseMode: "javascript", initialState: { active: true },
    handlers: [{ handler: "toggle", writes: [{ path: "active", value: false, expression: "active.value = false", sourceLine: 1, confidence: "high" }], helperCalls: [], sourceLine: 1 }], displayFunctions: [], unresolvedWrites: [],
    metrics: { initialBindings: 1, handlers: 1, handlersWithWrites: 1, stateWrites: 1, displayFunctions: 0, unresolvedWrites: 0 }, reviewReasons: [],
  };
  const ambiguous = enrichComponentLibraryBuildPlan(basePlan, { primitiveGraph: graph, state: alphaState });
  assert.equal(ambiguous.reviewRequired, true);
  assert.equal(ambiguous.unresolved.some((reason) => reason.includes("unscoped state evidence is ambiguous")), true);

  const stateMap: ComponentLibraryStateEvidenceMap = {
    schemaVersion: "1.0", kind: "component-state-evidence-map",
    entries: [{ ownerId: "component:a", responsibility: alphaState }, { ownerId: "component:b", responsibility: betaState }],
  };
  const enriched = enrichComponentLibraryBuildPlan(basePlan, { primitiveGraph: graph, stateMap });
  assert.equal(validateComponentLibraryBuildPlan(enriched).ready, true);
  assert.equal(enriched.interactions.every((binding) => binding.materialized && binding.ownerId), true);
  const runtime = enriched.files.find((file) => file.role === "runtime")!.content;
  const dom = new JSDOM(`<!doctype html><div id="alpha"></div><div id="beta"></div>`, { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.eval(runtime);
  const api = (dom.window as unknown as { OwnerStateComponents: { mount: (host: Element, options: unknown) => { state: { active: boolean }; unmount: () => void } } }).OwnerStateComponents;
  const alpha = api.mount(dom.window.document.getElementById("alpha")!, { componentId: "component:a" });
  const beta = api.mount(dom.window.document.getElementById("beta")!, { componentId: "component:b" });
  assert.equal(alpha.state.active, false);
  assert.equal(beta.state.active, true);
  dom.window.document.querySelector<HTMLButtonElement>("#alpha [data-primitive-node='node:a']")!.click();
  dom.window.document.querySelector<HTMLButtonElement>("#beta [data-primitive-node='node:b']")!.click();
  assert.equal(alpha.state.active, true);
  assert.equal(beta.state.active, false);
  alpha.unmount();
  beta.unmount();
  dom.window.close();
});
