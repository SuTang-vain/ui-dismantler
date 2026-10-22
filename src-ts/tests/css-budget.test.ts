import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JSDOM, VirtualConsole } from "jsdom";
import { analyzeHtml, stripCssDataUris, truncateCssAtRuleBoundary } from "../analysis/analyzer.js";

function assertCssParses(css: string) {
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error.message));
  new JSDOM(`<!doctype html><style>${css}</style>`, { virtualConsole });
  assert.deepEqual(errors.filter((message) => /parse css/i.test(message)), []);
}

test("truncation lands on a top-level rule boundary and stays parseable", () => {
  const css = `:root{--ink:#111}${".card{color:#111}".repeat(200)}`;
  const result = truncateCssAtRuleBoundary(css, 500);
  assert.equal(result.truncated, true);
  assert.ok(result.text.endsWith("}"), `expected a complete final rule, received tail: ${result.text.slice(-40)}`);
  assert.equal((result.text.match(/{/g) ?? []).length, (result.text.match(/}/g) ?? []).length);
  assertCssParses(result.text);
});

test("an @media block is kept whole or dropped whole, never split", () => {
  const media = `@media(max-width:500px){${".m{display:flex}".repeat(100)}}`;
  const css = `:root{--ink:#111}${media}.after{color:#222}`;
  // Budget lands inside the @media block: everything after :root must be dropped.
  const result = truncateCssAtRuleBoundary(css, 120);
  assert.equal(result.text, ":root{--ink:#111}");
  assertCssParses(result.text);
});

test("braces inside strings and comments never steer the cut", () => {
  const css = `.a{content:"}"}/* }{ */.b{color:#111}${".c{color:#222}".repeat(50)}`;
  const result = truncateCssAtRuleBoundary(css, 60);
  assert.ok(result.text.includes('.a{content:"}"}'), "string brace broke the scan");
  assert.ok(result.text.includes(".b{color:#111}"), "comment brace broke the scan");
  assertCssParses(result.text);
});

test("data URIs are stripped before metering so real rules survive the budget", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "ui-dismantler-css-budget-"));
  context.after(() => rm(dir, { recursive: true, force: true }));
  const dataUri = `data:image/png;base64,${"A".repeat(4096)}`;
  const html = join(dir, "page.html");
  await writeFile(html, `<!doctype html><html><head><style>.bg{background:url("${dataUri}")}:root{--brand:#f386a1}.hero{color:#111}</style></head><body><main><h1>Budget</h1></main></body></html>`, "utf8");
  const manifest = analyzeHtml(html, { maxCssBytes: 400, maxStyleBytes: 400 });
  assert.ok(manifest.warnings.some((warning) => /压缩 1 个 data URI/.test(warning)), manifest.warnings.join(" | "));
  assert.ok(manifest.theme.tokens.some((token) => token.value.toLowerCase() === "#f386a1"), "data URI evicted the real tokens");
});

test("stripCssDataUris reports counts and keeps plain CSS untouched", () => {
  const { text, count } = stripCssDataUris(`.a{background:url(data:image/svg+xml;base64,AAAA)}.b{color:#111}`);
  assert.equal(count, 1);
  assert.ok(text.includes("url(data:,)"));
  const plain = stripCssDataUris(".b{color:#111}");
  assert.equal(plain.count, 0);
  assert.equal(plain.text, ".b{color:#111}");
});
