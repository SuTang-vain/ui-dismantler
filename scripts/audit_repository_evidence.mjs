#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const registryPath = resolve(repositoryRoot, "evidence/registry.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const issues = [];

function issue(message) { issues.push(message); }
function sha256(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function repositoryPath(path, label) {
  const absolute = resolve(repositoryRoot, path);
  const rel = relative(repositoryRoot, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || rel.startsWith(sep)) { issue(`${label} escapes the repository: ${path}`); return null; }
  return absolute;
}

function trackedFiles() {
  const raw = execFileSync("git", ["ls-files", "-s", "-z"], { cwd: repositoryRoot, encoding: "utf8" });
  return raw.split("\0").filter(Boolean).map((entry) => {
    const match = entry.match(/^(\d+) ([0-9a-f]+) (\d+)\t(.+)$/);
    if (!match) throw new Error(`cannot parse tracked file entry: ${entry}`);
    const path = match[4];
    const absolute = resolve(repositoryRoot, path);
    return { path, blob: match[2], bytes: existsSync(absolute) ? statSync(absolute).size : 0 };
  });
}

function matchesPattern(path, pattern) {
  const name = basename(path);
  if (pattern.startsWith("*")) return name.endsWith(pattern.slice(1));
  if (pattern.includes("*")) {
    const expression = new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
    return expression.test(name);
  }
  return name === pattern || name.includes(pattern);
}

function matchesClass(path, definition) {
  if (!path.startsWith("examples/")) return false;
  if (definition.match?.contains && !path.includes(definition.match.contains)) return false;
  const patterns = definition.match?.fileNamePatterns;
  if (patterns && !patterns.some((pattern) => matchesPattern(path, pattern))) return false;
  return Boolean(definition.match?.contains || patterns);
}

if (registry.schemaVersion !== "1.0" || registry.kind !== "evidence-registry") issue("evidence/registry.json has an unsupported contract");
if (registry.caseCatalog !== "cases/catalog.json") issue("evidence registry must bind the canonical Case Catalog");
if (!existsSync(resolve(repositoryRoot, registry.caseCatalog))) issue(`case catalog is unavailable: ${registry.caseCatalog}`);

const files = trackedFiles();
for (const file of files) for (const fragment of registry.prohibitedTrackedFragments ?? []) if (file.path.includes(fragment)) issue(`prohibited tracked artifact: ${file.path}`);

const metrics = {};
const evidencePaths = new Set();
for (const definition of registry.classes ?? []) {
  const matched = files.filter((file) => matchesClass(file.path, definition));
  for (const file of matched) evidencePaths.add(file.path);
  const summary = { files: matched.length, bytes: matched.reduce((sum, file) => sum + file.bytes, 0) };
  metrics[definition.id] = summary;
  if (summary.files > definition.budget.maxFiles) issue(`${definition.id} file budget exceeded: ${summary.files} > ${definition.budget.maxFiles}`);
  if (summary.bytes > definition.budget.maxBytes) issue(`${definition.id} byte budget exceeded: ${summary.bytes} > ${definition.budget.maxBytes}`);
}

const exceptions = new Map((registry.oversizedExceptions ?? []).map((item) => [item.path, item]));
const threshold = registry.oversizedEvidenceThresholdBytes;
for (const path of evidencePaths) {
  const file = files.find((item) => item.path === path);
  if (!file || file.bytes <= threshold) continue;
  const exception = exceptions.get(path);
  if (!exception) { issue(`oversized evidence lacks reviewed exception: ${path} (${file.bytes} bytes)`); continue; }
  const absolute = repositoryPath(path, "oversized evidence");
  if (absolute && sha256(absolute) !== exception.sha256) issue(`oversized evidence identity mismatch: ${path}`);
}
for (const [path, exception] of exceptions) {
  const file = files.find((item) => item.path === path);
  if (!file) { issue(`oversized exception points to an untracked file: ${path}`); continue; }
  if (file.bytes <= threshold) issue(`oversized exception is no longer necessary: ${path}`);
  if (typeof exception.reason !== "string" || !exception.reason.trim()) issue(`oversized exception lacks a review reason: ${path}`);
}

const duplicateBlobs = new Map();
for (const file of files.filter((item) => evidencePaths.has(item.path))) {
  const group = duplicateBlobs.get(file.blob) ?? [];
  group.push(file);
  duplicateBlobs.set(file.blob, group);
}
const duplicates = [...duplicateBlobs.values()].filter((group) => group.length > 1);
const duplicateSummary = {
  groups: duplicates.length,
  redundantBytes: duplicates.reduce((sum, group) => sum + group[0].bytes * (group.length - 1), 0),
};

const report = { schemaVersion: "1.0", kind: "evidence-audit", metrics, oversizedExceptions: exceptions.size, duplicates: duplicateSummary, ok: issues.length === 0, issues };
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  for (const [id, metric] of Object.entries(metrics)) console.log(`[evidence] ${id}: ${metric.files} files, ${metric.bytes} bytes`);
  console.log(`[evidence] duplicate blobs: ${duplicateSummary.groups} groups, ${duplicateSummary.redundantBytes} redundant bytes`);
  if (issues.length === 0) console.log(`[evidence] valid: ${evidencePaths.size} managed tracked files, ${exceptions.size} oversized exceptions`);
  else for (const message of issues) console.error(`[evidence] ${message}`);
}
if (issues.length > 0) process.exitCode = 1;
