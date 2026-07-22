import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { after, test } from "node:test";
import { evaluateBrowserQuality, evaluateBrowserQualityMatrix, evaluateLibrarySelectorCoverage, evaluateScenarioBrowserQualityMatrix } from "../evaluation/browser.js";
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
