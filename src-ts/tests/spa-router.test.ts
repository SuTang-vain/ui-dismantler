import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { classifySpaRouterNetworkRequest, evaluateSpaRouterContract, findSpaRouterFixture, type SpaRouterContractConfig } from "../evaluation/spa-router.js";
import { formatSpaRouterVisualDiagnostics } from "../evaluation/spa-router-report.js";
import { comparePixels } from "../evaluation/browser.js";
import { runQualityGate } from "../workflow/pipeline.js";
import { generateSpaRouteShellPlan } from "../planning/spa-route-shell.js";
import { compareSpaRouteShellFiles, generateSpaRouteShellArtifact } from "../planning/spa-route-shell-generator.js";
import { generateSpaRouteShellIntegrationPatch, generateSpaRouteShellIntegrationPatchFromFile } from "../planning/spa-route-shell-patch.js";
import { analyzeVueRouterResponsibility } from "../planning/vue-router-responsibility.js";
import { generateVueRouterIntegrationPatch } from "../planning/vue-router-patch.js";
import { PNG } from "pngjs";

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

test("SPA route shell planner emits review-only routes, transitions, selector mappings and measurement fields", () => {
  const config: SpaRouterContractConfig = {
    schemaVersion: "1.0", referenceBaseUrl: "https://reference.test/app/", generatedBaseUrl: "https://generated.test/",
    fixtures: [{ hostname: "assets.test", path: "/cover.bin", resourceType: "fetch", query: { size: "large" }, requestHeaders: { "x-token": "reviewed" }, headers: { "content-type": "application/octet-stream" }, bodyBase64: "AAE=" }],
    scenarios: [
      { id: "explore", entryPath: "/", steps: [{ action: "click", target: { reference: "#reference-explore", generated: "#generated-explore" } }], assertions: { path: "/explore", visibleText: "Explore" }, visual: { screenshotAnchor: { reference: ".reference-page", generated: ".generated-page" }, styleTargets: [{ id: "page", selector: { reference: ".reference-page", generated: ".generated-page" } }] } },
      { id: "search", entryPath: "/", steps: [{ action: "input", target: "#search", value: "周杰伦" }, { action: "key", target: "#search", key: "Enter" }], assertions: { path: "/search/%E5%91%A8%E6%9D%B0%E4%BC%A6", visibleText: "Search" } },
      { id: "guard", entryPath: "/", steps: [{ action: "click", target: "a[href='/library']" }], assertions: { path: "/login", visibleText: "Login" } },
      { id: "reload", entryPath: "/settings", steps: [{ action: "reload" }], assertions: { path: "/settings", visibleText: "Settings" } },
    ],
  };
  const plan = generateSpaRouteShellPlan(config);
  assert.equal(plan.reviewRequired, true);
  assert.equal(plan.generatedCode, false);
  assert.equal(plan.source.reportIncluded, false);
  assert.ok(plan.routes.some((route) => route.route === "/explore"));
  assert.ok(plan.routes.some((route) => route.pattern === "/search/:value"));
  assert.ok(plan.transitions.some((transition) => transition.action === "click" && transition.to === "/explore"));
  assert.ok(plan.transitions.some((transition) => transition.action === "guard-redirect" && transition.from === "/library" && transition.to === "/login"));
  assert.ok(plan.routes.some((route) => route.route === "/library"));
  assert.ok(plan.transitions.some((transition) => transition.action === "reload" && transition.from === "/settings" && transition.to === "/settings"));
  assert.equal(plan.selectorMappings.length, 3);
  assert.equal(plan.fixtureDependencies[0]?.binary, true);
  assert.deepEqual(plan.fixtureDependencies[0]?.requestHeaders, ["x-token"]);
  assert.equal(plan.capabilities.dynamicInputRoutes, true);
  assert.equal(plan.capabilities.reload, true);
  assert.equal(plan.measurementTemplate.modelCalls, null);
});

test("SPA route shell generator emits behavior-only files and explicit review metrics", async () => {
  const config: SpaRouterContractConfig = {
    schemaVersion: "1.0", referenceBaseUrl: "https://reference.test/", generatedBaseUrl: "https://generated.test/",
    fixtures: [{ path: "/api/bootstrap", method: "POST", query: { mode: "test" }, requestHeaders: { "x-fixture": "yes" }, headers: { "content-type": "application/json" }, body: { ready: true } }],
    scenarios: [
      { id: "explore", entryPath: "/settings", steps: [{ action: "click", target: "a[href='/explore']" }], assertions: { path: "/explore", visibleText: "Explore" } },
      { id: "search", entryPath: "/settings", steps: [{ action: "input", target: "input[type='search']", value: "周杰伦" }, { action: "key", target: "input[type='search']", key: "Enter" }], assertions: { path: "/search/%E5%91%A8%E6%9D%B0%E4%BC%A6" } },
      { id: "guard", entryPath: "/settings", steps: [{ action: "click", target: "a[href='/library']" }], assertions: { path: "/login" } },
    ],
  };
  const plan = generateSpaRouteShellPlan(config);
  const temp = await mkdtemp(join(tmpdir(), "ui-dismantler-shell-"));
  const baseline = join(temp, "baseline");
  await mkdir(baseline, { recursive: true });
  await writeFile(join(baseline, "routes.js"), "manual routes\n", "utf8");
  try {
    const artifact = generateSpaRouteShellArtifact(plan, { baselinePath: baseline, manualEdits: 2, manualEditedLines: 7, repairIterations: 1 });
    assert.deepEqual(artifact.files.map((file) => file.path), ["routes.js", "guards.js", "router.js", "fixtures.js", "README.md"]);
    assert.equal(artifact.metrics.reviewRequired, true);
    assert.equal(artifact.metrics.generatedCode, true);
    assert.equal(artifact.metrics.modelCalls, 0);
    assert.equal(artifact.metrics.manualEdits, 2);
    assert.equal(artifact.metrics.manualEditedLines, 7);
    assert.equal(artifact.metrics.repairIterations, 1);
    assert.equal(artifact.metrics.diff.comparable, true);
    assert.equal(artifact.metrics.diff.comparableFiles, 1);
    assert.equal(artifact.metrics.diff.changedFiles, 1);
    assert.equal(artifact.metrics.qualityComparison.comparable, false);
    const routes = artifact.files.find((file) => file.path === "routes.js")?.content ?? "";
    const guards = artifact.files.find((file) => file.path === "guards.js")?.content ?? "";
    const router = artifact.files.find((file) => file.path === "router.js")?.content ?? "";
    const fixtures = artifact.files.find((file) => file.path === "fixtures.js")?.content ?? "";
    assert.match(routes, /\/search\/:value/);
    assert.match(routes, /\(\?<value>\[\^\/\]\+\)/);
    assert.match(guards, /\"from\": \"\/library\"/);
    assert.match(router, /pushState/);
    assert.match(router, /history\.back/);
    assert.match(fixtures, /registerFixtures/);
    assert.doesNotMatch(fixtures, /ready/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("SPA route shell integration patch reproduces the reviewed YesPlayMusic adapter without applying it", () => {
  const caseDir = `${root}examples/spa-router-regressions/yesplaymusic-generated`;
  const plan = JSON.parse(readFileSync(`${caseDir}/route-shell.plan.json`, "utf8"));
  const sourcePath = `${caseDir}/public/app.js`;
  const expectedPatched = readFileSync(`${caseDir}/auto-router/app.js`, "utf8");
  const patch = generateSpaRouteShellIntegrationPatchFromFile(plan, sourcePath);
  assert.equal(patch.metrics.reviewRequired, true);
  assert.equal(patch.metrics.applied, false);
  assert.equal(patch.metrics.blocked, false, JSON.stringify(patch.metrics, null, 2));
  assert.equal(patch.metrics.changedHunks, 6);
  assert.equal(patch.metrics.changedLines, 22);
  const requiredEdits = ["router-import", "local-navigate-helper", "guard-navigation", "history-back", "history-forward", "dynamic-input-navigation", "router-lifecycle"];
  assert.equal(requiredEdits.every((id) => patch.metrics.edits.find((edit) => edit.id === id)?.matched), true, JSON.stringify(patch.metrics, null, 2));
  assert.equal(patch.patched, expectedPatched);
  assert.match(patch.diff, /route-shell\.plan|app\.js/);
});

test("SPA route shell integration patch blocks when reviewed responsibilities cannot be located", () => {
  const caseDir = `${root}examples/spa-router-regressions/yesplaymusic-generated`;
  const plan = JSON.parse(readFileSync(`${caseDir}/route-shell.plan.json`, "utf8"));
  const patch = generateSpaRouteShellIntegrationPatch(plan, "const render = () => {};\nrender();\n", { sourcePath: "unsupported-app.js" });
  assert.equal(patch.metrics.reviewRequired, true);
  assert.equal(patch.metrics.applied, false);
  assert.equal(patch.metrics.blocked, true);
  assert.ok(patch.metrics.blockingReasons.some((reason) => reason.includes("history.back")));
  assert.equal(patch.metrics.blockingReasons.some((reason) => reason.includes("history.forward")), false);
  assert.ok(patch.metrics.blockingReasons.some((reason) => reason.includes("dynamic input routes")));
  assert.ok(patch.metrics.blockingReasons.some((reason) => reason.includes("guard redirect")));
  assert.ok(patch.metrics.blockingReasons.some((reason) => reason.includes("lifecycle")));
});

test("SPA route shell file diff reports missing boundaries instead of pretending app.js is comparable", () => {
  const files = [{ path: "router.js", content: "router\n", lines: 1 }];
  const diff = compareSpaRouteShellFiles(files, "/tmp/nonexistent-manual-route-shell");
  assert.equal(diff.comparable, false);
  assert.equal(diff.comparableFiles, 0);
  assert.equal(diff.missingBaselineFiles.length, 1);
  assert.match(diff.note ?? "", /baseline/);
});

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


test("pixel comparison reports dimension mismatch without throwing or masking the failure", async () => {
  const image = (width: number, height: number, red: number): Buffer => {
    const png = new PNG({ width, height });
    for (let index = 0; index < png.data.length; index += 4) {
      png.data[index] = red; png.data[index + 1] = 20; png.data[index + 2] = 40; png.data[index + 3] = 255;
    }
    return PNG.sync.write(png);
  };
  const report = await comparePixels(image(40, 30, 200), image(32, 24, 200), 0.02);
  assert.equal(report.dimensionMismatch, true);
  assert.equal(report.passed, false);
  assert.deepEqual(
    { reference: [report.referenceWidth, report.referenceHeight], generated: [report.generatedWidth, report.generatedHeight], overlap: [report.width, report.height] },
    { reference: [40, 30], generated: [32, 24], overlap: [32, 24] },
  );
});

test("SPA fixtures match hostname, path and resource type while preserving raw CSS and SVG bodies", async () => {
  const fixtureApp = `<!doctype html><html><head><link rel="stylesheet" href="https://assets.fixture.test/theme.css"></head><body><main id="view">Loading</main><img id="logo" src="https://assets.fixture.test/logo.svg"><script>addEventListener('load',async()=>{const css=getComputedStyle(document.getElementById('view')).color==='rgb(1, 2, 3)';const svg=document.getElementById('logo').naturalWidth===24;const response=await fetch('https://assets.fixture.test/blob.bin?variant=dark&v=1',{headers:{'x-fixture-token':'reviewed'}});const bytes=[...new Uint8Array(await response.arrayBuffer())];const binary=bytes.join(',')==='0,255,1,2';document.getElementById('view').textContent=(css?'CSS OK':'CSS BAD')+' '+(svg?'SVG OK':'SVG BAD')+' '+(binary?'BINARY OK':'BINARY BAD')})</script></body></html>`;
  const fixtureServer = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(fixtureApp); });
  await new Promise<void>((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
  try {
    const address = fixtureServer.address(); if (!address || typeof address === "string") throw new Error("missing fixture server address");
    const config: SpaRouterContractConfig = {
      schemaVersion: "1.0", baseUrl: `http://127.0.0.1:${address.port}`,
      fixtures: [
        { hostname: "assets.fixture.test", path: "/theme.css", resourceType: "stylesheet", headers: { "Content-Type": "text/css; charset=utf-8" }, body: "#view{color:rgb(1,2,3)}" },
        { hostname: "assets.fixture.test", path: "/logo.svg", resourceType: "image", headers: { "content-type": "image/svg+xml" }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12"><rect width="24" height="12" fill="#123456"/></svg>' },
        { hostname: "assets.fixture.test", path: "/blob.bin", resourceType: "fetch", query: { variant: "dark" }, requestHeaders: { "x-fixture-token": "reviewed" }, headers: { "content-type": "application/octet-stream" }, bodyBase64: "AP8BAg==" },
      ],
      scenarios: [{ id: "raw-assets", entryPath: "/", steps: [{ action: "wait", ms: 100 }], assertions: { visibleText: "CSS OK SVG OK BINARY OK" } }],
    };
    assert.equal(findSpaRouterFixture(config, { url: "https://assets.fixture.test/theme.css?cache=1", method: "GET", resourceType: "stylesheet" })?.path, "/theme.css");
    assert.equal(findSpaRouterFixture(config, { url: "https://assets.fixture.test/theme.css", method: "GET", resourceType: "image" }), undefined);
    assert.equal(findSpaRouterFixture(config, { url: "https://assets.fixture.test/blob.bin?variant=dark&v=1", method: "GET", resourceType: "fetch", headers: { "X-Fixture-Token": "reviewed" } })?.bodyBase64, "AP8BAg==");
    assert.equal(findSpaRouterFixture(config, { url: "https://assets.fixture.test/blob.bin?variant=light", method: "GET", resourceType: "fetch", headers: { "x-fixture-token": "reviewed" } }), undefined);
    assert.equal(findSpaRouterFixture({ fixtures: [{ hostname: "assets.fixture.test", path: "/blob.bin", query: { variant: "dark" }, queryMode: "exact", bodyBase64: "AA==" }] }, { url: "https://assets.fixture.test/blob.bin?variant=dark&v=1", method: "GET", resourceType: "fetch" }), undefined);
    const report = await evaluateSpaRouterContract(config);
    assert.equal(report.passed, true, JSON.stringify(report, null, 2));
    assert.equal(report.requiredNetworkFailures, 0);
  } finally {
    await new Promise<void>((resolve, reject) => fixtureServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("SPA fixture validation rejects ambiguous or malformed binary response bodies", async () => {
  await assert.rejects(() => evaluateSpaRouterContract({
    schemaVersion: "1.0", baseUrl, fixtures: [{ path: "/asset", body: "text", bodyBase64: "dGV4dA==" }],
    scenarios: [{ id: "invalid-fixture", entryPath: "/", steps: [], assertions: { visibleText: "Home" } }],
  }), /必须且只能声明 body 或 bodyBase64/);
  await assert.rejects(() => evaluateSpaRouterContract({
    schemaVersion: "1.0", baseUrl, fixtures: [{ path: "/asset", bodyBase64: "not-base64" }],
    scenarios: [{ id: "invalid-base64", entryPath: "/", steps: [], assertions: { visibleText: "Home" } }],
  }), /bodyBase64 不是合法 Base64/);
});

test("network classification ignores only the exact Google collect endpoint, not the Google domain", () => {
  assert.equal(classifySpaRouterNetworkRequest({ url: "https://www.google.com/g/collect?v=2", resourceType: "fetch" }), "non-blocking-telemetry");
  assert.equal(classifySpaRouterNetworkRequest({ url: "https://google.com/g/collect", resourceType: "fetch" }), "non-blocking-telemetry");
  assert.equal(classifySpaRouterNetworkRequest({ url: "https://www.google.com/search?q=required", resourceType: "fetch" }), "blocking-required");
  assert.equal(classifySpaRouterNetworkRequest({ url: "https://notgoogle.com/g/collect", resourceType: "fetch" }), "blocking-required");
  assert.equal(classifySpaRouterNetworkRequest({ url: "https://metrics.example.test/event", resourceType: "fetch" }, { nonBlockingNetworkHosts: ["metrics.example.test"] }), "non-blocking-configured-host");
});

async function runPendingImageVisualCase(removeImage: boolean): Promise<Awaited<ReturnType<typeof evaluateSpaRouterContract>>> {
  const pendingApp = `<!doctype html><html><head><style>body{margin:0}#view{width:240px;height:120px;background:#4466ee;color:white}img{width:32px;height:32px}</style></head><body><main id="view">Ready</main><img id="pending" src="/slow.png"><script>${removeImage ? "setTimeout(()=>document.getElementById('pending')?.remove(),40)" : ""}</script></body></html>`;
  const pendingServer = createServer((request, response) => {
    if (request.url === "/slow.png") {
      const timer = setTimeout(() => { if (!response.destroyed) { response.writeHead(200, { "content-type": "image/png" }); response.end(); } }, 5000);
      response.on("close", () => clearTimeout(timer));
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(pendingApp);
  });
  await new Promise<void>((resolve) => pendingServer.listen(0, "127.0.0.1", resolve));
  try {
    const address = pendingServer.address(); if (!address || typeof address === "string") throw new Error("missing pending image server address");
    const base = `http://127.0.0.1:${address.port}`;
    return await evaluateSpaRouterContract({
      schemaVersion: "1.0", referenceBaseUrl: base, generatedBaseUrl: base,
      visualMatrix: { stabilityTimeoutMs: 260, viewports: [{ id: "desktop", label: "Desktop", width: 1024, height: 768 }] },
      scenarios: [{ id: removeImage ? "stale-image" : "current-image", entryPath: "/", steps: [], assertions: { visibleText: "Ready" }, visual: { screenshotAnchor: "#view", screenshotRegion: "#view", styleTargets: [{ id: "view", selector: "#view" }] } }],
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      pendingServer.close((error) => error ? reject(error) : resolve());
      pendingServer.closeAllConnections?.();
    });
  }
}

test("an image request removed from the current DOM no longer blocks visual stability", async () => {
  const report = await runPendingImageVisualCase(true);
  assert.equal(report.passed, true, JSON.stringify(report.visualMatrix, null, 2));
  assert.equal(report.visualMatrix?.stabilityFailures, 0);
  assert.ok((report.telemetry.visualRequestClassifications["ignored-stale-image"] ?? 0) >= 2, JSON.stringify(report.telemetry, null, 2));
  assert.equal(report.telemetry.visualRequestClassifications["blocking-current-dom-image"], 0);
});

test("an image request still referenced by the current DOM remains a blocking stability failure", async () => {
  const report = await runPendingImageVisualCase(false);
  assert.equal(report.passed, false, JSON.stringify(report.visualMatrix, null, 2));
  assert.ok((report.visualMatrix?.stabilityFailures ?? 0) > 0, JSON.stringify(report.visualMatrix, null, 2));
  assert.ok((report.telemetry.visualRequestClassifications["blocking-current-dom-image"] ?? 0) >= 2, JSON.stringify(report.telemetry, null, 2));
  const diagnostics = formatSpaRouterVisualDiagnostics(report);
  assert.ok(diagnostics.some((line) => line.includes("[STABILITY]") && line.includes("/slow.png")), diagnostics.join("\n"));
  assert.ok(diagnostics.some((line) => line.includes("preAnchorWaitMs=")));
  assert.ok(diagnostics.some((line) => line.includes("currentDomImage=")));
  assert.equal(report.qualityGates.find((gate) => gate.id === "visual-runtime")?.passed, false);
});

test("post-anchor stability waits for scroll-triggered layout mutations before style and pixel capture", async () => {
  const anchorApp = `<!doctype html><html><head><style>body{margin:0;height:2200px}#anchor{position:absolute;top:1500px;width:180px;height:120px;background:#2457d6;color:white}</style></head><body><main id="anchor">Anchor</main><script>addEventListener('scroll',()=>setTimeout(()=>{const el=document.getElementById('anchor');el.style.width='240px';el.textContent='Anchor Settled'},80),{once:true})</script></body></html>`;
  const anchorServer = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(anchorApp); });
  await new Promise<void>((resolve) => anchorServer.listen(0, "127.0.0.1", resolve));
  try {
    const address = anchorServer.address(); if (!address || typeof address === "string") throw new Error("missing anchor server address");
    const base = `http://127.0.0.1:${address.port}`;
    const report = await evaluateSpaRouterContract({
      schemaVersion: "1.0", referenceBaseUrl: base, generatedBaseUrl: base,
      visualMatrix: { stabilityTimeoutMs: 900, viewports: [{ id: "desktop", label: "Desktop", width: 1024, height: 768 }] },
      scenarios: [{ id: "anchor-mutation", entryPath: "/", steps: [], assertions: { visibleText: "Anchor" }, visual: { screenshotAnchor: "#anchor", screenshotRegion: "#anchor", styleTargets: [{ id: "anchor", selector: "#anchor" }] } }],
    });
    assert.equal(report.passed, true, JSON.stringify(report.visualMatrix, null, 2));
    const viewport = report.visualMatrix?.scenarios[0]?.viewports[0];
    assert.ok(viewport);
    assert.ok((viewport?.postAnchorWaitMs ?? 0) >= 120, JSON.stringify(viewport, null, 2));
    assert.equal(viewport?.styles.mismatches.length, 0);
    assert.equal(report.telemetry.visualPostAnchorWaitMs, report.visualMatrix?.postAnchorWaitMs);
    assert.equal(report.telemetry.visualPreAnchorWaitMs, report.visualMatrix?.preAnchorWaitMs);
  } finally {
    await new Promise<void>((resolve, reject) => anchorServer.close((error) => error ? reject(error) : resolve()));
  }
});


test("Vue Router responsibility graph ignores commented history mode and maps framework-owned responsibilities", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "ui-dismantler-vue-router-"));
  try {
    await mkdir(join(fixture, "router", "modules"), { recursive: true });
    await mkdir(join(fixture, "store", "modules"), { recursive: true });
    await writeFile(join(fixture, "router", "index.js"), `import Vue from 'vue'\nimport Router from 'vue-router'\nexport const constantRoutes=[{path:'/login'},{path:'/',children:[{path:'dashboard'}]}]\nexport const asyncRoutes=[{path:'/permission',meta:{roles:['admin']},component:()=>import('@/views/permission')} ]\nconst createRouter=()=>new Router({\n// mode: 'history',\nroutes:constantRoutes\n})\nconst router=createRouter()\nexport function resetRouter(){const next=createRouter();router.matcher=next.matcher}\nexport default router\n`);
    await writeFile(join(fixture, "router", "modules", "nested.js"), `export default {path:'/nested',children:[{path:'menu1'}]}\n`);
    await writeFile(join(fixture, "permission.js"), `import router from './router'\nimport store from './store'\nconst whiteList=['/login']\nrouter.beforeEach(async(to,from,next)=>{const hasToken=getToken();if(!hasToken)return next('/login?redirect='+to.path);const accessRoutes=await store.dispatch('permission/generateRoutes',['admin']);router.addRoutes(accessRoutes);next({...to,replace:true})})\nrouter.afterEach(()=>{})\n`);
    await writeFile(join(fixture, "store", "modules", "permission.js"), `import {constantRoutes,asyncRoutes} from '@/router'\nfunction hasPermission(roles,route){return !route.meta?.roles||roles.some(role=>route.meta.roles.includes(role))}\nexport function filterAsyncRoutes(routes,roles){return routes.filter(route=>hasPermission(roles,route))}\nconst actions={generateRoutes({commit},roles){const routes=roles.includes('admin')?asyncRoutes:filterAsyncRoutes(asyncRoutes,roles);commit('SET_ROUTES',constantRoutes.concat(routes));return routes}}\n`);
    await writeFile(join(fixture, "App.vue"), `<template><router-view /></template>\n`);
    await writeFile(join(fixture, "Nav.vue"), `<template><router-link to="/dashboard">Dashboard</router-link></template><script>export default{methods:{go(){this.$router.push('/nested')}}}</script>\n`);
    const graph = analyzeVueRouterResponsibility(fixture);
    assert.equal(graph.framework.router, "vue-router");
    assert.equal(graph.capabilities.hashMode, true);
    assert.equal(graph.capabilities.historyMode, false);
    assert.equal(graph.capabilities.dynamicRouteInjection, true);
    assert.equal(graph.capabilities.roleMeta, true);
    assert.equal(graph.capabilities.routerView, true);
    assert.equal(graph.capabilities.routerLinks, true);
    assert.equal(graph.capabilities.resetRouter, true);
    assert.equal(graph.blockers.length, 0, graph.blockers.join("\n"));
    assert.ok(graph.routes.some((route) => route.path === "/permission" && route.roles.includes("admin")));
    const kinds = new Set(graph.responsibilities.map((item) => item.kind));
    for (const required of ["router-construction", "route-table", "guard-before-each", "guard-redirect", "guard-dynamic-route-injection", "router-view-rendering"]) {
      assert.ok(kinds.has(required as never), `missing ${required}`);
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Vue Router integration patch stays review-only and observes instead of replacing the framework router", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "ui-dismantler-vue-router-patch-"));
  try {
    await mkdir(join(fixture, "router"), { recursive: true });
    await mkdir(join(fixture, "store", "modules"), { recursive: true });
    await writeFile(join(fixture, "router", "index.js"), `import Router from 'vue-router'\nexport const constantRoutes=[{path:'/'}]\nexport const asyncRoutes=[{path:'/admin',meta:{roles:['admin']}}]\nconst router=new Router({routes:constantRoutes})\nexport function resetRouter(){router.matcher=(new Router({routes:constantRoutes})).matcher}\nexport default router\n`);
    const permission = `import router from './router'\nconst whiteList=['/login']\nrouter.beforeEach((to,from,next)=>{router.addRoutes([]);if(to.path==='/private')next('/login?redirect='+to.path);else next()})\nrouter.afterEach(() => {\n  done()\n})\n`;
    await writeFile(join(fixture, "permission.js"), permission);
    await writeFile(join(fixture, "store", "modules", "permission.js"), `export function filterAsyncRoutes(routes,roles){return routes.filter(route=>!route.meta?.roles||roles.includes(route.meta.roles[0]))}\nexport const actions={generateRoutes(){return []}}\n`);
    await writeFile(join(fixture, "App.vue"), `<template><router-view /></template>\n`);
    const graph = analyzeVueRouterResponsibility(fixture);
    const patch = generateVueRouterIntegrationPatch(graph, permission, { sourcePath: "permission.js" });
    assert.equal(patch.metrics.reviewRequired, true);
    assert.equal(patch.metrics.applied, false);
    assert.equal(patch.metrics.blocked, false, patch.metrics.blockingReasons.join("\n"));
    assert.equal(patch.metrics.changedHunks, 2);
    assert.equal(patch.metrics.changedLines, 9, JSON.stringify(patch.metrics, null, 2));
    assert.match(patch.adapter, /frameworkOwned: true/);
    assert.match(patch.adapter, /replacementApplied: false/);
    assert.doesNotMatch(patch.adapter, /history\.pushState|history\.replaceState/);
    assert.match(patch.diff, /installVueRouterContractAdapter/);
    assert.equal(permission.includes("installVueRouterContractAdapter"), false, "source input must remain unchanged");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("Vue Router integration patch blocks when route ownership evidence is incomplete", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "ui-dismantler-vue-router-blocked-"));
  try {
    await writeFile(join(fixture, "permission.js"), `router.afterEach(() => {})\n`);
    const graph = analyzeVueRouterResponsibility(fixture);
    const patch = generateVueRouterIntegrationPatch(graph, `router.afterEach(() => {})\n`);
    assert.equal(patch.metrics.blocked, true);
    assert.ok(patch.metrics.responsibilitiesMissing.includes("router-construction"));
    assert.ok(patch.metrics.blockingReasons.some((reason) => reason.includes("router/index.js")));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("SPA scenario action failures are reported without aborting the complete contract report", async () => {
  const report = await evaluateSpaRouterContract({
    schemaVersion: "1.0",
    baseUrl,
    execution: { actionTimeoutMs: 150 },
    scenarios: [{ id: "missing-action-target", entryPath: "/", steps: [{ action: "click", target: "#missing-target" }], assertions: { path: "/", visibleText: "Home" } }],
  });
  assert.equal(report.passed, false);
  assert.equal(report.scenariosTotal, 1);
  assert.equal(report.results[0]?.passed, false);
  assert.ok(report.results[0]?.assertionFailures.some((failure) => failure.includes("step[0] action=click failed")));
});

test("SPA visual stability scopes DOM and layout quietness to the reviewed screenshot region", async () => {
  const scopedApp = `<!doctype html><html><head><style>body{margin:0}#owned{width:320px;height:180px;background:#2457d6;color:white}#noise{position:absolute;left:500px;top:20px}</style></head><body><main id="owned">Owned stable region</main><aside id="noise">0</aside><script>let n=0;setInterval(()=>{document.getElementById('noise').textContent=String(++n)},20)</script></body></html>`;
  const scopedServer = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(scopedApp); });
  await new Promise<void>((resolve) => scopedServer.listen(0, "127.0.0.1", resolve));
  try {
    const address = scopedServer.address(); if (!address || typeof address === "string") throw new Error("missing scoped stability server address");
    const base = `http://127.0.0.1:${address.port}`;
    const report = await evaluateSpaRouterContract({
      schemaVersion: "1.0", referenceBaseUrl: base, generatedBaseUrl: base,
      visualMatrix: { stabilityTimeoutMs: 350, viewports: [{ id: "desktop", label: "Desktop", width: 1024, height: 768 }] },
      scenarios: [{ id: "scoped-stability", entryPath: "/", steps: [], assertions: { visibleText: "Owned stable region" }, visual: { screenshotAnchor: "#owned", screenshotRegion: "#owned", styleTargets: [{ id: "owned", selector: "#owned" }] } }],
    });
    assert.equal(report.passed, true, JSON.stringify(report.visualMatrix, null, 2));
    assert.equal(report.visualMatrix?.stabilityFailures, 0);
    assert.equal(report.visualMatrix?.scenarios[0]?.viewports[0]?.styles.rate, 1);
    assert.equal(report.visualMatrix?.scenarios[0]?.viewports[0]?.pixels.diffRate, 0);
  } finally {
    await new Promise<void>((resolve, reject) => scopedServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("SPA visual matrix honors reviewed per-scenario viewport scope instead of fabricating unsupported mobile interaction coverage", async () => {
  const viewportApp = `<!doctype html><html><body><main id="view">Viewport scoped</main></body></html>`;
  const viewportServer = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(viewportApp); });
  await new Promise<void>((resolve) => viewportServer.listen(0, "127.0.0.1", resolve));
  try {
    const address = viewportServer.address(); if (!address || typeof address === "string") throw new Error("missing viewport server address");
    const base = `http://127.0.0.1:${address.port}`;
    const report = await evaluateSpaRouterContract({
      schemaVersion: "1.0", referenceBaseUrl: base, generatedBaseUrl: base,
      visualMatrix: { viewports: [{ id: "desktop", label: "Desktop", width: 1024, height: 768 }, { id: "mobile", label: "Mobile", width: 390, height: 844 }] },
      scenarios: [{ id: "desktop-only-route", entryPath: "/", steps: [], assertions: { visibleText: "Viewport scoped" }, visual: { viewports: ["desktop"], screenshotAnchor: "#view", screenshotRegion: "#view", styleTargets: [{ id: "view", selector: "#view" }] } }],
    });
    assert.equal(report.passed, true, JSON.stringify(report.visualMatrix, null, 2));
    assert.equal(report.visualMatrix?.viewportRuns, 1);
    assert.deepEqual(report.visualMatrix?.scenarios[0]?.viewports.map((viewport) => viewport.id), ["desktop"]);
  } finally {
    await new Promise<void>((resolve, reject) => viewportServer.close((error) => error ? reject(error) : resolve()));
  }
});
