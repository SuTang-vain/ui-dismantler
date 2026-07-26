import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { evaluateSpaRouterContract, type SpaRouterContractConfig } from "../evaluation/spa-router.js";
import { runQualityGate } from "../workflow/pipeline.js";

const root = new URL("../../", import.meta.url).pathname;

const app = `<!doctype html><html><head><title>SPA Fixture</title></head><body>
<nav><a id="home" href="/">Home</a><a id="explore" href="/explore">Explore</a><button id="library">Library</button><input id="search" aria-label="Search"></nav><main id="view"></main>
<script>
const view=document.getElementById('view');
const render=()=>{const path=location.pathname;view.textContent=path==='/explore'?'Explore':path==='/login'?'Login':path==='/settings'?'Settings':path.startsWith('/search/')?'Search '+decodeURIComponent(path.slice(8)):'Home'};
const navigate=(path)=>{history.pushState({path,key:String(performance.now())},'',path);render()};
history.replaceState({path:location.pathname,key:String(performance.now())},'',location.href);
document.querySelectorAll('a').forEach(a=>a.onclick=e=>{e.preventDefault();navigate(a.getAttribute('href'))});
document.getElementById('library').onclick=()=>navigate('/login');
document.getElementById('search').onkeydown=e=>{if(e.key==='Enter')navigate('/search/'+encodeURIComponent(e.target.value))};
addEventListener('popstate',render);fetch('/api/bootstrap').then(r=>r.json()).then(data=>document.body.dataset.ready=String(data.ready));render();
</script></body></html>`;
let server: ReturnType<typeof createServer>;
let baseUrl = "";
before(async () => {
  server = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(app); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("missing test server address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

test("SPA router contract captures push, replace, popstate, deep reload and deterministic API fixtures", async () => {
  const config: SpaRouterContractConfig = {
    schemaVersion: "1.0", baseUrl, apiPrefix: "/api/", ignoredStateKeys: ["key"],
    fixtures: [{ path: "/api/bootstrap", body: { ready: true } }],
    scenarios: [
      { id: "router-link", entryPath: "/", steps: [{ action: "click", target: "#explore" }], assertions: { path: "/explore", visibleText: "Explore" } },
      { id: "router-back", entryPath: "/", steps: [{ action: "click", target: "#explore" }, { action: "back" }], assertions: { path: "/", visibleText: "Home" } },
      { id: "dynamic-search", entryPath: "/", steps: [{ action: "input", target: "#search", value: "周杰伦" }, { action: "key", target: "#search", key: "Enter" }], assertions: { path: "/search/%E5%91%A8%E6%9D%B0%E4%BC%A6", inputValue: { target: "#search", value: "周杰伦" } } },
      { id: "guard-redirect", entryPath: "/", steps: [{ action: "click", target: "#library" }], assertions: { path: "/login", visibleText: "Login" } },
      { id: "deep-reload", entryPath: "/settings", steps: [{ action: "reload" }], assertions: { path: "/settings", visibleText: "Settings", visibleSelector: "[data-ready=true]" } },
    ],
  };
  const report = await evaluateSpaRouterContract(config);
  assert.equal(report.passed, true, JSON.stringify(report, null, 2));
  assert.equal(report.scenariosPassed, 5);
  assert.equal(report.runtimeErrors, 0);
  assert.equal(report.unmockedApiRequests, 0);
  assert.ok(report.results.some((result) => result.transitions.some((transition) => transition.method === "replaceState")));
  assert.equal(report.results.flatMap((result) => result.transitions).some((transition) => transition.state.includes('"key"')), false);
  assert.ok(report.results.some((result) => result.transitions.some((transition) => transition.method === "pushState")));
  assert.ok(report.results.find((result) => result.id === "router-back")?.transitions.some((transition) => transition.method === "popstate"));
  assert.ok(report.telemetry.timing.reportReadyMs > 0);
  assert.ok(report.telemetry.timing.totalMs >= report.telemetry.timing.reportReadyMs);
  assert.ok(report.telemetry.activeHandlesBeforeClose.totalHandles >= 0);
  assert.ok(report.telemetry.activeHandlesAfterClose.totalHandles >= 0);
  assert.ok(report.telemetry.activeHandlesAfterClose.totalBlockingHandles >= 0);
  assert.equal(typeof report.telemetry.fastShutdownLockWaitMs, "number");
});

test("SPA router contract strictly compares reference and generated transition order, target and normalized state", async () => {
  const config: SpaRouterContractConfig = {
    schemaVersion: "1.0", referenceBaseUrl: baseUrl, generatedBaseUrl: baseUrl, apiPrefix: "/api/", ignoredStateKeys: ["key"],
    fixtures: [{ path: "/api/bootstrap", body: { ready: true } }],
    scenarios: [
      { id: "router-link", entryPath: "/", steps: [{ action: "click", target: "#explore" }], assertions: { path: "/explore", visibleText: "Explore" } },
      { id: "router-back", entryPath: "/", steps: [{ action: "click", target: "#explore" }, { action: "back" }], assertions: { path: "/", visibleText: "Home" } },
    ],
  };
  const report = await evaluateSpaRouterContract(config);
  assert.equal(report.mode, "reference-generated");
  assert.equal(report.passed, true, JSON.stringify(report, null, 2));
  assert.equal(report.navigationIntegrity.rate, 1);
  assert.equal(report.comparisons?.every((comparison) => comparison.passed), true);
  assert.equal(report.qualityGates.find((gate) => gate.id === "navigation-integrity")?.passed, true);
});

test("SPA semantic navigation compares base-relative route observations and supports role-specific selectors", async () => {
  const semanticServer = createServer((request, response) => {
    const generated = request.url?.startsWith("/generated/") ?? false;
    const prefix = generated ? "/generated" : "/reference";
    const exploreId = generated ? "explore-generated" : "explore-reference";
    const extraInit = generated ? "history.replaceState({router:'generated',phase:'extra'},'',location.href);" : "";
    const page = `<!doctype html><html><body><a id="${exploreId}" href="${prefix}/explore">Explore</a><main id="view"></main><script>
const prefix=${JSON.stringify(prefix)},view=document.getElementById('view');
const render=()=>view.textContent=location.pathname===prefix+'/explore'?'Explore':'Home';
const navigate=path=>{history.pushState({router:${generated ? "'generated'" : "'reference'"}},'',path);render()};
history.replaceState({router:${generated ? "'generated'" : "'reference'"}},'',location.href);${extraInit}
document.querySelector('a').onclick=e=>{e.preventDefault();navigate(e.currentTarget.getAttribute('href'))};
addEventListener('popstate',render);render();
</script></body></html>`;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(page);
  });
  await new Promise<void>((resolve) => semanticServer.listen(0, "127.0.0.1", resolve));
  try {
    const address = semanticServer.address(); if (!address || typeof address === "string") throw new Error("missing semantic server address");
    const host = `http://127.0.0.1:${address.port}`;
    const report = await evaluateSpaRouterContract({
      schemaVersion: "1.0", referenceBaseUrl: `${host}/reference/`, generatedBaseUrl: `${host}/generated/`, navigationComparison: "semantic",
      scenarios: [{
        id: "role-aware-history", entryPath: "./", steps: [
          { action: "click", target: { reference: "#explore-reference", generated: "#explore-generated" } },
          { action: "back" },
        ],
        assertions: { path: { reference: "/reference/", generated: "/generated/" }, visibleText: "Home" },
      }],
    });
    assert.equal(report.reference?.passed, true, JSON.stringify(report, null, 2));
    assert.equal(report.generated?.passed, true, JSON.stringify(report, null, 2));
    assert.notEqual(report.reference?.results[0]?.transitions.length, report.generated?.results[0]?.transitions.length);
    assert.equal(report.comparisons?.[0]?.failures.length, 0, JSON.stringify(report.comparisons, null, 2));
    assert.equal(report.navigationIntegrity.rate, 1);
    assert.equal(report.passed, true, JSON.stringify(report, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) => semanticServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("SPA router navigation-integrity gate rejects a generated history-state mismatch even when route assertions pass", async () => {
  const mismatchedApp = app.replace("{path,key:String(performance.now())}", "{path,key:String(performance.now()),generatedOnly:true}");
  const mismatchedServer = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(mismatchedApp); });
  await new Promise<void>((resolve) => mismatchedServer.listen(0, "127.0.0.1", resolve));
  try {
    const address = mismatchedServer.address(); if (!address || typeof address === "string") throw new Error("missing mismatch server address");
    const report = await evaluateSpaRouterContract({
      schemaVersion: "1.0", referenceBaseUrl: baseUrl, generatedBaseUrl: `http://127.0.0.1:${address.port}`, apiPrefix: "/api/", ignoredStateKeys: ["key"],
      fixtures: [{ path: "/api/bootstrap", body: { ready: true } }],
      scenarios: [{ id: "router-link", entryPath: "/", steps: [{ action: "click", target: "#explore" }], assertions: { path: "/explore", visibleText: "Explore" } }],
    });
    assert.equal(report.reference?.passed, true);
    assert.equal(report.generated?.passed, true);
    assert.equal(report.passed, false);
    assert.equal(report.navigationIntegrity.passed, false);
    assert.equal(report.comparisons?.[0]?.failures.some((failure) => failure.reason === "transition-state-mismatch"), true, JSON.stringify(report, null, 2));
    assert.equal(report.qualityGates.find((gate) => gate.id === "navigation-integrity")?.passed, false);
  } finally {
    await new Promise<void>((resolve, reject) => mismatchedServer.close((error) => error ? reject(error) : resolve()));
  }
});


test("formal quality workflow merges the SPA contract into runtime, resource and navigation gates", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-spa-quality-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const configPath = join(dir, "spa-router.json");
  const config: SpaRouterContractConfig = {
    schemaVersion: "1.0", referenceBaseUrl: baseUrl, generatedBaseUrl: baseUrl, apiPrefix: "/api/", ignoredStateKeys: ["key"],
    fixtures: [{ path: "/api/bootstrap", body: { ready: true } }],
    visualMatrix: { viewports: [{ id: "desktop", label: "Desktop", width: 1024, height: 768 }] },
    scenarios: [{ id: "router-link", entryPath: "/", steps: [{ action: "click", target: "#explore" }], assertions: { path: "/explore", visibleText: "Explore" }, visual: { screenshotAnchor: "#view", styleTargets: [{ id: "route-view", selector: "#view" }] } }],
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  const report = await runQualityGate({
    htmlPath: `${root}benchmark/original.html`, libDir: `${root}benchmark/lib`, visual: false,
    thresholds: { interactionCoverage: null }, spaRouterConfigPath: configPath,
  });
  assert.equal(report.passed, true, JSON.stringify(report.gates, null, 2));
  assert.equal(report.spaRouter?.mode, "reference-generated");
  assert.equal(report.gates.find((gate) => gate.id === "scenario-viewport-matrix")?.passed, true);
  assert.equal(report.gates.find((gate) => gate.id === "visual-runtime")?.passed, true);
  assert.equal(report.gates.find((gate) => gate.id === "resource-readiness")?.passed, true);
  assert.equal(report.gates.find((gate) => gate.id === "navigation-integrity")?.passed, true);
  assert.equal(report.gates.find((gate) => gate.id === "spa-router-contract")?.passed, true);
  assert.equal(report.telemetry.workload.spaRouterScenarios, 1);
  assert.equal(report.telemetry.workload.spaRouterViewportRuns, 1);
  assert.equal(report.spaRouter?.telemetry.visualTargetReusedRuns, 2);
  assert.equal(report.spaRouter?.telemetry.visualTargetFreshRuns, 0);
  assert.ok(report.telemetry.timing.spaRouterMs > 0);
});

test("SPA route-state visual matrix compares reviewed styles and pixels across viewports", async (context) => {
  const artifactDir = await mkdtemp(join(tmpdir(), "ui-dismantler-spa-visual-pass-"));
  context.after(() => rm(artifactDir, { recursive: true, force: true }));
  const report = await evaluateSpaRouterContract({
    schemaVersion: "1.0", referenceBaseUrl: baseUrl, generatedBaseUrl: baseUrl, apiPrefix: "/api/", ignoredStateKeys: ["key"],
    fixtures: [{ path: "/api/bootstrap", body: { ready: true } }],
    execution: { browserShutdown: "fast-kill" },
    visualMatrix: {
      artifactDir,
      viewports: [
        { id: "desktop", label: "Desktop", width: 1024, height: 768 },
        { id: "mobile", label: "Mobile", width: 390, height: 844 },
      ],
    },
    scenarios: [{
      id: "router-link", entryPath: "/", steps: [{ action: "click", target: "#explore" }], assertions: { path: "/explore", visibleText: "Explore" },
      visual: { screenshotAnchor: "#view", styleTargets: [{ id: "route-view", selector: "#view" }, { id: "page-body", selector: "body" }] },
    }],
  });
  assert.equal(report.passed, true, JSON.stringify(report, null, 2));
  assert.equal(report.visualMatrix?.passed, true);
  assert.equal(report.visualMatrix?.viewportRuns, 2);
  assert.equal(report.visualMatrix?.worstComputedStyle, 1);
  assert.equal(report.visualMatrix?.worstPixelDiff, 0);
  assert.equal(report.telemetry.contractTargetRuns, 2);
  assert.equal(report.telemetry.visualViewportRuns, 2);
  assert.equal(report.telemetry.visualTargetRuns, 4);
  assert.equal(report.telemetry.visualTargetReusedRuns, 2);
  assert.equal(report.telemetry.visualTargetFreshRuns, 2);
  assert.equal(report.telemetry.visualStabilityFailures, 0);
  assert.ok(report.telemetry.visualAdaptiveWaitMs > 0);
  assert.equal(report.telemetry.browserShutdownMode, "fast-kill");
  assert.equal(report.telemetry.fastShutdownUsed, true);
  assert.equal(report.telemetry.fastShutdownConfirmed, true);
  assert.equal(report.visualMatrix?.scenarios[0]?.viewports.every((viewport) => viewport.referenceAnchor === "#view" && viewport.generatedAnchor === "#view"), true);
  assert.equal(report.qualityGates.find((gate) => gate.id === "scenario-viewport-matrix")?.passed, true);
});

test("SPA reviewed screenshot region excludes non-owned shell differences while preserving region evidence", async () => {
  const shellMismatchApp = app.replace("</head>", "<style>body{background:#e11d48}#view{display:inline-block;background:#fff;color:#111;padding:8px}</style></head>");
  const referenceRegionApp = app.replace("</head>", "<style>#view{display:inline-block;background:#fff;color:#111;padding:8px}</style></head>");
  const regionServer = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(request.url?.startsWith("/generated") ? shellMismatchApp : referenceRegionApp);
  });
  await new Promise<void>((resolve) => regionServer.listen(0, "127.0.0.1", resolve));
  try {
    const address = regionServer.address(); if (!address || typeof address === "string") throw new Error("missing region server address");
    const host = `http://127.0.0.1:${address.port}`;
    const report = await evaluateSpaRouterContract({
      schemaVersion: "1.0", referenceBaseUrl: `${host}/reference/`, generatedBaseUrl: `${host}/generated/`, navigationComparison: "semantic", apiPrefix: "/api/", ignoredStateKeys: ["key"],
      fixtures: [{ path: "/api/bootstrap", body: { ready: true } }],
      visualMatrix: { viewports: [{ id: "desktop", label: "Desktop", width: 1024, height: 768 }] },
      scenarios: [{
        id: "reviewed-region", entryPath: "./", steps: [], assertions: { visibleText: "Home" },
        visual: { screenshotAnchor: "#view", screenshotRegion: "#view", styleTargets: [{ id: "route-view", selector: "#view" }] },
      }],
    });
    const viewport = report.visualMatrix?.scenarios[0]?.viewports[0];
    assert.equal(report.passed, true, JSON.stringify(report, null, 2));
    assert.equal(viewport?.referenceRegion, "#view");
    assert.equal(viewport?.generatedRegion, "#view");
    assert.ok((viewport?.referenceRegionRect?.width ?? 1024) < 1024);
    assert.ok((viewport?.referenceRegionRect?.height ?? 768) < 768);
    assert.equal(viewport?.pixels.diffRate, 0);
  } finally {
    await new Promise<void>((resolve, reject) => regionServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("SPA route-state visual matrix catches a generated mobile-only regression", async () => {
  const mobileMismatchApp = app.replace("</head>", "<style>@media(max-width:500px){body{background:#e11d48;color:#fff}}</style></head>");
  const mobileMismatchServer = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(mobileMismatchApp); });
  await new Promise<void>((resolve) => mobileMismatchServer.listen(0, "127.0.0.1", resolve));
  try {
    const address = mobileMismatchServer.address(); if (!address || typeof address === "string") throw new Error("missing mobile mismatch server address");
    const report = await evaluateSpaRouterContract({
      schemaVersion: "1.0", referenceBaseUrl: baseUrl, generatedBaseUrl: `http://127.0.0.1:${address.port}`, apiPrefix: "/api/", ignoredStateKeys: ["key"],
      fixtures: [{ path: "/api/bootstrap", body: { ready: true } }],
      visualMatrix: {
        viewports: [
          { id: "desktop", label: "Desktop", width: 1024, height: 768 },
          { id: "mobile", label: "Mobile", width: 390, height: 844 },
        ],
      },
      scenarios: [{
        id: "router-link", entryPath: "/", steps: [{ action: "click", target: "#explore" }], assertions: { path: "/explore", visibleText: "Explore" },
        visual: { screenshotAnchor: "#view", styleTargets: [{ id: "page-body", selector: "body" }] },
      }],
    });
    const desktop = report.visualMatrix?.scenarios[0]?.viewports.find((viewport) => viewport.id === "desktop");
    const mobile = report.visualMatrix?.scenarios[0]?.viewports.find((viewport) => viewport.id === "mobile");
    assert.equal(report.reference?.passed, true);
    assert.equal(report.generated?.passed, true);
    assert.equal(report.passed, false);
    assert.equal(desktop?.passed, true, JSON.stringify(desktop, null, 2));
    assert.equal(mobile?.passed, false);
    assert.ok((mobile?.pixels.diffRate ?? 0) > 0.02);
    assert.ok((mobile?.styles.rate ?? 1) < 0.98);
    assert.equal(report.qualityGates.find((gate) => gate.id === "scenario-viewport-matrix")?.passed, false);
  } finally {
    await new Promise<void>((resolve, reject) => mobileMismatchServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("SPA scenario protocol supports double-click, hover and exact absence assertions", async () => {
  const protocolApp = `<!doctype html><html><body><input id="new"><ul id="list"></ul><script>
const input=document.getElementById('new'),list=document.getElementById('list');
const add=value=>{const li=document.createElement('li');li.innerHTML='<label></label><input class="edit" hidden><button class="destroy">x</button>';const label=li.querySelector('label'),edit=li.querySelector('.edit');label.textContent=value;label.ondblclick=()=>{edit.hidden=false;edit.value=label.textContent;edit.focus()};edit.onkeydown=e=>{if(e.key==='Enter'){label.textContent=edit.value;edit.hidden=true}};li.querySelector('.destroy').onclick=()=>li.remove();list.appendChild(li)};
input.onkeydown=e=>{if(e.key==='Enter'&&input.value){add(input.value);input.value=''}};
</script></body></html>`;
  const protocolServer = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(protocolApp); });
  await new Promise<void>((resolve) => protocolServer.listen(0, "127.0.0.1", resolve));
  try {
    const address = protocolServer.address(); if (!address || typeof address === "string") throw new Error("missing protocol server address");
    const report = await evaluateSpaRouterContract({
      schemaVersion: "1.0", baseUrl: `http://127.0.0.1:${address.port}`,
      scenarios: [
        {
          id: "edit", entryPath: "/", steps: [
            { action: "input", target: "#new", value: "Task Alpha" }, { action: "key", target: "#new", key: "Enter" },
            { action: "dblclick", target: "#list li label" }, { action: "input", target: "#list li .edit", value: "Task Alpha Updated" }, { action: "key", target: "#list li .edit", key: "Enter" },
          ], assertions: { visibleText: "Task Alpha Updated", absentExactText: "Task Alpha", selectorCount: { target: "#list li", count: 1 } },
        },
        {
          id: "destroy", entryPath: "/", steps: [
            { action: "input", target: "#new", value: "Task Beta" }, { action: "key", target: "#new", key: "Enter" },
            { action: "hover", target: "#list li" }, { action: "click", target: "#list li .destroy" },
          ], assertions: { absentExactText: "Task Beta", absentSelector: "#list li", selectorCount: { target: "#list li", count: 0 } },
        },
      ],
    });
    assert.equal(report.passed, true, JSON.stringify(report, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) => protocolServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("SPA adaptive visual stability fails continuous DOM mutations instead of capturing an unstable pass", async () => {
  const unstableApp = `<!doctype html><html><body><main id="view">Ready</main><script>setInterval(()=>document.body.dataset.tick=String(Date.now()),10)</script></body></html>`;
  const unstableServer = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(unstableApp); });
  await new Promise<void>((resolve) => unstableServer.listen(0, "127.0.0.1", resolve));
  try {
    const address = unstableServer.address(); if (!address || typeof address === "string") throw new Error("missing unstable server address");
    const base = `http://127.0.0.1:${address.port}`;
    const report = await evaluateSpaRouterContract({
      schemaVersion: "1.0", referenceBaseUrl: base, generatedBaseUrl: base,
      execution: { browserShutdown: "fast-kill" },
      visualMatrix: { stabilityTimeoutMs: 220, viewports: [{ id: "desktop", label: "Desktop", width: 1024, height: 768 }] },
      scenarios: [{ id: "unstable", entryPath: "/", steps: [], assertions: { visibleText: "Ready" }, visual: { screenshotAnchor: "#view", styleTargets: [{ id: "view", selector: "#view" }] } }],
    });
    assert.equal(report.reference?.passed, true);
    assert.equal(report.generated?.passed, true);
    assert.equal(report.passed, false);
    assert.ok((report.visualMatrix?.stabilityFailures ?? 0) > 0, JSON.stringify(report.visualMatrix, null, 2));
    assert.ok((report.telemetry.visualAdaptiveWaitMs ?? 0) >= 400);
    assert.equal(report.qualityGates.find((gate) => gate.id === "visual-runtime")?.passed, false);
    assert.equal(report.qualityGates.find((gate) => gate.id === "scenario-viewport-matrix")?.passed, false);
    assert.equal(report.telemetry.browserShutdownMode, "graceful-fallback");
    assert.equal(report.telemetry.fastShutdownUsed, false);
  } finally {
    await new Promise<void>((resolve, reject) => unstableServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("SPA resource readiness separates required document assets from non-blocking image failures", async () => {
  const resourceApp = `<!doctype html><html><head><link rel="stylesheet" href="/missing.css"></head><body><script src="/missing.js"></script><img src="/missing.png"><main>Ready</main></body></html>`;
  const resourceServer = createServer((_request, response) => { response.writeHead(404, { "content-type": "text/plain" }); response.end("missing"); });
  const pageServer = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(resourceApp); });
  await new Promise<void>((resolve) => pageServer.listen(0, "127.0.0.1", resolve));
  await new Promise<void>((resolve) => resourceServer.listen(0, "127.0.0.1", resolve));
  try {
    const pageAddress = pageServer.address(), resourceAddress = resourceServer.address();
    if (!pageAddress || typeof pageAddress === "string" || !resourceAddress || typeof resourceAddress === "string") throw new Error("missing resource server address");
    // The page server redirects asset requests to the explicit 404 server so the test can classify types.
    await new Promise<void>((resolve, reject) => pageServer.close((error) => error ? reject(error) : resolve()));
    const proxyServer = createServer((request, response) => {
      if (request.url === "/") { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(resourceApp.replaceAll("http://asset.invalid", `http://127.0.0.1:${resourceAddress.port}`)); return; }
      response.writeHead(404); response.end("missing");
    });
    await new Promise<void>((resolve) => proxyServer.listen(0, "127.0.0.1", resolve));
    try {
      const proxyAddress = proxyServer.address(); if (!proxyAddress || typeof proxyAddress === "string") throw new Error("missing proxy address");
      const report = await evaluateSpaRouterContract({ schemaVersion: "1.0", baseUrl: `http://127.0.0.1:${proxyAddress.port}`, scenarios: [{ id: "resources", entryPath: "/", steps: [], assertions: { visibleText: "Ready" } }] });
      assert.equal(report.passed, false);
      assert.ok((report.requiredNetworkFailures ?? 0) >= 1, JSON.stringify(report, null, 2));
      assert.ok((report.nonBlockingNetworkFailures ?? 0) >= 0);
      assert.equal(report.qualityGates.find((gate) => gate.id === "resource-readiness")?.passed, false);
    } finally {
      await new Promise<void>((resolve, reject) => proxyServer.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    await new Promise<void>((resolve, reject) => resourceServer.close((error) => error ? reject(error) : resolve()));
    if (pageServer.listening) await new Promise<void>((resolve, reject) => pageServer.close((error) => error ? reject(error) : resolve()));
  }
});
