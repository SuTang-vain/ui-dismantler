import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildDataSurfaceManifest,
  canonicalJson,
  serializeDataSurfaceManifest,
  validateDataSurfaceManifest,
  type DataSurfaceManifest,
} from "../skills/data-surface-manifest/index.js";
import type { ApiFixtureResponsibilityGraph } from "../planning/api-fixture-responsibility.js";

const root = new URL("../../", import.meta.url).pathname;

function emptyManifest(): DataSurfaceManifest {
  return buildDataSurfaceManifest({
    components: [],
    cardinality: { schemaVersion: "1.0", kind: "data-cardinality-responsibility-graph", components: [], metrics: { components: 0, staticBindings: 0, cardinalityEvidence: 0, templateRepeats: 0, unresolvedReferences: 0 }, reviewRequired: false },
    api: { schemaVersion: "1.0", kind: "api-fixture-responsibility-graph", reviewRequired: true, sourceRoot: "/tmp/source", responsibilities: [], candidates: [], responseFlows: [], unresolved: [], metrics: { componentsScanned: 0, importedApiCalls: 0, apiCandidates: 0, actualApiWrappers: 0, frameworkComposables: 0, localStateStoreHelpers: 0, utilityFunctions: 0, unresolvedLocalTransports: 0, responseFlows: 0, dynamicRouteFlows: 0, matchedEndpoints: 0, matchedFixtures: 0, materializedBindings: 0, renderedFields: 0, transportPrefixesInferred: 0, runtimeSelectionsInferred: 0, proxyRoutesInferred: 0, proxyTargetsInferred: 0, proxyRewriteRulesInferred: 0, proxyAstRoutesInferred: 0, proxyFallbackRoutesInferred: 0, proxyParseDiagnostics: 0 }, reviewReasons: [] } as ApiFixtureResponsibilityGraph,
    identity: { sourceRoot: "/tmp/frozen-source", sourceCommit: "source-commit", generatedAt: "2026-07-30T00:00:00.000Z" },
  });
}

test("Data Surface serializer is canonical and byte-stable", () => {
  assert.equal(canonicalJson({ b: 2, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":2}');
  const manifest = emptyManifest();
  const first = serializeDataSurfaceManifest(manifest);
  const second = serializeDataSurfaceManifest(JSON.parse(first) as DataSurfaceManifest);
  assert.equal(first, second);
  assert.equal(validateDataSurfaceManifest(JSON.parse(first)).valid, true);
  assert.equal(first.includes("generatedAt"), true);
  assert.equal(manifest.identity.fixtureHashKind, "responsibility-graph");
  assert.equal(manifest.identity.configurationHashKind, "responsibility-graph");
  assert.deepEqual(Object.keys(manifest.identity.skillVersions).sort(), ["api-responsibility", "component-ownership", "data-cardinality", "data-surface-manifest"]);
});

test("Data Surface validator rejects Data Pack fields, raw values, and inconsistent metrics", () => {
  const manifest = emptyManifest();
  const forbidden = { ...manifest, entities: [] } as unknown as DataSurfaceManifest;
  assert.equal(validateDataSurfaceManifest(forbidden).issues.some((item) => item.path === "entities"), true);
  const inconsistent = { ...manifest, metrics: { ...manifest.metrics, surfaces: 1 } };
  assert.equal(validateDataSurfaceManifest(inconsistent).issues.some((item) => item.path === "metrics.surfaces"), true);
  const rawValue = { ...manifest, surfaces: [{ id: "static:x", source: { primary: "module-static-binding", static: { binding: "x", value: ["raw"] } } }] } as unknown as DataSurfaceManifest;
  assert.equal(validateDataSurfaceManifest(rawValue).issues.some((item) => item.path === "surfaces[0].source.static.value"), true);
  assert.throws(() => serializeDataSurfaceManifest(forbidden));
});

test("data-surface CLI emits and validates a deterministic manifest", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "ui-dismantler-data-surface-cli-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, "sfc.json"), JSON.stringify({ kind: "sfc-visual-responsibility-graph", components: [] }));
  writeFileSync(join(directory, "api.json"), JSON.stringify({ kind: "api-fixture-responsibility-graph", sourceRoot: "<external-source>", responsibilities: [], responseFlows: [], unresolved: [], reviewReasons: [] }));
  const args = ["dist-ts/cli.js", "data-surface", join(directory, "sfc.json"), "--api", join(directory, "api.json"), "--source-root", "/tmp/frozen-source", "--source-commit", "source-commit"];
  execFileSync(process.execPath, [...args, "--out", join(directory, "first.json")], { cwd: root, encoding: "utf8" });
  execFileSync(process.execPath, [...args, "--out", join(directory, "second.json")], { cwd: root, encoding: "utf8" });
  const first = readFileSync(join(directory, "first.json"), "utf8");
  assert.equal(first, readFileSync(join(directory, "second.json"), "utf8"));
  assert.equal(first.includes("generatedAt"), false);
  execFileSync(process.execPath, ["dist-ts/cli.js", "data-surface-validate", join(directory, "first.json")], { cwd: root, encoding: "utf8" });
  const requireReady = execFileSync(process.execPath, ["dist-ts/cli.js", "data-surface-validate", join(directory, "first.json"), "--require-ready"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.match(requireReady, /handoff=READY/);
});

test("frozen Vue XS Admin Data Surface Manifest is portable, deterministic, and review-gated", () => {
  const path = join(root, "examples/spa-router-regressions/vue-xs-admin-blind/data-surface.manifest.json");
  const serialized = readFileSync(path, "utf8");
  const manifest = JSON.parse(serialized) as DataSurfaceManifest;
  const report = validateDataSurfaceManifest(manifest);
  assert.equal(report.valid, true);
  assert.equal(manifest.identity.sourceRoot, "blind-cases/vue-xs-admin");
  assert.equal(manifest.identity.sourceCommit, "99027d176d3c23643bd4c25ba00ec77d2b72bb56");
  assert.equal(manifest.metrics.surfaces, 12);
  assert.equal(manifest.metrics.apiSurfaces, 1);
  assert.equal(manifest.metrics.staticSurfaces, 4);
  assert.equal(manifest.metrics.propSurfaces, 3);
  assert.equal(manifest.metrics.runtimeSurfaces, 4);
  assert.equal(manifest.metrics.reviewedFixtures, 1);
  assert.equal(manifest.metrics.fields, 16);
  assert.equal(manifest.metrics.unresolved, 4);
  assert.equal(manifest.review?.blockers.length, 4);
  assert.equal(manifest.review?.policyNotices.length, 18);
  assert.equal(manifest.reviewRequired, true);
  assert.equal(serializeDataSurfaceManifest(manifest), serialized);
  assert.equal("entities" in (manifest as unknown as Record<string, unknown>), false);
  assert.equal("aliases" in (manifest as unknown as Record<string, unknown>), false);
});
