import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeHtml } from "../analysis/analyzer.js";
import { planComponents } from "../planning/components.js";
import { materializeComponentLibrary } from "../production/html-materializer.js";
import { validateLibrary } from "../validation/library.js";

const filler = "This paragraph carries enough visible copy for the section to count as a content region. ".repeat(6);

function demoPage(): string {
  const fontB64 = "AAEAAAASAQAABAAgR0RFRgAAAA" + "A".repeat(900);
  return `<!doctype html><html lang="en"><head><title>Demo - Acme</title><style>
@font-face{font-family:"DemoFont";src:url("data:font/woff2;base64,${fontB64}");font-display:swap}
:root{--brand:#3366ff;--ink:#1a1a1a}
body{margin:0}
.nav-links{display:flex;gap:12px}
.nav-links a{color:#3366ff;text-decoration:none}
.hero{padding:48px 20px;background:var(--brand);color:#fff}
.hero h1{font-size:48px;margin:0}
.hero .lede{color:#1a1a1a22}
@media (max-width: 600px){ .hero h1{font-size:30px} }
.block{padding:32px 20px;border-bottom:1px solid #e5e5e5}
.block h2{font-size:28px;margin:0 0 12px}
.site-foot{display:flex;gap:16px;padding:20px}
</style></head><body>
<div class="app">
  <nav class="site-nav"><div class="nav-links"><a href="/a">Alpha</a><a href="/b">Beta</a><a href="/c">Gamma</a></div></nav>
  <div class="hero"><h1>Acme hero headline</h1><p class="lede">A generated library fixture.</p><a class="cta" href="/start">Get started</a></div>
  <div class="content">
    <div class="block"><div class="head"><h2>First section</h2></div><div class="copy"><p>${filler}</p><a href="/one">Read more</a></div></div>
    <div class="block"><div class="head"><h2>Second section</h2></div><div class="copy"><p>${filler}</p><img src="data:image/png;base64,${"A".repeat(2048)}" alt="demo"></div></div>
    <div class="block"><div class="head"><h2>Third section</h2></div><div class="copy"><p>${filler}</p><canvas id="demo-canvas"></canvas></div></div>
    <div class="block"><div class="head"><h2>Fourth section</h2></div><div class="copy"><p>${filler}</p><div style="position:relative"><img src="data:image/png;base64,${"B".repeat(1024)}" alt="fill" style="display:block;width:100%;height:100%;object-fit:cover"></div></div></div>
  </div>
  <footer class="site-foot"><a href="/terms">Terms</a><a href="/privacy">Privacy</a></footer>
</div>
</body></html>`;
}

async function materializeDemo() {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-materialize-"));
  const htmlPath = join(dir, "page.html");
  await writeFile(htmlPath, demoPage(), "utf8");
  const manifest = analyzeHtml(htmlPath);
  const plan = planComponents(manifest, { lineBudget: 2000 });
  const libDir = join(dir, "lib");
  const report = await materializeComponentLibrary(htmlPath, { plan, manifest, libName: "AcmeSite", outDir: libDir });
  return { dir, libDir, report, plan };
}

test("materializer emits a complete library skeleton with extracted data and assets", async (context) => {
  const { dir, libDir, report } = await materializeDemo();
  context.after(() => rm(dir, { recursive: true, force: true }));
  assert.equal(report.kind, "html-materializer-report");
  assert.ok(report.components.length >= 4, JSON.stringify(report.components));
  for (const file of ["src/AcmeSite.css", "src/AcmeSite.js", "examples/acme-site.html", "data/data.json", "README.md", "docs/设计规范.md"]) {
    assert.ok(report.files.includes(file), `missing ${file}`);
  }
  assert.ok(report.slots.texts > 10, "text slots extracted");
  assert.ok(report.slots.links >= 5, "link slots extracted");
  assert.equal(report.slots.images, 2);
  assert.equal(report.assets.filter((name) => name.endsWith(".png")).length, 2, "img data URI assets externalized");
  assert.ok(report.assets.some((name) => name.endsWith(".woff2")), "font asset externalized");
  const data = JSON.parse(await readFile(join(libDir, "data", "data.json"), "utf8"));
  const values = Object.values(data);
  assert.ok(values.some((value) => String(value).includes("Acme hero headline")), "hero copy in data.json");
  assert.ok(values.some((value) => String(value).endsWith(".png")), "asset path in data.json");
});

test("generated library passes the static validation contract", async (context) => {
  const { dir, libDir } = await materializeDemo();
  context.after(() => rm(dir, { recursive: true, force: true }));
  const report = validateLibrary(libDir);
  const failed = report.results.filter((result) => !result.passed);
  assert.deepEqual(failed.map((result) => `${result.id}: ${result.detail}`), []);
});

test("iframes and canvases become labeled placeholders and never leak raw markup", async (context) => {
  const { dir, libDir } = await materializeDemo();
  context.after(() => rm(dir, { recursive: true, force: true }));
  const js = await readFile(join(libDir, "src", "AcmeSite.js"), "utf8");
  assert.ok(js.includes('data-sg-unmodeled=\\"canvas\\"'), "canvas placeholder present");
  assert.ok(!js.includes("</script"), "no raw closing script tag inside JS strings");
  const example = await readFile(join(libDir, "examples", "acme-site.html"), "utf8");
  assert.ok(!/<\/script[\s\S]{0,200}<\/script[\s\S]{0,200}<\/script[\s\S]{0,200}</.test(example.replace(/<\/script>/g, "")), "example island has no nested script close");
});

test("class renaming is deterministic and colors normalize to variables", async (context) => {
  const first = await materializeDemo();
  const second = await materializeDemo();
  context.after(() => Promise.all([rm(first.dir, { recursive: true, force: true }), rm(second.dir, { recursive: true, force: true })]).then(() => undefined));
  const cssA = await readFile(join(first.libDir, "src", "AcmeSite.css"), "utf8");
  const cssB = await readFile(join(second.libDir, "src", "AcmeSite.css"), "utf8");
  assert.equal(cssA, cssB, "materializer output must be deterministic");
  assert.ok(cssA.includes("--sg-primary:"), "core var present");
  assert.ok(cssA.includes("var(--sg-c-3366ff)"), "hex rewritten to variable");
  const outsideRoot = cssA.replace(/:root\s*\{[^}]*\}/g, "");
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(outsideRoot.replace(/var\([^)]*\)/g, "")), "no hardcoded hex outside :root");
  assert.ok(cssA.includes(".sg-"), "sg classes present");
  assert.ok(!/\.nav-links|\.site-foot|\.hero\b/.test(cssA), "original class names fully remapped");
});

test("font data URIs externalize to assets and runtime-dependent geometry is reported", async (context) => {
  const { dir, libDir, report } = await materializeDemo();
  context.after(() => rm(dir, { recursive: true, force: true }));
  assert.ok(report.assets.some((name) => name.endsWith(".woff2")), "font asset extracted");
  const css = await readFile(join(libDir, "src", "AcmeSite.css"), "utf8");
  assert.ok(css.includes("../assets/asset-"), "font url rewritten to asset path");
  assert.ok(!css.includes("data:font"), "no inline font data URI remains");
  assert.equal(report.css.parseErrors, 0);
  assert.ok(report.deferredGeometry.length >= 1, "100%×100% media without statically sized ancestor must be reported");
  assert.ok(report.warnings.some((warning) => warning.includes("运行时 JS 决定")));
});

test("components missing from the DOM are reported, not silently dropped", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-materialize-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const htmlPath = join(dir, "page.html");
  await writeFile(htmlPath, demoPage(), "utf8");
  const manifest = analyzeHtml(htmlPath);
  const plan = planComponents(manifest, { lineBudget: 2000 });
  plan.components.push({ ...plan.components[0], id: "ghost-1", componentName: "Ghost", sourceSelector: "#does-not-exist", sourceSelectors: ["#does-not-exist"] });
  const report = await materializeComponentLibrary(htmlPath, { plan, manifest, libName: "AcmeSite", outDir: join(dir, "lib") });
  assert.ok(report.warnings.some((warning) => warning.includes("Ghost")), JSON.stringify(report.warnings));
  assert.ok(!report.components.includes("Ghost"));
});
