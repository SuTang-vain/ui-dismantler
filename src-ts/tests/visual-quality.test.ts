import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { after, test } from "node:test";
import { evaluateBrowserQuality, evaluateBrowserQualityMatrix, evaluateBrowserQualitySuite, evaluateLibrarySelectorCoverage, evaluateScenarioBrowserQualityMatrix } from "../evaluation/browser.js";
import { evaluateRoundtrip } from "../evaluation/roundtrip.js";
import { appendRuntimeSelectorCheck, validateLibrary } from "../validation/library.js";

const tempRoots: string[] = [];
after(async () => { await Promise.all(tempRoots.map((path) => rm(path, { recursive: true, force: true }))); });

async function fixture(name: string, original: string, css: string, js: string): Promise<{ root: string; original: string; lib: string }> {
  const root = await mkdtemp(join(tmpdir(), `ui-dismantler-${name}-`));
  tempRoots.push(root);
  const lib = join(root, "lib");
  await Promise.all([mkdir(join(lib, "src"), { recursive: true }), mkdir(join(lib, "examples"), { recursive: true }), mkdir(join(lib, "docs"), { recursive: true })]);
  await Promise.all([
    writeFile(join(root, "original.html"), original),
    writeFile(join(lib, "src", "fixture.css"), css),
    writeFile(join(lib, "src", "fixture.js"), js),
    writeFile(join(lib, "examples", "case.html"), `<!doctype html><html lang="zh-CN"><head><link rel="stylesheet" href="../src/fixture.css"></head><body><div id="mount"></div><script src="../src/fixture.js"></script><script>Fixture.mount(document.getElementById('mount'));</script></body></html>`),
    writeFile(join(lib, "README.md"), "# Fixture\n\n`Fixture.mount(element, options)`"),
    writeFile(join(lib, "docs", "设计规范.md"), "# 设计规范\n\n## 主题色"),
  ]);
  return { root, original: join(root, "original.html"), lib };
}

const baseVars = `:root{--sg-primary:#e11d48;--sg-ink:#111827;--sg-muted:#6b7280;--sg-line:#d1d5db;--sg-paper:#fff}`;
const media = `@media(max-width:500px){.sg-item{width:80px}}@media(max-width:320px){.sg-item{width:60px}}`;

test("runtime selector gate catches ID/class translation mismatch hidden from DOM roundtrip", async () => {
  const item = await fixture(
    "selector",
    `<!doctype html><html><head><style>body{margin:0}.app-container{display:flex;width:420px;height:240px;background:#e11d48}.item{width:200px;height:200px;margin:10px;background:#fff}</style></head><body><div class="app-container"><div class="item">A</div><div class="item">B</div></div></body></html>`,
    `${baseVars}body{margin:0}#sg-container{display:flex;width:420px;height:240px;background:var(--sg-primary)}.sg-item{width:200px;height:200px;margin:10px;background:var(--sg-paper)}${media}`,
    `(function(global){function mount(root){root.innerHTML='<div class="sg-app-container"><div class="sg-item">A</div><div class="sg-item">B</div></div>'}global.Fixture={mount:mount};})(window);`,
  );
  const dom = await evaluateRoundtrip(item.original, item.lib);
  assert.equal(dom.score?.overall, 1, "DOM topology/text gate should reproduce the historical false green");
  const browser = await evaluateBrowserQuality(item.original, item.lib);
  assert.equal(browser.available, true);
  assert.equal(browser.passed, false);
  assert.ok(browser.selectorCoverage?.unmatchedClasses.some((issue) => issue.selector === ".sg-app-container"));
  assert.ok(browser.selectorCoverage?.mismatchHints.some((hint) => hint.cssSelector === "#sg-container"));
  assert.ok((browser.pixels?.diffRate ?? 0) > 0.02);

  const runtime = await evaluateLibrarySelectorCoverage(item.lib);
  const report = appendRuntimeSelectorCheck(validateLibrary(item.lib), runtime.coverage ?? null);
  const selectorGate = report.results.find((result) => result.id === "selector-runtime");
  assert.equal(report.total, 10);
  assert.equal(selectorGate?.passed, false);
});

test("computed style and pixel gates catch execution-order position errors with identical DOM", async () => {
  const item = await fixture(
    "order",
    `<!doctype html><html><head><style>body{margin:0}.stage{position:relative;width:500px;height:260px;background:#fff}.node{position:absolute;left:40px;top:60px;width:120px;height:120px;background:#e11d48}</style></head><body><div class="stage"><div class="node">Node</div></div></body></html>`,
    `${baseVars}body{margin:0}.sg-stage{position:relative;width:500px;height:260px;background:var(--sg-paper)}.sg-node{position:absolute;width:120px;height:120px;background:var(--sg-primary)}${media}`,
    `(function(global){function mount(root){var stage=document.createElement('div');stage.className='sg-stage';var node=document.createElement('div');node.className='sg-node';node.textContent='Node';var scale=1;node.style.left=(40*scale)+'px';node.style.top='60px';scale=4;stage.appendChild(node);root.appendChild(stage)}global.Fixture={mount:mount};})(window);`,
  );
  // Simulate the wrong init order by changing the rendered position after structure creation.
  await writeFile(join(item.lib, "src", "fixture.js"), `(function(global){function mount(root){var stage=document.createElement('div');stage.className='sg-stage';var node=document.createElement('div');node.className='sg-node';node.textContent='Node';var scale=4;node.style.left=(40*scale)+'px';node.style.top='60px';stage.appendChild(node);root.appendChild(stage)}global.Fixture={mount:mount};})(window);`);
  const dom = await evaluateRoundtrip(item.original, item.lib);
  assert.equal(dom.score?.overall, 1, "inline left/top differences are intentionally invisible to the legacy DOM score");
  const browser = await evaluateBrowserQuality(item.original, item.lib);
  assert.equal(browser.selectorCoverage?.passed, true);
  assert.equal(browser.passed, false);
  assert.ok(browser.styles?.mismatches.some((issue) => issue.property === "left" || issue.property === "rect.x"));
  assert.ok((browser.pixels?.diffRate ?? 0) > 0.02);
});


test("multi-viewport matrix catches a mobile-only visual regression", async () => {
  const item = await fixture(
    "viewport-matrix",
    `<!doctype html><html><head><style>body{margin:0}.app{display:flex;width:420px;height:240px;background:#e11d48}.item{width:200px;height:200px;margin:10px;background:#fff}@media(max-width:500px){.item{width:80px}}</style></head><body><div class="app"><div class="item">A</div><div class="item">B</div></div></body></html>`,
    `${baseVars}body{margin:0}.sg-app{display:flex;width:420px;height:240px;background:var(--sg-primary)}.sg-item{width:200px;height:200px;margin:10px;background:var(--sg-paper)}@media(max-width:500px){.sg-item{width:140px}}@media(max-width:320px){.sg-item{width:60px}}`,
    `(function(global){function mount(root){root.innerHTML='<div class="sg-app"><div class="sg-item">A</div><div class="sg-item">B</div></div>'}global.Fixture={mount:mount};})(window);`,
  );
  const result = await evaluateBrowserQualityMatrix(item.original, item.lib, {
    viewports: [
      { id: "desktop", label: "Desktop", width: 1024, height: 768 },
      { id: "mobile", label: "Mobile", width: 390, height: 844 },
    ],
  });
  assert.equal(result.matrix.viewports.length, 2);
  assert.equal(result.matrix.viewports.find((viewport) => viewport.id === "desktop")?.passed, true);
  assert.equal(result.matrix.viewports.find((viewport) => viewport.id === "mobile")?.passed, false);
  assert.equal(result.matrix.passed, false);
  assert.equal(result.matrix.worstViewport, "mobile");
  assert.ok(result.matrix.worstPixelDiff > 0.02);
});


test("critical interaction matrix compares computed style after opening a panel", async () => {
  const item = await fixture(
    "interaction-viewport-matrix",
    `<!doctype html><html><head><style>body{margin:0}.app{width:320px;height:240px;background:#fff}.panel{display:none;height:100px;background:#e11d48}.app.open .panel{display:block;width:120px}@media(max-width:500px){.app.open .panel{width:80px}}</style></head><body><div class="app"><button id="open">Open</button><div class="panel">Panel</div></div><script>document.getElementById('open').onclick=()=>document.querySelector('.app').classList.add('open')</script></body></html>`,
    `${baseVars}body{margin:0}.sg-app{width:320px;height:240px;background:var(--sg-paper)}.sg-panel{display:none;height:100px;background:var(--sg-primary)}.sg-app.sg-open .sg-panel{display:block;width:120px}@media(max-width:500px){.sg-app.sg-open .sg-panel{width:180px}}@media(max-width:320px){.sg-app.sg-open .sg-panel{width:180px}}`,
    `(function(global){function mount(root){root.innerHTML='<div class="sg-app"><button id="sg-open">Open</button><div class="sg-panel">Panel</div></div>';document.getElementById('sg-open').onclick=function(){root.querySelector('.sg-app').classList.add('sg-open')}}global.Fixture={mount:mount};})(window);`,
  );
  const scenario = {
    id: "open-panel",
    critical: true,
    steps: [{ action: "click" as const, target: { reference: "#open", library: "#sg-open" } }],
    assertions: [{ target: { reference: ".panel", library: ".sg-panel" }, visible: true }],
  };
  const result = await evaluateScenarioBrowserQualityMatrix(item.original, item.lib, scenario, {
    viewports: [
      { id: "desktop", label: "Desktop", width: 1024, height: 768 },
      { id: "mobile", label: "Mobile", width: 390, height: 844 },
    ],
  });
  assert.equal(result.matrix.viewports.find((viewport) => viewport.id === "desktop")?.passed, true);
  assert.equal(result.matrix.viewports.find((viewport) => viewport.id === "mobile")?.passed, false);
  assert.equal(result.matrix.passed, false);
  assert.equal(result.matrix.worstViewport, "mobile");
  assert.ok(result.matrix.worstPixelDiff > 0.02 || result.matrix.worstComputedStyle < 0.98);
});

test("shared browser suite launches once and preserves isolated viewport results", async () => {
  const item = await fixture(
    "shared-browser-suite",
    `<!doctype html><html><head><style>body{margin:0}.app{width:320px;height:240px;background:#fff}.panel{display:none;width:120px;height:100px;background:#e11d48}.app.open .panel{display:block}@media(max-width:500px){.panel{width:80px}}</style></head><body><div class="app"><button id="open">Open</button><div class="panel">Panel</div></div><script>document.getElementById('open').onclick=()=>document.querySelector('.app').classList.add('open')</script></body></html>`,
    `${baseVars}body{margin:0}.sg-app{width:320px;height:240px;background:var(--sg-paper)}.sg-panel{display:none;width:120px;height:100px;background:var(--sg-primary)}.sg-app.sg-open .sg-panel{display:block}@media(max-width:500px){.sg-panel{width:80px}}@media(max-width:320px){.sg-panel{width:80px}}`,
    `(function(global){function mount(root){root.innerHTML='<div class="sg-app"><button id="sg-open">Open</button><div class="sg-panel">Panel</div></div>';root.querySelector('#sg-open').onclick=function(){root.querySelector('.sg-app').classList.add('sg-open')}}global.Fixture={mount:mount};})(window);`,
  );
  const scenario = {
    id: "open-panel-shared",
    critical: true,
    steps: [{ action: "click" as const, target: { reference: "#open", library: "#sg-open" } }],
    assertions: [{ target: { reference: ".panel", library: ".sg-panel" }, visible: true }],
  };
  const result = await evaluateBrowserQualitySuite(item.original, item.lib, [scenario], {
    concurrency: 2,
    viewports: [
      { id: "desktop", label: "Desktop", width: 1024, height: 768 },
      { id: "mobile", label: "Mobile", width: 390, height: 844 },
    ],
  });
  assert.equal(result.initial.matrix.passed, true);
  assert.equal(result.scenarios[0].evaluation.matrix.passed, true);
  assert.equal(result.telemetry.workload.browserLaunches, 1);
  assert.equal(result.telemetry.workload.contextsCreated, 4);
  assert.equal(result.telemetry.workload.pagesCreated, 8);
  assert.equal(result.telemetry.workload.navigations, 8);
  assert.equal(result.telemetry.workload.viewportRuns, 4);
  assert.equal(result.telemetry.workload.scenarioMatrices, 1);
  assert.equal(result.telemetry.concurrency, 2);
  assert.ok(result.telemetry.timing.launchMs > 0);
  assert.ok(result.telemetry.timing.navigationMs > 0);
  assert.ok(result.telemetry.timing.totalMs > 0);

});

test("run-local resource cache reuses identical remote image bytes across isolated contexts", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=", "base64");
  let imageRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === "/pixel.png") {
      imageRequests += 1;
      response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
      response.end(png);
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const imageUrl = `http://127.0.0.1:${address.port}/pixel.png`;
    const item = await fixture(
      "run-local-cache",
      `<!doctype html><html><head><style>body{margin:0}.app{width:120px;height:120px;background:#fff}.asset{width:80px;height:80px}</style></head><body><div class="app"><img class="asset" src="${imageUrl}" alt="pixel"></div></body></html>`,
      `${baseVars}body{margin:0}.sg-app{width:120px;height:120px;background:var(--sg-paper)}.sg-asset{width:80px;height:80px}@media(max-width:500px){.sg-asset{width:80px}}@media(max-width:320px){.sg-asset{width:80px}}`,
      `(function(global){function mount(root){root.innerHTML='<div class="sg-app"><img class="sg-asset" src="${imageUrl}" alt="pixel"></div>'}global.Fixture={mount:mount};})(window);`,
    );
    const result = await evaluateBrowserQualitySuite(item.original, item.lib, [], {
      concurrency: 1,
      resourceCache: "run-local",
      viewports: [
        { id: "desktop", label: "Desktop", width: 1024, height: 768 },
        { id: "mobile", label: "Mobile", width: 390, height: 844 },
      ],
    });
    assert.equal(result.initial.matrix.passed, true);
    assert.equal(result.telemetry.workload.resourceCacheMisses, 1);
    assert.ok(result.telemetry.workload.resourceCacheHits >= 1);
    assert.equal(imageRequests, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("adaptive stability waits for DOM, layout, network, and final assertions without fixed sleeps", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=", "base64");
  let imageRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === "/delayed.png") {
      imageRequests += 1;
      setTimeout(() => {
        response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
        response.end(png);
      }, 75);
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const imageUrl = `http://127.0.0.1:${address.port}/delayed.png`;
    const item = await fixture(
      "adaptive-stability",
      `<!doctype html><html><head><style>body{margin:0}.app{width:240px;height:180px;background:#fff}.panel{display:none;width:80px;height:80px;background:#e11d48}.app.ready .panel{display:block}.app.done .panel{background:#111827}</style></head><body><div class="app"><button id="load">Load</button><div class="panel"><button id="continue">Continue</button></div></div><script>document.getElementById('load').onclick=()=>{const image=new Image();image.onload=()=>document.querySelector('.app').classList.add('ready');image.src='${imageUrl}'};document.getElementById('continue').onclick=()=>document.querySelector('.app').classList.add('done')</script></body></html>`,
      `${baseVars}body{margin:0}.sg-app{width:240px;height:180px;background:var(--sg-paper)}.sg-panel{display:none;width:80px;height:80px;background:var(--sg-primary)}.sg-app.sg-ready .sg-panel{display:block}.sg-app.sg-done .sg-panel{background:var(--sg-ink)}@media(max-width:500px){.sg-panel{width:80px}}@media(max-width:320px){.sg-panel{width:80px}}`,
      `(function(global){function mount(root){root.innerHTML='<div class="sg-app"><button id="sg-load">Load</button><div class="sg-panel"><button id="sg-continue">Continue</button></div></div>';root.querySelector('#sg-load').onclick=function(){var image=new Image();image.onload=function(){root.querySelector('.sg-app').classList.add('sg-ready')};image.src='${imageUrl}'};root.querySelector('#sg-continue').onclick=function(){root.querySelector('.sg-app').classList.add('sg-done')}}global.Fixture={mount:mount};})(window);`,
    );
    const scenario = {
      id: "load-delayed-asset",
      critical: true,
      steps: [
        { action: "click" as const, target: { reference: "#load", library: "#sg-load" } },
        { action: "wait" as const, ms: 400 },
        { action: "click" as const, target: { reference: "#continue", library: "#sg-continue" } },
      ],
      assertions: [
        { target: { reference: ".panel", library: ".sg-panel" }, visible: true },
        { target: { reference: ".app", library: ".sg-app" }, classIncludes: [{ reference: "done", library: "sg-done" }] },
      ],
    };
    const result = await evaluateBrowserQualitySuite(item.original, item.lib, [scenario], {
      stabilityMode: "adaptive",
      resourceCache: "run-local",
      viewports: [{ id: "desktop", label: "Desktop", width: 1024, height: 768 }],
    });
    assert.equal(result.initial.matrix.passed, true);
    assert.equal(result.scenarios[0].evaluation.matrix.passed, true);
    assert.equal(result.telemetry.stabilityMode, "adaptive");
    assert.equal(result.telemetry.workload.stabilityTimeouts, 0);
    assert.equal(result.telemetry.workload.assertionStabilityTimeouts, 0);
    assert.equal(result.telemetry.workload.networkIdleTimeouts, 0);
    assert.equal(result.telemetry.workload.explicitWaits, 2);
    assert.equal(result.telemetry.workload.adaptiveExplicitWaits, 2);
    assert.equal(result.telemetry.timing.fixedWaitMs, 0);
    assert.ok(result.telemetry.timing.domStabilityMs > 0);
    assert.ok(result.telemetry.timing.networkIdleMs > 0);
    assert.ok(result.telemetry.workload.resourceCacheHits >= 1);
    assert.equal(imageRequests, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("adaptive stability preserves temporal waits when the following target was already actionable", async () => {
  const item = await fixture(
    "adaptive-wait-safety",
    `<!doctype html><html><head><style>body{margin:0}.app{width:220px;height:140px;background:#fff}.status{width:120px;height:40px;background:#e11d48;color:#fff}</style></head><body><div class="app"><button id="prepare">Prepare</button><button id="apply">Apply</button><div class="status">idle</div></div><script>let ready=false;document.getElementById('prepare').onclick=()=>setTimeout(()=>{ready=true},80);document.getElementById('apply').onclick=()=>{document.querySelector('.status').textContent=ready?'ready':'early'}</script></body></html>`,
    `${baseVars}body{margin:0}.sg-app{width:220px;height:140px;background:var(--sg-paper)}.sg-status{width:120px;height:40px;background:var(--sg-primary);color:#fff}@media(max-width:500px){.sg-status{width:120px}}@media(max-width:320px){.sg-status{width:120px}}`,
    `(function(global){function mount(root){var ready=false;root.innerHTML='<div class="sg-app"><button id="sg-prepare">Prepare</button><button id="sg-apply">Apply</button><div class="sg-status">idle</div></div>';root.querySelector('#sg-prepare').onclick=function(){setTimeout(function(){ready=true},80)};root.querySelector('#sg-apply').onclick=function(){root.querySelector('.sg-status').textContent=ready?'ready':'early'}}global.Fixture={mount:mount};})(window);`,
  );
  const scenario = {
    id: "preserve-temporal-wait",
    critical: true,
    steps: [
      { action: "click" as const, target: { reference: "#prepare", library: "#sg-prepare" } },
      { action: "wait" as const, ms: 120 },
      { action: "click" as const, target: { reference: "#apply", library: "#sg-apply" } },
    ],
    assertions: [{ target: { reference: ".status", library: ".sg-status" }, text: "ready" }],
  };
  const result = await evaluateBrowserQualitySuite(item.original, item.lib, [scenario], {
    stabilityMode: "adaptive",
    viewports: [{ id: "desktop", label: "Desktop", width: 1024, height: 768 }],
  });
  assert.equal(result.scenarios[0].evaluation.matrix.passed, true);
  assert.equal(result.telemetry.workload.explicitWaits, 2);
  assert.equal(result.telemetry.workload.adaptiveExplicitWaits, 0);
  assert.ok(result.telemetry.timing.fixedWaitMs >= 200);
  assert.equal(result.telemetry.workload.stabilityTimeouts, 0);
});
