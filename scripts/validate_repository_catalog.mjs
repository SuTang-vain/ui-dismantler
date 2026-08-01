#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const catalogPath = resolve(repositoryRoot, "cases/catalog.json");
const registryPath = resolve(repositoryRoot, "benchmarks/registry.json");
const managedRoots = [
  "examples/cases",
  "examples/dispatch-experiments",
  "examples/spa-router-regressions",
  "examples/performance-experiments",
];

function fail(message) {
  console.error(`[catalog] ${message}`);
  process.exitCode = 1;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`cannot parse ${relative(repositoryRoot, path)}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function repositoryPath(path, label) {
  if (typeof path !== "string" || !path.trim()) {
    fail(`${label} must be a non-empty repository-relative path`);
    return null;
  }
  const absolute = resolve(repositoryRoot, path);
  const rel = relative(repositoryRoot, absolute);
  if (rel.startsWith(`..${sep}`) || rel === ".." || rel.startsWith(sep)) {
    fail(`${label} escapes the repository: ${path}`);
    return null;
  }
  return absolute;
}

function validateCaseCatalog(catalog) {
  if (!catalog) return new Map();
  if (catalog.schemaVersion !== "1.0" || catalog.kind !== "case-catalog") fail("cases/catalog.json has an unsupported contract");
  if (!Array.isArray(catalog.cases)) {
    fail("cases/catalog.json cases must be an array");
    return new Map();
  }
  const cases = new Map();
  const paths = new Set();
  for (const item of catalog.cases) {
    if (!item || typeof item !== "object") { fail("catalog case must be an object"); continue; }
    if (typeof item.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(item.id)) { fail(`invalid case id: ${String(item.id)}`); continue; }
    if (cases.has(item.id)) fail(`duplicate case id: ${item.id}`);
    const absolute = repositoryPath(item.path, `case ${item.id} path`);
    if (!absolute || !existsSync(absolute) || !statSync(absolute).isDirectory()) fail(`case ${item.id} directory is unavailable: ${item.path}`);
    if (paths.has(item.path)) fail(`duplicate case path: ${item.path}`);
    paths.add(item.path);
    if (!Array.isArray(item.protocols) || item.protocols.some((value) => typeof value !== "string")) fail(`case ${item.id} protocols must be string ids`);
    const entry = item.source?.entry;
    if (entry) {
      const source = repositoryPath(`${item.path}/${entry}`, `case ${item.id} source entry`);
      if (!source || !existsSync(source)) fail(`case ${item.id} source entry is unavailable: ${entry}`);
    }
    const identity = item.source?.identity;
    if (identity) {
      const source = repositoryPath(`${item.path}/${identity}`, `case ${item.id} source identity`);
      if (!source || !existsSync(source)) fail(`case ${item.id} source identity is unavailable: ${identity}`);
    }
    for (const evidence of item.frozenEvidence ?? []) {
      const path = repositoryPath(`${item.path}/${evidence}`, `case ${item.id} evidence`);
      if (!path || !existsSync(path)) fail(`case ${item.id} frozen evidence is unavailable: ${evidence}`);
    }
    cases.set(item.id, item);
  }

  const discovered = new Set();
  for (const root of managedRoots) {
    const absoluteRoot = resolve(repositoryRoot, root);
    if (!existsSync(absoluteRoot)) continue;
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) discovered.add(`${root}/${entry.name}`);
    }
  }
  for (const path of discovered) if (!paths.has(path)) fail(`unregistered case directory: ${path}`);
  for (const path of paths) if (!discovered.has(path)) fail(`catalog path is outside managed case roots: ${path}`);
  return cases;
}

function validateBenchmarkRegistry(registry, cases) {
  if (!registry) return;
  if (registry.schemaVersion !== "1.0" || registry.kind !== "benchmark-registry") fail("benchmarks/registry.json has an unsupported contract");
  if (registry.caseCatalog !== "cases/catalog.json") fail("benchmark registry must bind the canonical case catalog");
  if (!Array.isArray(registry.protocols)) { fail("benchmark registry protocols must be an array"); return; }
  const protocolIds = new Set();
  for (const reference of registry.protocols) {
    if (!reference || typeof reference.id !== "string" || typeof reference.path !== "string") { fail("invalid benchmark protocol reference"); continue; }
    if (protocolIds.has(reference.id)) fail(`duplicate benchmark protocol id: ${reference.id}`);
    protocolIds.add(reference.id);
    const path = repositoryPath(reference.path, `protocol ${reference.id}`);
    if (!path || !existsSync(path)) { fail(`benchmark protocol is unavailable: ${reference.path}`); continue; }
    const protocol = readJson(path);
    if (!protocol) continue;
    if (protocol.schemaVersion !== "1.0" || protocol.kind !== "benchmark-protocol" || protocol.id !== reference.id) fail(`benchmark protocol identity mismatch: ${reference.path}`);
    if (!Array.isArray(protocol.commands) || protocol.commands.length === 0 || protocol.commands.some((command) => typeof command !== "string" || !command.trim())) fail(`protocol ${reference.id} must declare commands`);
    if (!Array.isArray(protocol.caseIds)) { fail(`protocol ${reference.id} caseIds must be an array`); continue; }
    for (const caseId of protocol.caseIds) {
      const item = cases.get(caseId);
      if (!item) fail(`protocol ${reference.id} references unknown case: ${caseId}`);
      else if (!item.protocols.includes(reference.id)) fail(`case ${caseId} does not declare protocol ${reference.id}`);
    }
    for (const item of cases.values()) if (item.protocols.includes(reference.id) && !protocol.caseIds.includes(item.id)) fail(`protocol ${reference.id} omits declared case: ${item.id}`);
    for (const parent of protocol.extends ?? []) if (typeof parent !== "string") fail(`protocol ${reference.id} extends must contain string ids`);
  }

  for (const reference of registry.protocols) {
    const protocol = readJson(resolve(repositoryRoot, reference.path));
    for (const parent of protocol?.extends ?? []) if (!protocolIds.has(parent)) fail(`protocol ${reference.id} extends unknown protocol: ${parent}`);
  }
  for (const item of cases.values()) for (const protocol of item.protocols) if (!protocolIds.has(protocol)) fail(`case ${item.id} references unknown protocol: ${protocol}`);
}

const cases = validateCaseCatalog(readJson(catalogPath));
validateBenchmarkRegistry(readJson(registryPath), cases);
if (!process.exitCode) console.log(`[catalog] valid: ${cases.size} cases, ${readJson(registryPath)?.protocols?.length ?? 0} protocols`);
