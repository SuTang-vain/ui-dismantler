#!/usr/bin/env node
import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(repositoryRoot, "src/skill");
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const target = resolve(argument("--target") ?? `${homedir()}/.codex/skills/ui-dismantler`);
const force = process.argv.includes("--force");

async function requireFile(path, label) {
  try { await access(path); }
  catch { throw new Error(`${label} is unavailable: ${path}`); }
}

await requireFile(resolve(source, "SKILL.md"), "Skill source");
await requireFile(resolve(repositoryRoot, "src/ui_dismantler/__init__.py"), "Python runtime");
await requireFile(resolve(repositoryRoot, "dist-ts/cli.js"), "built TypeScript runtime; run npm run build:ts first");
if (force) await rm(target, { recursive: true, force: true });
await mkdir(dirname(target), { recursive: true });
await cp(source, target, {
  recursive: true,
  errorOnExist: !force,
  force,
  filter: (path) => !path.split(/[\\/]/).includes("__pycache__") && !path.endsWith(".pyc"),
});
await writeFile(resolve(target, ".ui-dismantler-runtime.json"), `${JSON.stringify({
  schemaVersion: "1.0",
  kind: "ui-dismantler-runtime-locator",
  runtimeRoot: repositoryRoot,
}, null, 2)}\n`, "utf8");
console.log(`Installed ui-dismantler Skill: ${target}`);
console.log(`Runtime root: ${repositoryRoot}`);
