import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  analyzeLifecyclePollingResponsibilities,
  linkLifecyclePollingResponsibilities,
  type LifecyclePollingResponsibilityGraph,
} from "../planning/lifecycle-polling-responsibility.js";
import type { ApiFixtureResponsibilityGraph } from "../planning/api-fixture-responsibility.js";
import type { RouterSfcResponsibilityGraph } from "../planning/router-sfc-responsibility.js";
import type { SfcVisualResponsibilityGraph } from "../planning/sfc-visual-responsibility.js";
import { createLifecyclePollingSkill, projectLifecyclePollingDelta } from "../skills/lifecycle-polling.js";

const repositoryRoot = new URL("../../", import.meta.url).pathname;

function graphFor(root: string, files: Array<{ id: string; file: string; name: string }>): SfcVisualResponsibilityGraph {
  return {
    sourceRoot: root,
    components: files.map((item) => ({ id: item.id, file: item.file, componentName: item.name })),
  } as SfcVisualResponsibilityGraph;
}

test("lifecycle polling analysis links composition hooks interval callbacks terminal stop and cleanup", async (context) => {
  const root = mkdtempSync(join("/tmp", "ui-dismantler-lifecycle-composition-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "Progress.vue"), `<template><main>Progress</main></template><script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
const POLL_MS: number = 2000
let timer: ReturnType<typeof setInterval> | undefined
async function poll() {
  const response = await getStatus(taskId)
  if (response.data.status === 'completed') {
    clearInterval(timer)
    router.push('/review/' + taskId)
  }
}
function startPolling() {
  poll()
  timer = window.setInterval(poll, POLL_MS)
}
onMounted(startPolling)
onUnmounted(() => clearInterval(timer))
</script>`, "utf8");
  const graph = analyzeLifecyclePollingResponsibilities(graphFor(root, [{ id: "component:progress", file: "Progress.vue", name: "GenerationProgress" }]));
  assert.equal(graph.metrics.components, 1);
  assert.equal(graph.metrics.intervals, 1);
  assert.equal(graph.metrics.timersWithLifecycleCleanup, 1);
  assert.equal(graph.metrics.timersWithTerminalStop, 1);
  const component = graph.components[0];
  const timer = component.timers[0];
  assert.equal(component.parseMode, "typescript-erasure");
  assert.equal(timer.kind, "interval");
  assert.equal(timer.handle, "timer");
  assert.equal(timer.intervalMs, 2000);
  assert.deepEqual(timer.startHooks, ["mounted"]);
  assert.deepEqual(timer.cleanupHooks, ["unmounted"]);
  assert.equal(timer.terminalStopProven, true);
  assert.equal(timer.callbackCalls.includes("getStatus"), true);
  assert.equal(timer.callbackCalls.includes("router.push"), true);
  assert.equal(timer.routeTransitions.length, 1);
  assert.equal(timer.routeTransitions[0]?.resolution, "unreviewed");
  assert.equal(timer.reviewReasons.includes("route transition requires reviewed Router-to-SFC ownership"), true);
  assert.equal(component.hooks.find((hook) => hook.hook === "mounted")?.reachableFunctions.includes("poll"), true);
  assert.equal(graph.metrics.unresolved, 1);
  assert.equal(graph.metrics.reviewReasons, 1);
  assert.equal(component.reviewReasons.length, 1);
  assert.equal(graph.reviewRequired, true, "TypeScript erasure remains explicit review evidence");

  const delta = projectLifecyclePollingDelta(graph);
  assert.equal(delta.nodes[0]?.kind, "lifecycle-timer");
  assert.equal(delta.edges[0]?.relation, "owns-lifecycle-timer");
  assert.equal(delta.nodes[0]?.attributes.intervalMs, 2000);

  const skill = createLifecyclePollingSkill(() => graph);
  const result = await skill.execute({ graph: graphFor(root, []) });
  assert.strictEqual(result, graph);
  assert.equal(skill.manifest.requires.includes("component-ownership"), true);
});


function reviewedApiGraph(sourceRoot: string): ApiFixtureResponsibilityGraph {
  return {
    schemaVersion: "1.0",
    kind: "api-fixture-responsibility-graph",
    reviewRequired: true,
    sourceRoot,
    responsibilities: [{
      id: "api-fixture:progress:getStatus",
      componentId: "component:progress",
      componentName: "GenerationProgress",
      componentFile: "Progress.vue",
      apiCall: {
        localName: "getStatus",
        exportedName: "getStatus",
        importSource: "./api",
        moduleFile: "api.ts",
        method: "GET",
        path: "/tasks/:taskId/status",
        transportPrefixes: [],
        transportPathCandidates: [],
        runtimeSelections: [],
        proxyRoutes: [],
      },
      consumption: { targetBinding: "status", responsePath: "data" },
      renderedFields: [],
      filterValueMaps: {},
      fixture: {
        index: 0,
        requestPath: "/tasks/:taskId/status",
        reviewed: true,
        bodyHash: "reviewed-status-fixture",
        responseValue: { data: { status: "completed" } },
        materializedValue: { status: "completed" },
      },
      confidence: "high",
      reviewReasons: [],
    }],
    candidates: [],
    responseFlows: [],
    unresolved: [],
    metrics: {
      componentsScanned: 1,
      importedApiCalls: 1,
      apiCandidates: 1,
      actualApiWrappers: 1,
      frameworkComposables: 0,
      localStateStoreHelpers: 0,
      utilityFunctions: 0,
      unresolvedLocalTransports: 0,
      responseFlows: 0,
      dynamicRouteFlows: 0,
      matchedEndpoints: 1,
      matchedFixtures: 1,
      materializedBindings: 1,
      renderedFields: 0,
      transportPrefixesInferred: 0,
      runtimeSelectionsInferred: 0,
      proxyRoutesInferred: 0,
      proxyTargetsInferred: 0,
      proxyRewriteRulesInferred: 0,
      proxyAstRoutesInferred: 0,
      proxyFallbackRoutesInferred: 0,
      proxyParseDiagnostics: 0,
    },
    reviewReasons: [],
  };
}

function reviewedRouterGraph(sourceRoot: string): RouterSfcResponsibilityGraph {
  return {
    schemaVersion: "1.0",
    kind: "router-to-sfc-responsibility-graph",
    reviewRequired: true,
    sourceRoot,
    framework: { view: "vue", router: "vue-router", routerMajor: 4 },
    routes: [{
      path: "/review/:taskId",
      recordPath: "/review/:taskId",
      name: "review",
      routeFile: "router.ts",
      routeRecords: ["router.ts"],
      parentPath: null,
      layoutChain: [],
      routeKind: "visual-leaf",
      ownershipRoles: ["visual-leaf"],
      parentOnly: false,
      visualOwnerProven: true,
      componentExpression: "Review",
      resolution: "static-import",
      importBinding: "Review",
      sfcFile: "Review.vue",
      dynamic: true,
      confidence: "high",
      evidence: [],
      reviewReasons: [],
    }],
    unresolved: [],
    metrics: {
      filesScanned: 1,
      routerFiles: 1,
      routeBindings: 1,
      resolvedRoutes: 1,
      dynamicImports: 0,
      unresolvedRoutes: 0,
      routeGroups: 0,
      redirectOnlyParents: 0,
      layoutOwners: 0,
      visualLeaves: 1,
      evidenceCount: 0,
      scanMs: 0,
    },
    reviewReasons: [],
  };
}

test("lifecycle linker resolves reviewed API calls and dynamic route transitions", (context) => {
  const root = mkdtempSync(join("/tmp", "ui-dismantler-lifecycle-linker-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "Progress.vue"), `<script setup>
function poll() {
  const response = getStatus(taskId)
  if (response.data.status === "completed") router.push("/review/" + taskId)
}
let timer
onMounted(() => { timer = setInterval(poll, 2000) })
onUnmounted(() => clearInterval(timer))
</script>`, "utf8");
  const analyzed = analyzeLifecyclePollingResponsibilities(graphFor(root, [{ id: "component:progress", file: "Progress.vue", name: "GenerationProgress" }]));
  const linked = linkLifecyclePollingResponsibilities(analyzed, {
    api: reviewedApiGraph(root),
    router: reviewedRouterGraph(root),
  });
  const timer = linked.components[0]?.timers[0];
  assert.equal(linked.metrics.apiLinks, 1);
  assert.equal(linked.metrics.routeTransitions, 1);
  assert.equal(linked.metrics.resolvedRouteTransitions, 1);
  assert.equal(linked.metrics.unresolvedLinks, 0);
  assert.equal(timer?.apiResponsibilities[0]?.path, "/tasks/:taskId/status");
  assert.equal(timer?.apiResponsibilities[0]?.confidence, "high");
  assert.equal(timer?.routeTransitions[0]?.resolution, "resolved");
  assert.equal(timer?.routeTransitions[0]?.matchedRoutePath, "/review/:taskId");
  assert.equal(timer?.routeTransitions[0]?.matchedSfcFile, "Review.vue");
  assert.deepEqual(timer?.reviewReasons, []);
  assert.equal(linked.reviewRequired, false);
});

test("lifecycle polling analysis supports Options API methods and fails closed without cleanup", (context) => {
  const root = mkdtempSync(join("/tmp", "ui-dismantler-lifecycle-options-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "Reviewed.vue"), `<script>
export default {
  methods: {
    poll() { return fetchStatus(this.taskId) },
    startPolling() { this.timer = setInterval(this.poll, 1500) }
  },
  mounted() { this.startPolling() },
  beforeUnmount() { clearInterval(this.timer) }
}
</script>`, "utf8");
  writeFileSync(join(root, "Leaking.vue"), `<script setup>
const delay = resolveDelay()
function poll() { fetchStatus() }
onMounted(() => { setInterval(poll, delay) })
</script>`, "utf8");
  const graph = analyzeLifecyclePollingResponsibilities(graphFor(root, [
    { id: "component:reviewed", file: "Reviewed.vue", name: "ReviewedPolling" },
    { id: "component:leaking", file: "Leaking.vue", name: "LeakingPolling" },
  ]));
  const reviewed = graph.components.find((component) => component.componentId === "component:reviewed")!;
  assert.equal(reviewed.reviewRequired, false);
  assert.equal(reviewed.timers[0]?.handle, "timer");
  assert.deepEqual(reviewed.timers[0]?.startHooks, ["mounted"]);
  assert.deepEqual(reviewed.timers[0]?.cleanupHooks, ["before-unmount"]);
  assert.equal(reviewed.timers[0]?.callbackCalls.includes("fetchStatus"), true);

  const leaking = graph.components.find((component) => component.componentId === "component:leaking")!;
  assert.equal(leaking.reviewRequired, true);
  assert.equal(leaking.timers[0]?.intervalMs, null);
  assert.equal(leaking.timers[0]?.reviewReasons.includes("polling timer has no lifecycle cleanup responsibility"), true);
  assert.equal(leaking.timers[0]?.reviewReasons.includes("polling timer handle/control ownership is unresolved"), true);
  assert.equal(graph.metrics.unresolved >= 3, true);
});

test("lifecycle polling analysis records missing source and parse failures as blockers", () => {
  const root = mkdtempSync(join("/tmp", "ui-dismantler-lifecycle-failure-"));
  try {
    writeFileSync(join(root, "Broken.vue"), `<script>onMounted(() => { setInterval(, 1000) })</script>`, "utf8");
    const graph: LifecyclePollingResponsibilityGraph = analyzeLifecyclePollingResponsibilities(graphFor(root, [
      { id: "component:missing", file: "Missing.vue", name: "Missing" },
      { id: "component:broken", file: "Broken.vue", name: "Broken" },
    ]));
    assert.equal(graph.components.every((component) => component.reviewRequired), true);
    assert.equal(graph.components.find((component) => component.componentId === "component:missing")?.unresolved.includes("component source file is unavailable"), true);
    assert.equal(graph.components.find((component) => component.componentId === "component:broken")?.parseMode, "failed");
    assert.equal(graph.reviewRequired, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lifecycle-polling Skill runs through the generic CLI registry without case configuration", (context) => {
  const root = mkdtempSync(join("/tmp", "ui-dismantler-lifecycle-cli-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "Polling.vue"), `<script setup>
let handle
function refresh() { requestStatus() }
onMounted(() => { handle = setInterval(refresh, 750) })
onUnmounted(() => clearInterval(handle))
</script>`, "utf8");
  const inputPath = join(root, "input.json");
  const outputPath = join(root, "output.json");
  writeFileSync(inputPath, JSON.stringify({ graph: graphFor(root, [{ id: "component:polling", file: "Polling.vue", name: "Polling" }]) }), "utf8");
  execFileSync(process.execPath, ["dist-ts/cli.js", "skill-run", "lifecycle-polling", "--input", inputPath, "--out", outputPath], { cwd: repositoryRoot, encoding: "utf8" });
  const output = JSON.parse(readFileSync(outputPath, "utf8")) as LifecyclePollingResponsibilityGraph;
  assert.equal(output.kind, "lifecycle-polling-responsibility-graph");
  assert.equal(output.components[0]?.timers[0]?.intervalMs, 750);
  assert.deepEqual(output.components[0]?.timers[0]?.cleanupHooks, ["unmounted"]);
  assert.equal(output.reviewRequired, false);
});
