import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

test("adaptive stability drains dynamic stylesheets and CSS background images", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=", "base64");
  let stylesheetRequests = 0;
  let backgroundRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === "/dynamic-theme.css") {
      stylesheetRequests += 1;
      setTimeout(() => {
        response.writeHead(200, { "content-type": "text/css", "cache-control": "no-store" });
        response.end(`.app.asset-ready,.sg-app.sg-asset-ready{background-image:url('/background.png');background-size:24px 24px;background-repeat:repeat}`);
      }, 60);
      return;
    }
    if (request.url === "/background.png") {
      backgroundRequests += 1;
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
    const stylesheetUrl = `http://127.0.0.1:${address.port}/dynamic-theme.css`;
    const item = await fixture(
      "adaptive-external-stylesheet",
      `<!doctype html><html><head><style>body{margin:0}.app{width:240px;height:180px;background-color:#fff}.status{width:100px;height:40px;background:#e11d48;color:#fff}</style></head><body><div class="app"><button id="theme">Theme</button><div class="status">Ready</div></div><script>document.getElementById('theme').onclick=()=>{const link=document.createElement('link');link.rel='stylesheet';link.href='${stylesheetUrl}';link.onload=()=>document.querySelector('.app').classList.add('asset-ready');document.head.appendChild(link)}</script></body></html>`,
      `${baseVars}body{margin:0}.sg-app{width:240px;height:180px;background-color:var(--sg-paper)}.sg-status{width:100px;height:40px;background:var(--sg-primary);color:#fff}@media(max-width:500px){.sg-status{width:100px}}@media(max-width:320px){.sg-status{width:100px}}`,
      `(function(global){function mount(root){root.innerHTML='<div class="sg-app"><button id="sg-theme">Theme</button><div class="sg-status">Ready</div></div>';root.querySelector('#sg-theme').onclick=function(){var link=document.createElement('link');link.rel='stylesheet';link.href='${stylesheetUrl}';link.onload=function(){root.querySelector('.sg-app').classList.add('sg-asset-ready')};document.head.appendChild(link)}}global.Fixture={mount:mount};})(window);`,
    );
    const scenario = {
      id: "load-external-theme",
      critical: true,
      steps: [{ action: "click" as const, target: { reference: "#theme", library: "#sg-theme" } }],
      assertions: [{ target: { reference: ".app", library: ".sg-app" }, classIncludes: [{ reference: "asset-ready", library: "sg-asset-ready" }] }],
    };
    const result = await evaluateBrowserQualitySuite(item.original, item.lib, [scenario], {
      stabilityMode: "adaptive",
      resourceCache: "run-local",
      viewports: [{ id: "desktop", label: "Desktop", width: 1024, height: 768 }],
    });
    assert.equal(result.scenarios[0].evaluation.matrix.passed, true);
    assert.equal(result.telemetry.workload.stabilityTimeouts, 0);
    assert.equal(result.telemetry.workload.resourceDrainTimeouts, 0);
    assert.ok(result.telemetry.workload.resourceAwareWaits >= 2);
    assert.ok(result.telemetry.workload.stylesheetAwareWaits >= 2);
    assert.ok(result.telemetry.workload.backgroundImageAwareWaits >= 1);
    assert.equal(stylesheetRequests, 2);
    assert.equal(backgroundRequests, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("adaptive stability observes delayed web-font loading", async (context) => {
  const fontPath = [
    "/System/Library/Fonts/Symbol.ttf",
    "/System/Library/Fonts/SFNSMono.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  ].find(existsSync);
  if (!fontPath) { context.skip("no system font fixture available"); return; }
  const font = await readFile(fontPath);
  let stylesheetRequests = 0;
  let fontRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === "/font-theme.css") {
      stylesheetRequests += 1;
      setTimeout(() => {
        response.writeHead(200, { "content-type": "text/css", "cache-control": "no-store" });
        response.end(`@font-face{font-family:'DelayedGate';src:url('/delayed-font.ttf') format('truetype');font-display:block}.app.font-ready,.sg-app.sg-font-ready,.app.font-loaded,.sg-app.sg-font-loaded{font-family:'DelayedGate',sans-serif}`);
      }, 40);
      return;
    }
    if (request.url === "/delayed-font.ttf") {
      fontRequests += 1;
      setTimeout(() => {
        response.writeHead(200, { "content-type": "font/ttf", "cache-control": "no-store", "access-control-allow-origin": "*" });
        response.end(font);
      }, 80);
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const stylesheetUrl = `http://127.0.0.1:${address.port}/font-theme.css`;
    const item = await fixture(
      "adaptive-web-font",
      `<!doctype html><html><head><style>body{margin:0}.app{width:240px;height:180px;background:#fff}.label{font-size:24px}</style></head><body><div class="app"><button id="font">Font</button><div class="label">Font Gate</div></div><script>document.getElementById('font').onclick=()=>{const link=document.createElement('link');link.rel='stylesheet';link.href='${stylesheetUrl}';link.onload=()=>{const app=document.querySelector('.app');app.classList.add('font-ready');document.fonts.load("24px DelayedGate").then(()=>app.classList.add('font-loaded'))};document.head.appendChild(link)}</script></body></html>`,
      `${baseVars}body{margin:0}.sg-app{width:240px;height:180px;background:var(--sg-paper)}.sg-label{font-size:24px}@media(max-width:500px){.sg-label{font-size:24px}}@media(max-width:320px){.sg-label{font-size:24px}}`,
      `(function(global){function mount(root){root.innerHTML='<div class="sg-app"><button id="sg-font">Font</button><div class="sg-label">Font Gate</div></div>';root.querySelector('#sg-font').onclick=function(){var link=document.createElement('link');link.rel='stylesheet';link.href='${stylesheetUrl}';link.onload=function(){var app=root.querySelector('.sg-app');app.classList.add('sg-font-ready');document.fonts.load("24px DelayedGate").then(function(){app.classList.add('sg-font-loaded')})};document.head.appendChild(link)}}global.Fixture={mount:mount};})(window);`,
    );
    const scenario = {
      id: "load-web-font",
      critical: true,
      steps: [{ action: "click" as const, target: { reference: "#font", library: "#sg-font" } }],
      assertions: [{ target: { reference: ".app", library: ".sg-app" }, classIncludes: [{ reference: "font-loaded", library: "sg-font-loaded" }] }],
    };
    const result = await evaluateBrowserQualitySuite(item.original, item.lib, [scenario], {
      stabilityMode: "adaptive",
      resourceCache: "run-local",
      viewports: [{ id: "desktop", label: "Desktop", width: 1024, height: 768 }],
    });
    assert.equal(result.scenarios[0].evaluation.matrix.passed, true, JSON.stringify({ matrix: result.scenarios[0].evaluation.matrix, telemetry: result.telemetry }, null, 2));
    assert.equal(result.telemetry.workload.resourceDrainTimeouts, 0);
    assert.ok(result.telemetry.workload.stylesheetAwareWaits >= 2);
    assert.ok(result.telemetry.workload.fontAwareWaits >= 1);
    assert.equal(stylesheetRequests, 2);
    assert.equal(fontRequests, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("adaptive stability timeouts fail the viewport even when pixels would otherwise match", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/too-slow.css") {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "text/css", "cache-control": "no-store" });
        response.end(`.app.slow-ready,.sg-app.sg-slow-ready{background:#fff}`);
      }, 700);
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const stylesheetUrl = `http://127.0.0.1:${address.port}/too-slow.css`;
    const item = await fixture(
      "adaptive-timeout-gate",
      `<!doctype html><html><head><style>body{margin:0}.app{width:180px;height:120px;background:#fff}</style></head><body><div class="app"><button id="slow">Slow</button></div><script>document.getElementById('slow').onclick=()=>{const app=document.querySelector('.app');app.classList.add('slow-ready');const link=document.createElement('link');link.rel='stylesheet';link.href='${stylesheetUrl}';document.head.appendChild(link)}</script></body></html>`,
      `${baseVars}body{margin:0}.sg-app{width:180px;height:120px;background:var(--sg-paper)}.sg-app.sg-slow-ready{background:var(--sg-paper)}@media(max-width:500px){.sg-app{width:180px}}@media(max-width:320px){.sg-app{width:180px}}`,
      `(function(global){function mount(root){root.innerHTML='<div class="sg-app"><button id="sg-slow">Slow</button></div>';root.querySelector('#sg-slow').onclick=function(){var app=root.querySelector('.sg-app');app.classList.add('sg-slow-ready');var link=document.createElement('link');link.rel='stylesheet';link.href='${stylesheetUrl}';document.head.appendChild(link)}}global.Fixture={mount:mount};})(window);`,
    );
    const scenario = {
      id: "slow-stylesheet",
      critical: true,
      steps: [{ action: "click" as const, target: { reference: "#slow", library: "#sg-slow" } }],
      assertions: [{ target: { reference: ".app", library: ".sg-app" }, classIncludes: [{ reference: "slow-ready", library: "sg-slow-ready" }] }],
    };
    const result = await evaluateBrowserQualitySuite(item.original, item.lib, [scenario], {
      stabilityMode: "adaptive",
      viewports: [{ id: "desktop", label: "Desktop", width: 1024, height: 768 }],
    });
    const viewport = result.scenarios[0].evaluation.matrix.viewports[0];
    assert.equal(viewport.pixels?.passed, true, "the fixture intentionally keeps rendered pixels equivalent");
    assert.ok(viewport.stabilityFailures > 0);
    assert.ok(viewport.resourceFailures.length >= 2);
    assert.ok(viewport.resourceFailures.every((failure) => failure.url === stylesheetUrl));
    assert.ok(viewport.resourceFailures.every((failure) => failure.type === "stylesheet"));
    assert.ok(viewport.resourceFailures.every((failure) => failure.owner.includes("link")));
    assert.ok(viewport.resourceFailures.every((failure) => failure.required && failure.external));
    assert.ok(viewport.resourceFailures.every((failure) => failure.state === "pending" || failure.state === "timeout"));
    assert.ok(viewport.resourceFailures.every((failure) => (failure.elapsedMs ?? 0) >= 450));
    assert.deepEqual(new Set(viewport.resourceFailures.map((failure) => failure.role)), new Set(["reference", "library"]));
    assert.equal(viewport.passed, false);
    assert.equal(result.scenarios[0].evaluation.matrix.passed, false);
    assert.ok(result.telemetry.workload.stabilityTimeouts > 0);
    assert.ok(result.telemetry.workload.resourceDrainTimeouts > 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("resource failure graph reports HTTP status and pseudo-element owner", async () => {
  let requests = 0;
  const server = createServer((request, response) => {
    if (request.url === "/missing-background.png") {
      requests += 1;
      response.writeHead(404, { "content-type": "image/png", "cache-control": "no-store" });
      response.end("missing");
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const imageUrl = `http://127.0.0.1:${address.port}/missing-background.png`;
    const item = await fixture(
      "resource-failure-graph",
      `<!doctype html><html><head><style>body{margin:0}.app{position:relative;width:180px;height:120px;background:#fff}.app::before{content:'';position:absolute;inset:0;background-image:url('${imageUrl}')}</style></head><body><div class="app"></div></body></html>`,
      `${baseVars}body{margin:0}.sg-app{position:relative;width:180px;height:120px;background:var(--sg-paper)}.sg-app::before{content:'';position:absolute;inset:0;background-image:url('${imageUrl}')}@media(max-width:500px){.sg-app{width:180px}}@media(max-width:320px){.sg-app{width:180px}}`,
      `(function(global){function mount(root){root.innerHTML='<div class="sg-app"></div>'}global.Fixture={mount:mount};})(window);`,
    );
    const result = await evaluateBrowserQualitySuite(item.original, item.lib, [], {
      stabilityMode: "adaptive",
      resourceCache: "run-local",
      viewports: [{ id: "desktop", label: "Desktop", width: 1024, height: 768 }],
    });
    const viewport = result.initial.matrix.viewports[0];
    assert.equal(viewport.pixels?.passed, true);
    assert.equal(viewport.passed, false);
    assert.equal(viewport.translationFidelity?.passed, true);
    assert.equal(viewport.externalAvailability?.passed, false);
    assert.equal(viewport.externalAvailability?.requiredFailures, 2);
    assert.equal(viewport.resourceFailures.length, 2);
    assert.ok(viewport.resourceFailures.every((failure) => failure.url === imageUrl));
    assert.ok(viewport.resourceFailures.every((failure) => failure.type === "background-image"));
    assert.ok(viewport.resourceFailures.every((failure) => failure.pseudo === "::before"));
    assert.ok(viewport.resourceFailures.every((failure) => failure.owner.includes("app")));
    assert.ok(viewport.resourceFailures.every((failure) => failure.state === "http-error"));
    assert.ok(viewport.resourceFailures.every((failure) => failure.status === 404));
    assert.ok(viewport.resourceFailures.every((failure) => failure.required && failure.external));
    assert.ok(requests >= 1 && requests <= 2, "each page may fetch once; a failed route must never be fetched twice by route.fetch + continue");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("resource failure graph records request failure reasons for visible images", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/reset-image.png") {
      request.socket.destroy();
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const imageUrl = `http://127.0.0.1:${address.port}/reset-image.png`;
    const item = await fixture(
      "resource-request-failure",
      `<!doctype html><html><head><style>body{margin:0}.app{width:180px;height:120px;background:#fff}.asset{width:40px;height:40px}</style></head><body><div class="app"><img class="asset" src="${imageUrl}" alt="broken"></div></body></html>`,
      `${baseVars}body{margin:0}.sg-app{width:180px;height:120px;background:var(--sg-paper)}.sg-asset{width:40px;height:40px}@media(max-width:500px){.sg-asset{width:40px}}@media(max-width:320px){.sg-asset{width:40px}}`,
      `(function(global){function mount(root){root.innerHTML='<div class="sg-app"><img class="sg-asset" src="${imageUrl}" alt="broken"></div>'}global.Fixture={mount:mount};})(window);`,
    );
    const result = await evaluateBrowserQualitySuite(item.original, item.lib, [], {
      stabilityMode: "adaptive",
      viewports: [{ id: "desktop", label: "Desktop", width: 1024, height: 768 }],
    });
    const failures = result.initial.matrix.viewports[0].resourceFailures;
    assert.ok(failures.length >= 2);
    assert.ok(failures.every((failure) => failure.url === imageUrl));
    assert.ok(failures.every((failure) => failure.type === "image"));
    assert.ok(failures.every((failure) => failure.owner.includes("asset")));
    assert.ok(failures.every((failure) => failure.state === "request-failed"));
    assert.ok(failures.every((failure) => Boolean(failure.failure)));
    assert.equal(result.initial.matrix.viewports[0].translationFidelity?.passed, true);
    assert.equal(result.initial.matrix.viewports[0].externalAvailability?.passed, false);
    assert.equal(result.initial.matrix.passed, false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("resource failure graph covers CSS imports and SVG image references", async () => {
  let importRequests = 0;
  let svgRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === "/root.css") {
      response.writeHead(200, { "content-type": "text/css", "cache-control": "no-store" });
      response.end(`@import url('/missing-import.css');body{--resource-probe:1}`);
      return;
    }
    if (request.url === "/missing-import.css") {
      importRequests += 1;
      response.writeHead(404, { "content-type": "text/css", "cache-control": "no-store" });
      response.end("missing");
      return;
    }
    if (request.url === "/missing-svg.png") {
      svgRequests += 1;
      response.writeHead(404, { "content-type": "image/png", "cache-control": "no-store" });
      response.end("missing");
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const rootCss = `http://127.0.0.1:${address.port}/root.css`;
    const svgImage = `http://127.0.0.1:${address.port}/missing-svg.png`;
    const item = await fixture(
      "resource-import-svg",
      `<!doctype html><html><head><link rel="stylesheet" href="${rootCss}"><style>body{margin:0}.app{width:180px;height:120px;background:#fff}.svg-asset{width:40px;height:40px}</style></head><body><div class="app"><svg width="40" height="40"><image class="svg-asset" href="${svgImage}" width="40" height="40"></image></svg></div></body></html>`,
      `${baseVars}body{margin:0}.sg-app{width:180px;height:120px;background:var(--sg-paper)}.sg-svg-asset{width:40px;height:40px}@media(max-width:500px){.sg-app{width:180px}}@media(max-width:320px){.sg-app{width:180px}}`,
      `(function(global){function mount(root){var link=document.createElement('link');link.rel='stylesheet';link.href='${rootCss}';document.head.appendChild(link);root.innerHTML='<div class="sg-app"><svg width="40" height="40"><image class="sg-svg-asset" href="${svgImage}" width="40" height="40"></image></svg></div>'}global.Fixture={mount:mount};})(window);`,
    );
    const result = await evaluateBrowserQualitySuite(item.original, item.lib, [], {
      stabilityMode: "adaptive",
      viewports: [{ id: "desktop", label: "Desktop", width: 1024, height: 768 }],
    });
    const viewport = result.initial.matrix.viewports[0];
    const importFailures = viewport.resourceFailures.filter((failure) => failure.owner === "@import");
    const svgFailures = viewport.resourceFailures.filter((failure) => failure.type === "image" && failure.owner.includes("svg-asset"));
    assert.equal(viewport.translationFidelity?.passed, true);
    assert.equal(viewport.externalAvailability?.passed, false);
    assert.equal(importFailures.length, 2);
    assert.ok(importFailures.every((failure) => failure.type === "stylesheet" && failure.status === 404));
    assert.equal(svgFailures.length, 2);
    assert.ok(svgFailures.every((failure) => failure.status === 404 && failure.state === "http-error"));
    assert.equal(importRequests, 2);
    assert.equal(svgRequests, 2);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
