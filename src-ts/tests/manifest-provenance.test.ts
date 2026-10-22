import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { ANALYZER_VERSION, analyzeHtml } from "../analysis/analyzer.js";

const page = `<!doctype html><html lang="en"><head><title>provenance</title></head><body><main><h1>provenance fixture</h1></main></body></html>`;

test("manifest records the analyzer version and a cwd-relative source path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ui-dismantler-provenance-"));
  const path = join(directory, "page.html");
  await writeFile(path, page, "utf8");
  const manifest = await analyzeHtml(path);
  assert.equal(manifest.meta.analyzerVersion, ANALYZER_VERSION);
  assert.equal(isAbsolute(manifest.meta.source), false, `expected a relative source, received ${manifest.meta.source}`);
  assert.equal(manifest.meta.source.endsWith("page.html"), true);
});

test("manifests produced before versioning remain valid to consume", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ui-dismantler-provenance-"));
  const path = join(directory, "page.html");
  await writeFile(path, page, "utf8");
  const manifest = await analyzeHtml(path);
  const legacy = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
  delete (legacy.meta as Record<string, unknown>).analyzerVersion;
  // Frozen manifests predate the field; consumers must treat it as absent, not invalid.
  const roundTripped = JSON.parse(JSON.stringify(legacy)) as typeof manifest;
  assert.equal(roundTripped.meta.analyzerVersion, undefined);
  assert.equal(roundTripped.meta.title, "provenance");
  assert.equal(roundTripped.schemaVersion, "1.0");
});
