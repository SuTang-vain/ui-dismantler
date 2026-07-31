#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";

const root = resolve(new URL("..", import.meta.url).pathname);
const packageRoot = join(root, "benchmark", "lib");
const sourceRoot = join(packageRoot, "src");
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const runtime = readFileSync(join(sourceRoot, "glossary.js"), "utf8");
const fixture = readFileSync(join(root, "benchmark", "fixtures", "glossary-demo.js"), "utf8");

assert.deepEqual(packageJson.files, ["src", "README.md", "docs"], "release package must exclude demos and fixtures");
assert.equal(/GlossaryDemoFixture|CSS specificity|Frontend Patterns/.test(runtime), false, "publishable runtime must not contain reviewed demo records");
assert.equal(/DEFAULTS\s*=/.test(runtime), false, "publishable runtime must not provide a data-bearing default object");
assert.match(fixture, /GlossaryDemoFixture/);

const dom = new JSDOM("<!doctype html><html><body><div id='mount'></div></body></html>", {
  runScripts: "outside-only",
  pretendToBeVisual: true,
  url: "http://localhost/",
});
dom.window.eval(runtime);
const emptyMount = dom.window.document.getElementById("mount");
const emptyInstance = dom.window.GlossaryExplorer.mount(emptyMount, {});
assert.equal(emptyMount.querySelector(".sg-frame")?.getAttribute("data-state"), "empty");
assert.equal(emptyInstance.root?.querySelector(".sg-status"), null);

dom.window.eval(fixture);
const readyMount = dom.window.document.createElement("div");
dom.window.document.body.appendChild(readyMount);
dom.window.GlossaryExplorer.mount(readyMount, dom.window.GlossaryDemoFixture);
assert.equal(readyMount.querySelector(".sg-frame")?.getAttribute("data-state"), "ready");
assert.equal(readyMount.querySelectorAll(".sg-tab").length, 5);

const pack = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: packageRoot, encoding: "utf8" }))[0];
const packagePaths = pack.files.map((entry) => entry.path);
assert.equal(packagePaths.some((path) => path.startsWith("examples/") || path.startsWith("fixtures/")), false, "package artifact must exclude consumers and fixtures");
for (const expected of ["src/glossary.js", "src/glossary.css", "README.md", "docs/设计规范.md"]) assert.ok(packagePaths.includes(expected), `package artifact missing ${expected}`);

console.log(JSON.stringify({
  ok: true,
  packageFiles: packagePaths,
  emptyState: "empty",
  fixtureState: "ready",
  fixtureOutsideSource: true,
}, null, 2));
