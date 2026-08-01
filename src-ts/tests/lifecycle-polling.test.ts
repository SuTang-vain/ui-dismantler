import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  analyzeLifecyclePollingResponsibilities,
  type LifecyclePollingResponsibilityGraph,
} from "../planning/lifecycle-polling-responsibility.js";
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
  assert.equal(timer.reviewReasons.length, 0);
  assert.equal(component.hooks.find((hook) => hook.hook === "mounted")?.reachableFunctions.includes("poll"), true);
  assert.equal(graph.metrics.unresolved, 0);
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
