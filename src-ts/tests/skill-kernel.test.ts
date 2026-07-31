import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { analyzeHtml } from "../analysis/analyzer.js";
import { defineSkill } from "../core/skills/contract.js";
import { SkillExecutionError } from "../core/skills/evidence.js";
import { ResponsibilityGraphStore } from "../core/responsibility/store.js";
import { ProfileExecutionPlanner } from "../core/profiles/execution-plan.js";
import { ProfileExecutor } from "../core/profiles/executor.js";
import { SkillExecutionContext } from "../core/skills/execution-context.js";
import { SkillRegistry } from "../core/skills/registry.js";
import type { SpaRouterContractConfig, SpaRouterContractReport } from "../evaluation/spa-router.js";
import type { SpaAuthGuardResponsibilityAnalysis } from "../planning/spa-auth-guard-responsibility.js";
import {
  analyzeTransportProxyResponsibilities,
  type ApiFixtureResponsibilityGraph,
} from "../planning/api-fixture-responsibility.js";
import { analyzeSfcStateResponsibilities, type SfcStateResponsibility } from "../planning/sfc-state-responsibility.js";
import { createDefaultReviewedBindingRegistry } from "../profiles/default-bindings.js";
import { createDefaultTaskProfileRegistry } from "../profiles/default-profiles.js";
import { TaskProfileRegistry } from "../core/profiles/registry.js";
import { ReviewedBindingRegistry } from "../core/artifacts/registry.js";
import { createApiResponsibilitySkill, projectApiResponsibilityDelta, type ApiResponsibilitySkillInput } from "../skills/api-responsibility.js";
import { createAuthGuardSkill } from "../skills/auth-guard.js";
import { componentOwnershipSkill, type ComponentOwnershipSkillInput } from "../skills/component-ownership.js";
import { componentLibraryValidationSkill, createComponentLibraryValidationSkill, type ComponentLibraryValidator } from "../skills/component-library-validation.js";
import { primitiveDomSkill, createPrimitiveDomSkill, type PrimitiveDomCompiler } from "../skills/primitive-dom.js";
import { dataCardinalitySkill, extractDataCardinalityResponsibilities, projectDataCardinalityDelta } from "../skills/data-cardinality.js";
import { buildDataSurfaceManifest, dataSurfaceManifestSkill, projectDataSurfaceManifestDelta } from "../skills/data-surface-manifest/index.js";
import { createDefaultSkillRegistry } from "../skills/default-registry.js";
import { createSourceStructureSkill, sourceStructureSkill, type SourceStructureAnalyzer } from "../skills/source-structure.js";
import { createSpaRouterSkill } from "../skills/spa-router.js";
import { stateResponsibilitySkill } from "../skills/state-responsibility.js";
import { transportProxySkill } from "../skills/transport-proxy.js";
import type { Manifest } from "../types.js";
import type { SfcVisualComponentResponsibility } from "../planning/sfc-visual-responsibility.js";
import { analyzeSfcTemplateStructure } from "../planning/sfc-template-structure.js";
import type { PrimitiveDomCompilation } from "../planning/primitive-dom-compiler.js";
import { parseProfileRunConfiguration } from "../profiles/profile-config.js";

const root = new URL("../../", import.meta.url).pathname;

test("default Skill Registry exposes deterministic capability manifests", () => {
  const registry = createDefaultSkillRegistry();
  assert.deepEqual(registry.list().map((manifest) => manifest.id), ["api-responsibility", "auth-guard", "component-library-validation", "component-ownership", "data-cardinality", "data-surface-manifest", "primitive-dom", "source-structure", "spa-router", "state-responsibility", "transport-proxy"]);
  assert.equal(registry.get("source-structure").contractVersion, "1.0");
  assert.equal(registry.get("spa-router").optionalDependencies.includes("source-structure"), true);
  assert.deepEqual(registry.resolve(["auth-guard"]).map((manifest) => manifest.id), ["source-structure", "state-responsibility", "auth-guard"]);
});

test("source-structure wrapper preserves the existing analyzer output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ui-dismantler-source-skill-"));
  const htmlPath = join(directory, "source.html");
  await writeFile(htmlPath, `<!doctype html><html lang="en"><head><title>Skill fixture</title><style>:root{--accent:#123456}.panel{display:grid}</style></head><body><main><section class="panel"><h1>Skill fixture</h1><button data-action="toggle">Toggle</button></section></main></body></html>`, "utf8");
  const expected = analyzeHtml(htmlPath, { profile: "skill-test" });
  const actual = await sourceStructureSkill.execute({ htmlPath, options: { profile: "skill-test" } });
  assert.deepEqual(actual, expected);
});

test("component-library-validation wrapper preserves the existing ValidationReport", async () => {
  const libraryRoot = join(root, "benchmark/lib");
  const actual = await componentLibraryValidationSkill.execute({ libraryRoot });
  assert.equal(actual.ok, true);
  assert.equal(actual.failed, 0);
  assert.equal(actual.total, 9);
  assert.equal(actual.results.some((result) => result.id === "data-separation" && result.passed), true);
});

test("component-library-validation factory forwards the library root without transforming output", async () => {
  const marker = { target: "/tmp/library", passed: 1, failed: 0, total: 1, ok: true, results: [] };
  const calls: string[] = [];
  const validator: ComponentLibraryValidator = (libraryRoot) => {
    calls.push(libraryRoot);
    return marker;
  };
  const skill = createComponentLibraryValidationSkill(validator);
  const output = await skill.execute({ libraryRoot: "/tmp/library" });
  assert.equal(output, marker);
  assert.deepEqual(calls, ["/tmp/library"]);
});

test("primitive-dom Skill preserves compiler provenance and review reasons across component owners", async () => {
  const component = {
    id: "sfc:login",
    file: "src/Login.vue",
    componentName: "Login",
    templateStructure: analyzeSfcTemplateStructure(`<template><el-form><el-input v-model="form.name"/><el-button @click="submit">Submit</el-button></el-form></template>`),
    reviewReasons: [],
  } as unknown as SfcVisualComponentResponsibility;
  const graph = { components: [component], reviewRequired: false, reviewReasons: [] } as unknown as import("../planning/sfc-visual-responsibility.js").SfcVisualResponsibilityGraph;
  const output = await primitiveDomSkill.execute({ graph });
  assert.equal(output.kind, "primitive-dom-compilation-graph");
  assert.equal(output.metrics.components, 1);
  assert.equal(output.metrics.compiledNodes, component.templateStructure.nodes.length);
  assert.equal(output.components[0]?.compilation.nodes[0]?.sourceNodeId, component.templateStructure.nodes[0]?.id);
  assert.equal(output.components[0]?.compilation.interactions[0]?.expression, "submit");
  assert.equal(output.reviewRequired, false);
  const reviewedGraph = { components: [component], reviewRequired: true, reviewReasons: ["graph blocker"] } as unknown as import("../planning/sfc-visual-responsibility.js").SfcVisualResponsibilityGraph;
  const reviewed = await primitiveDomSkill.execute({ graph: reviewedGraph });
  assert.equal(reviewed.reviewRequired, true);
  assert.deepEqual(reviewed.reviewReasons.slice(0, 1), ["component-ownership: graph blocker"]);
});

test("primitive-dom Skill factory forwards the component set and compiler scope", async () => {
  const structure = analyzeSfcTemplateStructure(`<template><div><el-tag>Tag</el-tag></div></template>`);
  const component = { id: "sfc:tag", file: "Tag.vue", componentName: "Tag", templateStructure: structure, reviewReasons: [] } as unknown as SfcVisualComponentResponsibility;
  const marker = { schemaVersion: "1.0", kind: "primitive-dom-compilation", roots: [], nodes: [], styleRules: [], interactions: [], metrics: { sourceNodes: 0, compiledNodes: 0, primitiveNodes: 0, inlineStyleRules: 0, responsiveRules: 0, interactionBindings: 0, unsupportedPrimitiveNodes: 0 }, reviewReasons: [] } satisfies PrimitiveDomCompilation;
  const calls: Array<{ nodes: number; scope: string }> = [];
  const compiler: PrimitiveDomCompiler = (received, scope) => { calls.push({ nodes: received.nodes.length, scope }); return marker; };
  const graph = { components: [component], reviewRequired: false, reviewReasons: [] } as unknown as import("../planning/sfc-visual-responsibility.js").SfcVisualResponsibilityGraph;
  const output = await createPrimitiveDomSkill(compiler).execute({ graph });
  assert.equal(output.components[0]?.compilation, marker);
  assert.deepEqual(calls, [{ nodes: structure.nodes.length, scope: "sfc:tag" }]);
});

test("source-structure factory forwards inputs without transforming output", async () => {
  const marker = { schemaVersion: "1.0", marker: true } as unknown as Manifest;
  const calls: unknown[] = [];
  const analyzer: SourceStructureAnalyzer = (htmlPath, options) => {
    calls.push({ htmlPath, options });
    return marker;
  };
  const skill = createSourceStructureSkill(analyzer);
  const output = await skill.execute({ htmlPath: "/tmp/source.html", options: { minimal: true } });
  assert.equal(output, marker);
  assert.deepEqual(calls, [{ htmlPath: "/tmp/source.html", options: { minimal: true } }]);
});

test("state-responsibility wrapper preserves structural state analysis", async () => {
  const script = `const open = ref(false); function showEditor(){ open.value = true } function hideEditor(){ open.value = false }`;
  const expected = analyzeSfcStateResponsibilities(script);
  const actual = await stateResponsibilitySkill.execute({ script });
  assert.deepEqual(actual, expected);
});

test("auth-guard wrapper forwards source ownership input without transforming output", async () => {
  const marker = { evidence: [], marker: true } as unknown as SpaAuthGuardResponsibilityAnalysis;
  const calls: string[] = [];
  const skill = createAuthGuardSkill((sourceRoot) => {
    calls.push(sourceRoot);
    return marker;
  });
  const output = await skill.execute({ sourceRoot: "/tmp/spa-source" });
  assert.equal(output, marker);
  assert.deepEqual(calls, ["/tmp/spa-source"]);
});





test("component-ownership wrapper preserves SFC analysis and emits a sidecar responsibility delta", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ui-dismantler-component-skill-"));
  await writeFile(join(directory, "ProfileCard.vue"), `<template><article class="profile-card"><h2>{{ title }}</h2><button @click="open = true">Edit</button></article></template><script setup>import { ref } from "vue"; const title = "Profile"; const open = ref(false)</script><style scoped>.profile-card{display:grid}</style>`, "utf8");
  const expected = (await import("../planning/sfc-visual-responsibility.js")).analyzeSfcVisualResponsibilities(directory);
  const actual = await componentOwnershipSkill.execute({ sourceRoot: directory });
  const normalizedExpected = structuredClone(expected);
  const normalizedActual = structuredClone(actual);
  normalizedExpected.metrics.scanMs = 0;
  normalizedActual.metrics.scanMs = 0;
  normalizedExpected.echarts.metrics.scanMs = 0;
  normalizedActual.echarts.metrics.scanMs = 0;
  assert.deepEqual(normalizedActual, normalizedExpected);
  const delta = componentOwnershipSkill.projectResponsibilityGraph?.(actual);
  assert.equal(delta?.skillId, "component-ownership");
  assert.equal(delta?.nodes.length, actual.components.length);
  assert.equal(delta?.nodes[0]?.kind, "component-owner");
});

test("Skill Execution Context binds component artifacts into API responsibility input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ui-dismantler-context-"));
  await writeFile(join(directory, "Profiles.vue"), `<template><main><h1>Profiles</h1></main></template><script setup>const title = "Profiles"</script><style scoped>main{display:block}</style>`, "utf8");
  const registry = createDefaultSkillRegistry();
  const context = new SkillExecutionContext(registry);
  const componentRun = await context.execute<ComponentOwnershipSkillInput, Awaited<ReturnType<typeof componentOwnershipSkill.execute>>>("component-ownership", { sourceRoot: directory });
  assert.equal(componentRun.artifacts[0]?.contract, "sfc-visual-responsibility-graph");
  assert.equal(componentRun.graphDelta?.nodes.length, componentRun.output.components.length);
  const config = { reference: { baseUrl: "http://reference.test" }, generated: { baseUrl: "http://generated.test" }, scenarios: [], fixtures: [] } as unknown as SpaRouterContractConfig;
  const apiRun = await context.executeBound<ApiResponsibilitySkillInput, ApiFixtureResponsibilityGraph>(
    "api-responsibility",
    { sourceRoot: directory, config, components: [] },
    [{ consumerSkillId: "api-responsibility", inputContract: "sfc-visual-responsibility-graph", inputPath: "components", artifactContract: "sfc-visual-responsibility-graph", outputPath: "components", reviewed: true }],
  );
  assert.equal(apiRun.output.metrics.componentsScanned, componentRun.output.components.length);
  assert.equal(apiRun.artifacts[0]?.contract, "api-fixture-responsibility-graph");
  assert.equal(apiRun.graphDelta?.sourceGraphKind, "api-fixture-responsibility-graph");
  assert.equal(context.outputs.get("sfc-visual-responsibility-graph").producerSkillId, "component-ownership");
  const responsibilitySnapshot = context.responsibilities.snapshot();
  assert.equal(responsibilitySnapshot.deltas.length, 2);
  assert.equal(responsibilitySnapshot.nodes.some((node) => node.kind === "component-owner"), true);
});

test("API responsibility projection links component owners to reviewed API responsibilities", () => {
  const graph: ApiFixtureResponsibilityGraph = {
    schemaVersion: "1.0",
    kind: "api-fixture-responsibility-graph",
    reviewRequired: true,
    sourceRoot: "/tmp/source",
    responsibilities: [{
      id: "api-fixture:profiles:listProfiles",
      componentId: "profiles",
      componentName: "Profiles",
      componentFile: "src/views/Profiles.vue",
      apiCall: { localName: "listProfiles", exportedName: "listProfiles", importSource: "../api/profiles", moduleFile: "src/api/profiles.ts", method: "GET", path: "/profiles", transportPrefixes: [{ value: "/api", source: "env" }], transportPathCandidates: ["/api/profiles"], runtimeSelections: [], proxyRoutes: [] },
      consumption: { targetBinding: "profiles", responsePath: "data" },
      renderedFields: [{ field: "name", filters: [], tagged: false }],
      filterValueMaps: {},
      fixture: { index: 0, requestPath: "/api/profiles", reviewed: true, bodyHash: "hash", responseValue: [{ name: "One" }], materializedValue: [{ name: "One" }] },
      confidence: "high",
      reviewReasons: [],
    }],
    candidates: [], responseFlows: [], unresolved: [],
    metrics: { componentsScanned: 1, importedApiCalls: 1, apiCandidates: 1, actualApiWrappers: 1, frameworkComposables: 0, localStateStoreHelpers: 0, utilityFunctions: 0, unresolvedLocalTransports: 0, responseFlows: 0, dynamicRouteFlows: 0, matchedEndpoints: 1, matchedFixtures: 1, materializedBindings: 1, renderedFields: 1, transportPrefixesInferred: 1, runtimeSelectionsInferred: 0, proxyRoutesInferred: 0, proxyTargetsInferred: 0, proxyRewriteRulesInferred: 0, proxyAstRoutesInferred: 0, proxyFallbackRoutesInferred: 0, proxyParseDiagnostics: 0 },
    reviewReasons: [],
  };
  const delta = projectApiResponsibilityDelta(graph);
  assert.equal(delta.nodes[0]?.id, "api-responsibility:api-fixture:profiles:listProfiles");
  assert.equal(delta.edges[0]?.from, "component:profiles");
  assert.equal(delta.edges[0]?.relation, "consumes-api");
});

test("data-cardinality Skill extracts component-owned evidence and projects unresolved repeats", async () => {
  const component = {
    id: "profiles",
    file: "src/views/Profiles.vue",
    componentName: "Profiles",
    dataCardinality: {
      staticBindings: { profiles: [{ name: "One" }, { name: "Two" }] },
      cardinalities: [
        { path: "profiles", count: 2, source: "module-static-binding" as const },
        { path: "templateRepeat[0]:profile in remoteProfiles", count: -1, source: "template-repeat" as const },
      ],
      sliceLimits: [],
      templateRepeats: ["profile in remoteProfiles"],
      unresolvedReferences: ["remoteProfiles"],
    },
  } as unknown as SfcVisualComponentResponsibility;
  const expected = extractDataCardinalityResponsibilities([component]);
  const actual = await dataCardinalitySkill.execute({ components: [component] });
  assert.deepEqual(actual, expected);
  assert.equal(actual.metrics.cardinalityEvidence, 2);
  assert.equal(actual.metrics.unresolvedReferences, 1);
  assert.equal(actual.reviewRequired, true);
  const delta = projectDataCardinalityDelta(actual);
  assert.equal(delta.nodes[0]?.attributes.count, 2);
  assert.equal(delta.edges[0]?.from, "component:profiles");
  assert.deepEqual(delta.unresolved, [{ owner: "component:profiles", source: "src/views/Profiles.vue", reason: "unresolved repeated data reference: remoteProfiles" }]);
  assert.equal(delta.reviewRequired, true);
});

test("data-surface-manifest Skill joins reviewed API cardinality and component evidence without generating a Data Pack", async () => {
  const component = {
    id: "profiles",
    file: "src/views/Profiles.vue",
    componentName: "Profiles",
    dataCardinality: {
      staticBindings: {
        profiles: [{ name: "Fallback", status: "active" }],
        filters: [{ label: "Active", value: { $reference: "statuses.active" } }],
        statuses: { active: "active" },
      },
      cardinalities: [
        { path: "profiles", count: 1, source: "module-static-binding" as const },
        { path: "filters", count: 1, source: "module-static-binding" as const },
      ],
      sliceLimits: [1], templateRepeats: [], unresolvedReferences: [],
    },
    stateResponsibility: {
      schemaVersion: "1.0", kind: "sfc-state-responsibility", parsed: true, parseMode: "javascript",
      initialState: { profiles: [] }, handlers: [], displayFunctions: [], unresolvedWrites: [],
      metrics: { initialBindings: 1, handlers: 0, handlersWithWrites: 0, stateWrites: 0, displayFunctions: 0, unresolvedWrites: 0 }, reviewReasons: [],
    },
  } as unknown as SfcVisualComponentResponsibility;
  const cardinality = extractDataCardinalityResponsibilities([component]);
  const api = {
    schemaVersion: "1.0", kind: "api-fixture-responsibility-graph", reviewRequired: true, sourceRoot: "/tmp/library",
    responsibilities: [{
      id: "api-fixture:profiles:listProfiles", componentId: "profiles", componentName: "Profiles", componentFile: "src/views/Profiles.vue",
      apiCall: { localName: "listProfiles", exportedName: "listProfiles", importSource: "@/api/profiles", moduleFile: "src/api/profiles.ts", method: "GET", path: "/profiles", transportPrefixes: [{ value: "/api", source: "vite.config.ts" }], transportPathCandidates: ["/api/profiles"], runtimeSelections: [], proxyRoutes: [] },
      consumption: { targetBinding: "profiles", responsePath: "data", sliceLimit: 1 },
      renderedFields: [{ field: "name", filters: [], tagged: false }], filterValueMaps: {},
      fixture: { index: 0, requestPath: "/api/profiles", reviewed: true, bodyHash: "fixture-hash", responseValue: { data: [{ name: "One", status: "active" }, { name: "Two", status: "disabled" }] }, materializedValue: [{ name: "One", status: "active" }, { name: "Two", status: "disabled" }] },
      confidence: "high", reviewReasons: [],
    }],
    candidates: [], responseFlows: [], unresolved: [],
    metrics: { componentsScanned: 1, importedApiCalls: 1, apiCandidates: 1, actualApiWrappers: 1, frameworkComposables: 0, localStateStoreHelpers: 0, utilityFunctions: 0, unresolvedLocalTransports: 0, responseFlows: 0, dynamicRouteFlows: 0, matchedEndpoints: 1, matchedFixtures: 1, materializedBindings: 1, renderedFields: 1, transportPrefixesInferred: 1, runtimeSelectionsInferred: 0, proxyRoutesInferred: 0, proxyTargetsInferred: 0, proxyRewriteRulesInferred: 0, proxyAstRoutesInferred: 0, proxyFallbackRoutesInferred: 0, proxyParseDiagnostics: 0 },
    reviewReasons: [],
  } as ApiFixtureResponsibilityGraph;
  const expected = buildDataSurfaceManifest({ components: [component], cardinality, api });
  const actual = await dataSurfaceManifestSkill.execute({ components: [component], cardinality, api });
  assert.deepEqual(actual, expected);
  assert.equal(actual.library.sourceRoot, "/tmp/library");
  assert.equal(actual.metrics.apiSurfaces, 1);
  assert.equal(actual.metrics.staticSurfaces, 1);
  assert.deepEqual(actual.surfaces.map((surface) => surface.id), ["api:api-fixture:profiles:listProfiles", "static:profiles:filters"]);
  const apiSurface = actual.surfaces[0];
  assert.equal(apiSurface?.shape.kind, "collection");
  assert.equal(apiSurface?.shape.cardinality, 1);
  assert.deepEqual(apiSurface?.fields.map((field) => field.path), ["name", "status"]);
  assert.equal(apiSurface?.source.static?.binding, "profiles");
  assert.equal(apiSurface?.source.stateInitial?.binding, "profiles");
  assert.equal(apiSurface?.injection.kind, "state-binding");
  const staticSurface = actual.surfaces[1];
  assert.equal(staticSurface?.references[0]?.target, "statuses.active");
  assert.equal(staticSurface?.references[0]?.resolved, true);
  assert.equal("entities" in actual, false);
  assert.equal(JSON.stringify(actual).includes("Fallback"), false);
  assert.equal(JSON.stringify(actual).includes('"Active"'), false);
  assert.equal(actual.reviewRequired, false);
  const delta = projectDataSurfaceManifestDelta(actual);
  assert.equal(delta.nodes[0]?.id, "data-surface:api:api-fixture:profiles:listProfiles");
  assert.equal(delta.edges.some((edge) => edge.from === "api-responsibility:api-fixture:profiles:listProfiles" && edge.relation === "materializes-data-surface"), true);

  const unlinkedFlow = buildDataSurfaceManifest({
    components: [component], cardinality,
    api: { ...api, responseFlows: [{ id: "flow:routes", apiLocalName: "getRoutes", exportedName: "getRoutes", importSource: "@/api/routes", apiModuleFile: "src/api/routes.ts", endpoint: { method: "GET", path: "/routes" }, consumerFile: "src/store/routes.ts", responseSymbol: "response", responsePath: "data", targetBinding: "routes", flowKind: "dynamic-route-injection", routeMutationEvidence: ["router.addRoute"], routeMutations: ["addRoute"], confidence: "high", reviewReasons: [] }] },
  });
  assert.equal(unlinkedFlow.reviewRequired, false);
  assert.equal(unlinkedFlow.unresolved.some((item) => item.reason.includes("has no reviewed fixture-backed data surface")), false);
  assert.equal(unlinkedFlow.review?.policyNotices.some((item) => item.reason.includes("project-level response flow")), true);
});

test("transport-proxy wrapper preserves scoped browser-prefix and upstream audit evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ui-dismantler-proxy-skill-"));
  await writeFile(join(directory, "vite.config.ts"), `import { defineConfig } from "vite"; export default defineConfig({ server: { proxy: { "/api": { target: "http://127.0.0.1:9000", changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, "") } } } });`, "utf8");
  const expected = analyzeTransportProxyResponsibilities(directory);
  const actual = await transportProxySkill.execute({ sourceRoot: directory });
  assert.deepEqual(actual, expected);
  assert.equal(transportProxySkill.manifest.qualityGates.includes("upstream-rewrite-audit-only"), true);
});

test("api-responsibility wrapper forwards reviewed config and visual owners without transforming output", async () => {
  const marker = { responsibilities: [], unresolved: [], marker: true } as unknown as ApiFixtureResponsibilityGraph;
  const config = { reference: { baseUrl: "http://reference.test" }, generated: { baseUrl: "http://generated.test" }, scenarios: [] } as unknown as SpaRouterContractConfig;
  const components: ApiResponsibilitySkillInput["components"] = [];
  const calls: unknown[] = [];
  const skill = createApiResponsibilitySkill((sourceRoot, receivedConfig, receivedComponents) => {
    calls.push({ sourceRoot, receivedConfig, receivedComponents });
    return marker;
  });
  const output = await skill.execute({ sourceRoot: "/tmp/spa-source", config, components });
  assert.equal(output, marker);
  assert.deepEqual(calls, [{ sourceRoot: "/tmp/spa-source", receivedConfig: config, receivedComponents: components }]);
  assert.deepEqual(skill.manifest.requires, ["source-structure", "component-ownership", "transport-proxy", "state-responsibility"]);
});

test("spa-router wrapper forwards config and returns the evaluator report by identity", async () => {
  const config = { reference: { baseUrl: "http://reference.test" }, generated: { baseUrl: "http://generated.test" }, scenarios: [] } as unknown as SpaRouterContractConfig;
  const report = { passed: true, marker: "existing-report" } as unknown as SpaRouterContractReport;
  const calls: unknown[] = [];
  const skill = createSpaRouterSkill(async (receivedConfig, options) => {
    calls.push({ receivedConfig, options });
    return report;
  });
  const output = await skill.execute({ config, options: { executablePath: "/tmp/chromium" } });
  assert.equal(output, report);
  assert.deepEqual(calls, [{ receivedConfig: config, options: { executablePath: "/tmp/chromium" } }]);
});

test("executeWithEvidence keeps execution evidence separate from raw output", async () => {
  const registry = new SkillRegistry();
  const output = { marker: "raw-output" };
  registry.register(defineSkill({
    manifest: {
      id: "evidence-probe", version: "1.0.0", contractVersion: "1.0", kind: "analysis", summary: "Evidence probe",
      stages: ["analyze"], consumes: ["probe-input"], produces: ["probe-output"], requires: [], optionalDependencies: [], qualityGates: ["probe-gate"], sideEffects: ["none"],
      optionalConsumes: [],
    },
    async execute() { return output; },
  }));
  const result = await registry.executeWithEvidence("evidence-probe", { input: true });
  assert.equal(result.output, output);
  assert.equal(result.evidence.status, "succeeded");
  assert.equal(result.evidence.skillId, "evidence-probe");
  assert.equal(result.evidence.schemaVersion, "1.0");
  assert.deepEqual(result.evidence.resolvedDependencies, []);
  assert.equal(result.evidence.error, undefined);
});

test("failed evidence execution throws an auditable SkillExecutionError", async () => {
  const registry = new SkillRegistry();
  registry.register(defineSkill({
    manifest: {
      id: "failure-probe", version: "1.0.0", contractVersion: "1.0", kind: "analysis", summary: "Failure probe",
      stages: ["analyze"], consumes: [], produces: [], requires: [], optionalDependencies: [], qualityGates: [], sideEffects: ["none"],
      optionalConsumes: [],
    },
    async execute(): Promise<never> { throw new Error("expected failure"); },
  }));
  await assert.rejects(
    () => registry.executeWithEvidence("failure-probe", {}),
    (error) => error instanceof SkillExecutionError
      && error.evidence.status === "failed"
      && error.evidence.error === "expected failure",
  );
});

test("Task Profile resolves required and reviewed optional Skills in dependency order", () => {
  const skills = createDefaultSkillRegistry();
  const profiles = createDefaultTaskProfileRegistry(skills);
  assert.deepEqual(profiles.list().map((profile) => profile.id), ["component-library", "data-backed-spa", "primitive-dom", "source-page", "spa-application"]);
  const primitiveProfile = profiles.resolve("primitive-dom");
  assert.deepEqual(primitiveProfile.skills.map((skill) => skill.id), ["source-structure", "component-ownership", "primitive-dom"]);
  assert.equal(primitiveProfile.qualityGates.includes("primitive-source-provenance"), true);
  const primitivePlan = new ProfileExecutionPlanner(profiles, createDefaultReviewedBindingRegistry(skills)).plan("primitive-dom", {
    inputProviders: [
      { contract: "html-path", providerId: "reviewed-html", reviewed: true },
      { contract: "project-source-root", providerId: "reviewed-source", reviewed: true },
    ],
  });
  assert.equal(primitivePlan.ready, true);
  const primitiveStep = primitivePlan.steps.find((step) => step.skillId === "primitive-dom");
  assert.equal(primitiveStep?.inputs.find((input) => input.contract === "sfc-visual-responsibility-graph" && input.binding?.inputPath === "graph")?.source, "artifact");
  const componentLibrary = profiles.resolve("component-library");
  assert.deepEqual(componentLibrary.skills.map((skill) => skill.id), ["component-library-validation"]);
  assert.equal(componentLibrary.qualityGates.includes("data-separation"), true);
  const componentPlan = new ProfileExecutionPlanner(profiles, createDefaultReviewedBindingRegistry(skills)).plan("component-library", {
    inputProviders: [{ contract: "component-library-root", providerId: "benchmark-library", reviewed: true }],
  });
  assert.equal(componentPlan.ready, true);
  assert.deepEqual(componentPlan.steps.map((step) => step.skillId), ["component-library-validation"]);
  const base = profiles.resolve("spa-application");
  assert.deepEqual(base.skills.map((skill) => skill.id), ["source-structure", "state-responsibility", "spa-router"]);
  const authenticated = profiles.resolve("spa-application", ["auth-guard"]);
  assert.deepEqual(authenticated.skills.map((skill) => skill.id), ["source-structure", "state-responsibility", "spa-router", "auth-guard"]);
  assert.equal(authenticated.qualityGates.includes("fresh-authentication-required"), true);
  const dataBacked = profiles.resolve("data-backed-spa");
  assert.deepEqual(dataBacked.skills.map((skill) => skill.id), ["source-structure", "component-ownership", "data-cardinality", "state-responsibility", "spa-router", "transport-proxy", "api-responsibility", "data-surface-manifest"]);
  assert.equal(dataBacked.qualityGates.includes("upstream-rewrite-audit-only"), true);
  assert.equal(dataBacked.qualityGates.includes("reviewed-fixture-only"), true);
  assert.equal(dataBacked.qualityGates.includes("cardinality-structural-evidence"), true);
  assert.equal(dataBacked.qualityGates.includes("manifest-consumer-separation"), true);
  const authenticatedData = profiles.resolve("data-backed-spa", ["auth-guard"]);
  assert.equal(authenticatedData.skills.at(-1)?.id, "auth-guard");
  assert.throws(() => profiles.resolve("spa-application", ["unknown-skill"]), /does not declare optional skill/);
});





test("Profile Execution Plan resolves reviewed providers and component-to-API artifact binding", () => {
  const skills = createDefaultSkillRegistry();
  const profiles = createDefaultTaskProfileRegistry(skills);
  const bindings = createDefaultReviewedBindingRegistry(skills);
  const planner = new ProfileExecutionPlanner(profiles, bindings);
  const plan = planner.plan("data-backed-spa", {
    inputProviders: [
      { contract: "html-path", providerId: "reference-html", reviewed: true },
      { contract: "project-source-root", providerId: "frozen-source", reviewed: true },
      { contract: "sfc-script-source", providerId: "reviewed-sfc-script", reviewed: true },
      { contract: "spa-router-contract-config", providerId: "frozen-spa-config", reviewed: true },
    ],
  });
  assert.equal(plan.ready, true);
  assert.deepEqual(plan.blockers, []);
  const source = plan.steps.find((step) => step.skillId === "source-structure");
  assert.equal(source?.inputs.find((input) => input.contract === "source-analysis-options")?.required, false);
  assert.equal(source?.inputs.find((input) => input.contract === "source-analysis-options")?.source, "missing");
  const api = plan.steps.find((step) => step.skillId === "api-responsibility");
  const componentBinding = api?.inputs.find((input) => input.contract === "sfc-visual-responsibility-graph");
  assert.equal(componentBinding?.source, "artifact");
  assert.equal(componentBinding?.binding?.outputPath, "components");
  const cardinality = plan.steps.find((step) => step.skillId === "data-cardinality");
  const cardinalityBinding = cardinality?.inputs.find((input) => input.contract === "sfc-visual-responsibility-graph");
  assert.equal(cardinalityBinding?.source, "artifact");
  assert.equal(cardinalityBinding?.binding?.outputPath, "components");
  const dataSurface = plan.steps.find((step) => step.skillId === "data-surface-manifest");
  assert.deepEqual(dataSurface?.inputs.map((input) => [input.contract, input.source]), [
    ["sfc-visual-responsibility-graph", "artifact"],
    ["data-cardinality-responsibility-graph", "artifact"],
    ["api-fixture-responsibility-graph", "artifact"],
  ]);
});

test("Profile Execution Plan blocks missing and unreviewed external inputs", () => {
  const skills = createDefaultSkillRegistry();
  const planner = new ProfileExecutionPlanner(createDefaultTaskProfileRegistry(skills), createDefaultReviewedBindingRegistry(skills));
  const plan = planner.plan("data-backed-spa", {
    inputProviders: [
      { contract: "html-path", providerId: "reference-html", reviewed: true },
      { contract: "project-source-root", providerId: "frozen-source", reviewed: true },
      { contract: "spa-router-contract-config", providerId: "draft-config", reviewed: false },
    ],
  });
  assert.equal(plan.ready, false);
  assert.equal(plan.blockers.includes("state-responsibility is missing input contract sfc-script-source"), true);
  assert.equal(plan.blockers.includes("spa-router has unreviewed input contract spa-router-contract-config"), true);
  assert.equal(plan.blockers.some((blocker) => blocker.includes("api-responsibility is blocked by dependency state-responsibility")), true);
});

test("Responsibility Graph Store blocks conflicting ownership nodes instead of overwriting them", () => {
  const store = new ResponsibilityGraphStore();
  const delta = (detail: string) => ({
    schemaVersion: "1.0" as const,
    skillId: "ownership-probe",
    sourceGraphKind: "probe-graph",
    nodes: [{ id: "component:shared", kind: "component-owner", attributes: { detail }, evidence: [], reviewRequired: false }],
    edges: [], unresolved: [], reviewRequired: false,
  });
  store.publish(delta("first"));
  store.publish(delta("second"));
  assert.throws(() => store.snapshot(), /conflicting responsibility node/);
});

test("Skill Registry rejects duplicates, missing dependencies, and dependency cycles", async () => {
  const registry = new SkillRegistry();
  const skillA = defineSkill({
    manifest: {
      id: "skill-a", version: "1.0.0", contractVersion: "1.0", kind: "analysis", summary: "A",
      stages: ["analyze"], consumes: [], produces: [], requires: ["skill-b"], optionalDependencies: [], qualityGates: [], sideEffects: ["none"],
      optionalConsumes: [],
    },
    async execute(input: string) { return input; },
  });
  const skillB = defineSkill({
    manifest: {
      id: "skill-b", version: "1.0.0", contractVersion: "1.0", kind: "analysis", summary: "B",
      stages: ["analyze"], consumes: [], produces: [], requires: ["skill-a"], optionalDependencies: [], qualityGates: [], sideEffects: ["none"],
      optionalConsumes: [],
    },
    async execute(input: string) { return input; },
  });
  registry.register(skillA);
  assert.throws(() => registry.register(skillA), /already registered/);
  assert.throws(() => registry.resolve(["skill-a"]), /unregistered skill: skill-b/);
  registry.register(skillB);
  assert.throws(() => registry.resolve(["skill-a"]), /dependency cycle/);
  await assert.rejects(() => registry.execute("missing-skill", {}), /unknown skill/);
});


test("Profile Executor runs reviewed providers artifacts evidence and responsibility deltas in dependency order", async () => {
  const skills = new SkillRegistry();
  const calls: string[] = [];
  skills.register(defineSkill({
    manifest: {
      id: "profile-source", version: "1.0.0", contractVersion: "1.0", kind: "analysis", summary: "Profile source",
      stages: ["analyze"], consumes: ["seed-input"], optionalConsumes: [], produces: ["seed-artifact"], requires: [], optionalDependencies: [], qualityGates: [], sideEffects: ["none"],
    },
    async execute(input: { seed: string }) { calls.push("profile-source"); return { value: input.seed }; },
    projectResponsibilityGraph(output: { value: string }) {
      return { schemaVersion: "1.0", skillId: "profile-source", sourceGraphKind: "profile-probe", nodes: [{ id: "probe:source", kind: "probe", attributes: { value: output.value }, evidence: [], reviewRequired: false }], edges: [], unresolved: [], reviewRequired: false };
    },
  }));
  skills.register(defineSkill({
    manifest: {
      id: "profile-consumer", version: "1.0.0", contractVersion: "1.0", kind: "analysis", summary: "Profile consumer",
      stages: ["analyze"], consumes: ["seed-artifact", "suffix-input"], optionalConsumes: [], produces: ["combined-artifact"], requires: ["profile-source"], optionalDependencies: [], qualityGates: [], sideEffects: ["none"],
    },
    async execute(input: { seed: { value: string }; suffix: string }) { calls.push("profile-consumer"); return `${input.seed.value}:${input.suffix}`; },
  }));
  const profiles = new TaskProfileRegistry(skills).register({
    id: "profile-probe", contractVersion: "1.0", summary: "Profile execution probe", requiredSkills: ["profile-consumer"], optionalSkills: [], qualityGates: [],
  });
  const bindings = new ReviewedBindingRegistry(skills).register({
    consumerSkillId: "profile-consumer", inputContract: "seed-artifact", inputPath: "seed", artifactContract: "seed-artifact", reviewed: true,
  });
  const report = await new ProfileExecutor(skills, profiles, bindings).execute("profile-probe", {
    inputProviders: [
      { contract: "seed-input", providerId: "reviewed-seed", reviewed: true, inputPath: "seed", value: "alpha" },
      { contract: "suffix-input", providerId: "reviewed-suffix", reviewed: true, inputPath: "suffix", value: "omega" },
    ],
  });
  assert.equal(report.status, "succeeded");
  assert.deepEqual(calls, ["profile-source", "profile-consumer"]);
  assert.deepEqual(report.steps.map((step) => step.status), ["succeeded", "succeeded"]);
  assert.equal(report.steps[0]?.evidence?.status, "succeeded");
  assert.equal(report.steps[1]?.output, "alpha:omega");
  assert.deepEqual(report.artifacts.map((artifact) => artifact.contract), ["seed-artifact", "combined-artifact"]);
  assert.equal(report.responsibilityDeltas[0]?.skillId, "profile-source");
  assert.equal(report.steps[0]?.graphDelta?.nodes[0]?.id, "probe:source");
});

test("Profile Executor blocks the complete run before side effects when required providers are unreviewed", async () => {
  const skills = new SkillRegistry();
  let executions = 0;
  skills.register(defineSkill({
    manifest: {
      id: "review-probe", version: "1.0.0", contractVersion: "1.0", kind: "analysis", summary: "Review probe",
      stages: ["analyze"], consumes: ["reviewed-input"], optionalConsumes: [], produces: ["reviewed-output"], requires: [], optionalDependencies: [], qualityGates: [], sideEffects: ["none"],
    },
    async execute() { executions += 1; return true; },
  }));
  const profiles = new TaskProfileRegistry(skills).register({
    id: "review-profile", contractVersion: "1.0", summary: "Review profile", requiredSkills: ["review-probe"], optionalSkills: [], qualityGates: [],
  });
  const report = await new ProfileExecutor(skills, profiles, new ReviewedBindingRegistry(skills)).execute("review-profile", {
    inputProviders: [{ contract: "reviewed-input", providerId: "draft", reviewed: false, inputPath: "value", value: "unsafe" }],
  });
  assert.equal(report.status, "blocked");
  assert.equal(executions, 0);
  assert.equal(report.steps[0]?.status, "blocked");
  assert.deepEqual(report.steps[0]?.blockedBy, ["unreviewed-input:reviewed-input"]);
  assert.equal(report.blockers.includes("review-probe has unreviewed input contract reviewed-input"), true);
});

test("Profile Executor records failed evidence and blocks downstream Skills", async () => {
  const skills = new SkillRegistry();
  let downstreamExecutions = 0;
  skills.register(defineSkill({
    manifest: {
      id: "successful-step", version: "1.0.0", contractVersion: "1.0", kind: "analysis", summary: "Successful step",
      stages: ["analyze"], consumes: [], optionalConsumes: [], produces: ["successful-output"], requires: [], optionalDependencies: [], qualityGates: [], sideEffects: ["none"],
    },
    async execute() { return { ok: true }; },
  }));
  skills.register(defineSkill({
    manifest: {
      id: "failing-step", version: "1.0.0", contractVersion: "1.0", kind: "analysis", summary: "Failing step",
      stages: ["analyze"], consumes: [], optionalConsumes: [], produces: ["failed-output"], requires: ["successful-step"], optionalDependencies: [], qualityGates: [], sideEffects: ["none"],
    },
    async execute(): Promise<never> { throw new Error("profile failure"); },
  }));
  skills.register(defineSkill({
    manifest: {
      id: "downstream-step", version: "1.0.0", contractVersion: "1.0", kind: "analysis", summary: "Downstream step",
      stages: ["analyze"], consumes: [], optionalConsumes: [], produces: [], requires: ["failing-step"], optionalDependencies: [], qualityGates: [], sideEffects: ["none"],
    },
    async execute() { downstreamExecutions += 1; return true; },
  }));
  const profiles = new TaskProfileRegistry(skills).register({
    id: "failure-profile", contractVersion: "1.0", summary: "Failure profile", requiredSkills: ["downstream-step"], optionalSkills: [], qualityGates: [],
  });
  const report = await new ProfileExecutor(skills, profiles, new ReviewedBindingRegistry(skills)).execute("failure-profile");
  assert.equal(report.status, "failed");
  assert.deepEqual(report.steps.map((step) => step.status), ["succeeded", "failed", "blocked"]);
  assert.equal(report.steps[1]?.evidence?.status, "failed");
  assert.equal(report.steps[1]?.error, "skill failing-step failed: profile failure");
  assert.deepEqual(report.steps[2]?.blockedBy, ["failed-skill:failing-step"]);
  assert.equal(downstreamExecutions, 0);
  assert.deepEqual(report.artifacts.map((artifact) => artifact.contract), ["successful-output"]);
});


test("Profile configuration is explicit and rejects ambiguous providers while preserving review state", () => {
  const config = parseProfileRunConfiguration({
    schemaVersion: "1.0",
    profileId: "source-page",
    enabledOptionalSkills: [],
    inputProviders: [{ contract: "html-path", providerId: "fixture", reviewed: true, inputPath: "htmlPath", value: "/tmp/page.html" }],
  });
  assert.equal(config.profileId, "source-page");
  assert.throws(() => parseProfileRunConfiguration({
    schemaVersion: "1.0", profileId: "source-page", inputProviders: [
      { contract: "html-path", providerId: "a", reviewed: true, inputPath: "htmlPath", value: "/tmp/a.html" },
      { contract: "html-path", providerId: "b", reviewed: true, inputPath: "htmlPath", value: "/tmp/b.html" },
    ],
  }), /duplicate contracts/);
  assert.throws(() => parseProfileRunConfiguration({
    schemaVersion: "1.0", profileId: "source-page", inputProviders: [
      { contract: "html-path", providerId: "draft", reviewed: false, inputPath: "htmlPath" },
    ],
  }), /value is required/);
});

test("component-library validation Skill and Profile CLI execute the reviewed package boundary", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "ui-dismantler-component-library-cli-"));
  context.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const inputPath = join(directory, "skill-input.json");
  const skillOutputPath = join(directory, "skill-output.json");
  const profilePath = join(directory, "profile.json");
  const planPath = join(directory, "plan.json");
  const reportPath = join(directory, "report.json");
  const libraryRoot = join(root, "benchmark/lib");
  await writeFile(inputPath, JSON.stringify({ libraryRoot }), "utf8");
  await writeFile(profilePath, JSON.stringify({
    schemaVersion: "1.0",
    profileId: "component-library",
    enabledOptionalSkills: [],
    inputProviders: [{ contract: "component-library-root", providerId: "benchmark-library", reviewed: true, inputPath: "libraryRoot", value: libraryRoot }],
  }), "utf8");
  execFileSync(process.execPath, ["dist-ts/cli.js", "skill-run", "component-library-validation", "--input", inputPath, "--out", skillOutputPath], { cwd: root, encoding: "utf8" });
  execFileSync(process.execPath, ["dist-ts/cli.js", "profile-plan", profilePath, "--out", planPath], { cwd: root, encoding: "utf8" });
  execFileSync(process.execPath, ["dist-ts/cli.js", "profile-run", profilePath, "--out", reportPath], { cwd: root, encoding: "utf8" });
  const skillOutput = JSON.parse(await readFile(skillOutputPath, "utf8")) as { ok: boolean; total: number };
  const plan = JSON.parse(await readFile(planPath, "utf8")) as { ready: boolean; steps: Array<{ skillId: string }> };
  const report = JSON.parse(await readFile(reportPath, "utf8")) as { status: string; steps: Array<{ status: string; output?: { ok?: boolean; total?: number } }> };
  assert.deepEqual(skillOutput, await componentLibraryValidationSkill.execute({ libraryRoot }));
  assert.equal(plan.ready, true);
  assert.deepEqual(plan.steps.map((step) => step.skillId), ["component-library-validation"]);
  assert.equal(report.status, "succeeded");
  assert.equal(report.steps[0]?.status, "succeeded");
  assert.equal(report.steps[0]?.output?.ok, true);
  assert.equal(report.steps[0]?.output?.total, 9);
});

test("primitive-dom Skill CLI preserves the reviewed compilation graph contract", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "ui-dismantler-primitive-dom-cli-"));
  context.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const structure = analyzeSfcTemplateStructure(`<template><el-form><el-input v-model="form.name"/><el-button @click="submit">Submit</el-button></el-form></template>`);
  const component = { id: "sfc:login", file: "src/Login.vue", componentName: "Login", templateStructure: structure, reviewReasons: [] };
  const inputPath = join(directory, "input.json");
  const outputPath = join(directory, "output.json");
  await writeFile(inputPath, JSON.stringify({ graph: { components: [component], reviewRequired: false, reviewReasons: [] } }), "utf8");
  execFileSync(process.execPath, ["dist-ts/cli.js", "skill-run", "primitive-dom", "--input", inputPath, "--out", outputPath], { cwd: root, encoding: "utf8" });
  const output = JSON.parse(await readFile(outputPath, "utf8")) as { kind: string; metrics: { components: number; compiledNodes: number }; components: Array<{ compilation: { nodes: unknown[]; interactions: Array<{ expression: string }> } }> };
  assert.equal(output.kind, "primitive-dom-compilation-graph");
  assert.equal(output.metrics.components, 1);
  assert.equal(output.metrics.compiledNodes, structure.nodes.length);
  assert.equal(output.components[0]?.compilation.interactions[0]?.expression, "submit");
});

test("primitive-dom Profile executes source ownership and reviewed artifact binding end to end", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "ui-dismantler-primitive-profile-cli-"));
  context.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const htmlPath = join(directory, "source.html");
  const sfcPath = join(directory, "Login.vue");
  const profilePath = join(directory, "profile.json");
  const planPath = join(directory, "plan.json");
  const reportPath = join(directory, "report.json");
  await writeFile(htmlPath, "<!doctype html><html lang=\"en\"><body><main><h1>Primitive profile</h1></main></body></html>", "utf8");
  await writeFile(sfcPath, `<template><el-form><el-input v-model=\"form.name\"/><el-button @click=\"submit\">Submit</el-button></el-form></template><script setup>const form = { name: \"\" }; function submit() { return form.name; }</script>`, "utf8");
  await writeFile(profilePath, JSON.stringify({
    schemaVersion: "1.0",
    profileId: "primitive-dom",
    enabledOptionalSkills: [],
    inputProviders: [
      { contract: "html-path", providerId: "reviewed-html", reviewed: true, inputPath: "htmlPath", value: htmlPath },
      { contract: "project-source-root", providerId: "reviewed-source", reviewed: true, inputPath: "sourceRoot", value: directory },
    ],
  }), "utf8");
  execFileSync(process.execPath, ["dist-ts/cli.js", "profile-plan", profilePath, "--out", planPath], { cwd: root, encoding: "utf8" });
  execFileSync(process.execPath, ["dist-ts/cli.js", "profile-run", profilePath, "--out", reportPath], { cwd: root, encoding: "utf8" });
  const plan = JSON.parse(await readFile(planPath, "utf8")) as { ready: boolean; steps: Array<{ skillId: string }> };
  const report = JSON.parse(await readFile(reportPath, "utf8")) as { status: string; steps: Array<{ skillId: string; status: string; output?: { kind?: string; components?: unknown[] } }> };
  assert.equal(plan.ready, true);
  assert.deepEqual(plan.steps.map((step) => step.skillId), ["source-structure", "component-ownership", "primitive-dom"]);
  assert.equal(report.status, "succeeded");
  assert.deepEqual(report.steps.map((step) => step.status), ["succeeded", "succeeded", "succeeded"]);
  assert.equal(report.steps[2]?.output?.kind, "primitive-dom-compilation-graph");
  assert.equal(report.steps[2]?.output?.components?.length, 1);
});

test("profile-plan and profile-run CLI execute the reviewed source profile without changing source output", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "ui-dismantler-profile-cli-"));
  context.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const htmlPath = join(directory, "source.html");
  const configPath = join(directory, "profile.json");
  const planPath = join(directory, "plan.json");
  const reportPath = join(directory, "report.json");
  const skillCatalogPath = join(directory, "skills.json");
  const profileCatalogPath = join(directory, "profiles.json");
  const skillInputPath = join(directory, "skill-input.json");
  const skillOutputPath = join(directory, "skill-output.json");
  const skillEvidencePath = join(directory, "skill-evidence.json");
  await writeFile(htmlPath, "<!doctype html><html><body><main><h1>Profile CLI</h1></main></body></html>", "utf8");
  await writeFile(configPath, JSON.stringify({
    schemaVersion: "1.0",
    profileId: "source-page",
    enabledOptionalSkills: [],
    inputProviders: [{ contract: "html-path", providerId: "reviewed-source", reviewed: true, inputPath: "htmlPath", value: htmlPath }],
  }), "utf8");
  await writeFile(skillInputPath, JSON.stringify({ htmlPath }), "utf8");
  execFileSync(process.execPath, ["dist-ts/cli.js", "skill-list", "--out", skillCatalogPath], { cwd: root, encoding: "utf8" });
  execFileSync(process.execPath, ["dist-ts/cli.js", "profile-list", "--out", profileCatalogPath], { cwd: root, encoding: "utf8" });
  execFileSync(process.execPath, ["dist-ts/cli.js", "skill-run", "source-structure", "--input", skillInputPath, "--out", skillOutputPath, "--evidence-out", skillEvidencePath], { cwd: root, encoding: "utf8" });
  execFileSync(process.execPath, ["dist-ts/cli.js", "profile-plan", configPath, "--out", planPath], { cwd: root, encoding: "utf8" });
  execFileSync(process.execPath, ["dist-ts/cli.js", "profile-run", configPath, "--out", reportPath], { cwd: root, encoding: "utf8" });
  const skillCatalog = JSON.parse(await readFile(skillCatalogPath, "utf8")) as { kind: string; skills: Array<{ id: string }> };
  const profileCatalog = JSON.parse(await readFile(profileCatalogPath, "utf8")) as { kind: string; profiles: Array<{ id: string }> };
  const skillOutput = JSON.parse(await readFile(skillOutputPath, "utf8")) as { schemaVersion?: string };
  const skillEvidence = JSON.parse(await readFile(skillEvidencePath, "utf8")) as { status: string; skillId: string };
  const plan = JSON.parse(await readFile(planPath, "utf8")) as { ready: boolean; profileId: string; steps: Array<{ skillId: string }> };
  const report = JSON.parse(await readFile(reportPath, "utf8")) as { status: string; profileId: string; steps: Array<{ status: string; output?: { schemaVersion?: string } }> };
  assert.equal(skillCatalog.kind, "skill-catalog");
  assert.equal(skillCatalog.skills.some((skill) => skill.id === "source-structure"), true);
  assert.equal(profileCatalog.kind, "profile-catalog");
  assert.equal(profileCatalog.profiles.some((profile) => profile.id === "source-page"), true);
  assert.equal(skillOutput.schemaVersion, "1.0");
  assert.equal(skillEvidence.status, "succeeded");
  assert.equal(skillEvidence.skillId, "source-structure");
  assert.equal(plan.ready, true);
  assert.equal(plan.profileId, "source-page");
  assert.deepEqual(plan.steps.map((step) => step.skillId), ["source-structure"]);
  assert.equal(report.status, "succeeded");
  assert.equal(report.profileId, "source-page");
  assert.equal(report.steps[0]?.status, "succeeded");
  assert.equal(report.steps[0]?.output?.schemaVersion, "1.0");
});
