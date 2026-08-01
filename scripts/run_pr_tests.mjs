#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const testRoot = resolve(repositoryRoot, "dist-ts/tests");
const browserSerial = new Set([
  "case-regression.test.js",
  "component-production.test.js",
  "spa-router.test.js",
  "visual-evaluation-skill.test.js",
  "visual-quality.test.js",
]);

if (!existsSync(testRoot)) {
  console.error("[pr-tests] dist-ts/tests is unavailable; run npm run build:ts first");
  process.exit(1);
}
const all = readdirSync(testRoot).filter((name) => name.endsWith(".test.js")).sort();
for (const name of browserSerial) if (!all.includes(name)) {
  console.error(`[pr-tests] reviewed browser test file is unavailable: ${name}`);
  process.exit(1);
}
const deterministic = all.filter((name) => !browserSerial.has(name)).map((name) => resolve(testRoot, name));
const browser = all.filter((name) => browserSerial.has(name)).map((name) => resolve(testRoot, name));

function run(label, args) {
  console.log(`[pr-tests] ${label}`);
  execFileSync(process.execPath, args, { cwd: repositoryRoot, stdio: "inherit" });
}

if (deterministic.length > 0) run(`parallel deterministic files: ${deterministic.length}`, ["--test", ...deterministic]);
if (browser.length > 0) run(`serial browser files: ${browser.length}`, ["--test", "--test-concurrency=1", ...browser]);
