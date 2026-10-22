import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeHtml } from "../analysis/analyzer.js";
import { planComponents } from "../planning/components.js";

async function manifestFor(html: string) {
  const directory = await mkdtemp(join(tmpdir(), "ui-dismantler-unmodeled-"));
  const path = join(directory, "page.html");
  await writeFile(path, html, "utf8");
  return analyzeHtml(path);
}

test("canvas and iframe regions are annotated as unmodeled behaviors instead of vanishing", async () => {
  const manifest = await manifestFor(`<!doctype html><html lang="en"><body><main>
    <section><h1>Demo page</h1><canvas id="life" width="200" height="100"></canvas>
    <iframe id="scene" src="https://example.com/scene"></iframe>
    <iframe srcdoc="<p>nested</p>"></iframe></section></main></body></html>`);
  const behaviors = manifest.structure.unmodeledBehaviors ?? [];
  assert.equal(behaviors.length, 3);
  assert.deepEqual(behaviors.map((item) => item.kind), ["canvas", "iframe", "iframe"]);
  assert.equal(behaviors[0].selector, "#life");
  assert.equal(behaviors[1].source, "https://example.com/scene");
  assert.equal(behaviors[2].source, "srcdoc");
  assert.ok(manifest.warnings.some((warning) => /3 处脚本驱动行为区域/.test(warning)), manifest.warnings.join(" | "));
});

test("pages without script-driven regions keep the field absent for byte-stable manifests", async () => {
  const manifest = await manifestFor(`<!doctype html><html lang="en"><body><main><h1>Plain</h1><p>No canvas here.</p></main></body></html>`);
  assert.equal(manifest.structure.unmodeledBehaviors, undefined);
  assert.equal("unmodeledBehaviors" in manifest.structure, false);
});

test("planning surfaces unmodeled behaviors as a warning without blocking readiness", async () => {
  const manifest = await manifestFor(`<!doctype html><html lang="en"><head><style>:root{--brand:#123456}body{margin:0}</style></head><body>
    <div class="app">
      <div class="site-nav"><a href="/one">Enterprise</a><a href="/two">Docs</a><a href="/three">Pricing</a></div>
      <div class="content">
        <div class="block"><div class="head"><h2>Research direction</h2></div><div class="copy"><p>${"Copy for the section body. ".repeat(30)}</p><canvas id="demo"></canvas></div></div>
        <div class="block"><div class="head"><h2>Pricing that scales</h2></div><div class="copy"><p>${"More copy for the second section. ".repeat(30)}</p></div></div>
      </div>
      <div class="site-foot"><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div>
    </div></body></html>`);
  const plan = planComponents(manifest);
  assert.equal(plan.summary.unmodeledBehaviors, 1);
  assert.ok(plan.issues.some((issue) => issue.code === "unmodeled-behaviors" && issue.severity === "warning"));
  assert.equal(plan.summary.ready, true);
});

test("event-listener interactions count toward unowned instead of being silently excluded", async () => {
  // Structured page: interactions outside every view must surface as unowned even
  // when they come from the event-listener (malformed script fallback) channel.
  const filler = "This paragraph carries enough visible copy for the section to count. ".repeat(14);
  const manifest = await manifestFor(`<!doctype html><html lang="en"><head><style>:root{--b:#123}</style></head><body>
    <div class="app">
      <div class="site-nav"><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a></div>
      <div class="content">
        <div class="block"><div class="head"><h2>First section</h2></div><div class="copy"><p>${filler}</p></div></div>
        <div class="block"><div class="head"><h2>Second section</h2></div><div class="copy"><p>${filler}</p><button id="go">Go</button></div></div>
        <div class="block"><div class="head"><h2>Third section</h2></div><div class="copy"><p>${filler}</p></div></div>
      </div>
      <div class="site-foot"><a href="/t">Terms</a><a href="/p">Privacy</a></div>
    </div></body></html>`);
  const baseline = planComponents(manifest, { lineBudget: 1000 });
  assert.equal(baseline.summary.unownedInteractions, 0, JSON.stringify(baseline.issues));
  manifest.interactions.push({
    trigger: "event-listener", event: "click", action: "unresolved listener from malformed script",
    source: "event-listener", analysis: "regex", confidence: 0.25,
    fingerprint: "click|event-listener|outside-all-views", responsibility: "user-action",
  });
  const plan = planComponents(manifest, { lineBudget: 1000 });
  assert.equal(plan.summary.unownedInteractions, 1);
  assert.equal(plan.summary.ready, false);
  assert.ok(plan.issues.some((issue) => issue.code === "unowned-interactions"));
});
