import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { test } from "node:test";
import {
  ARTIFACT_ROOT_ENV,
  createRegressionArtifactDirectory,
  normalizeArtifactScope,
  resolveRuntimeArtifactDirectory,
} from "../core/artifacts/runtime-root.js";

function isWithin(parent: string, candidate: string): boolean {
  const path = relative(resolve(parent), resolve(candidate));
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

test("runtime artifacts default to unique system temporary directories and clean up", () => {
  const tempRoot = join(tmpdir(), `ui-dismantler-runtime-artifacts-${Date.now()}`);
  const first = createRegressionArtifactDirectory("case/with traversal ..", { environment: {}, tempRoot });
  const second = createRegressionArtifactDirectory("case/with traversal ..", { environment: {}, tempRoot });
  assert.equal(first.source, "system-temp");
  assert.equal(first.retained, false);
  assert.equal(isWithin(tempRoot, first.path), true);
  assert.notEqual(first.path, second.path);
  assert.equal(existsSync(first.path), true);
  first.cleanup();
  first.cleanup();
  second.cleanup();
  assert.equal(existsSync(first.path), false);
  assert.equal(existsSync(second.path), false);
});

test("external artifact root overrides configured paths and retains CI evidence", () => {
  const externalRoot = join(tmpdir(), `ui-dismantler-external-artifacts-${Date.now()}`);
  const lease = resolveRuntimeArtifactDirectory("examples/case/visual-artifacts", "gold/case", {
    environment: { [ARTIFACT_ROOT_ENV]: externalRoot },
  });
  assert.equal(lease.source, "external-root");
  assert.equal(lease.retained, true);
  assert.equal(isWithin(externalRoot, lease.path), true);
  writeFileSync(join(lease.path, "report.json"), "{}");
  lease.cleanup();
  assert.equal(existsSync(join(lease.path, "report.json")), true);
  rmSync(externalRoot, { recursive: true, force: true });
});

test("repository-relative and repository-contained artifact paths are redirected to temp", () => {
  const repositoryRoot = join(tmpdir(), `ui-dismantler-repository-${Date.now()}`);
  const tempRoot = join(tmpdir(), `ui-dismantler-safe-artifacts-${Date.now()}`);
  mkdirSync(join(repositoryRoot, "examples", "case"), { recursive: true });
  const relativeLease = resolveRuntimeArtifactDirectory("examples/case/visual-artifacts", "relative", {
    environment: {}, repositoryRoot, tempRoot,
  });
  const containedLease = resolveRuntimeArtifactDirectory(join(repositoryRoot, "examples", "case", "visual-artifacts"), "contained", {
    environment: {}, repositoryRoot, tempRoot,
  });
  assert.equal(relativeLease.source, "system-temp");
  assert.equal(containedLease.source, "system-temp");
  assert.equal(isWithin(repositoryRoot, relativeLease.path), false);
  assert.equal(isWithin(repositoryRoot, containedLease.path), false);
  relativeLease.cleanup();
  containedLease.cleanup();
});

test("explicit absolute artifact paths outside the repository remain caller-owned", () => {
  const repositoryRoot = join(tmpdir(), `ui-dismantler-repository-${Date.now()}`);
  const explicitPath = join(tmpdir(), `ui-dismantler-explicit-artifacts-${Date.now()}`);
  const lease = resolveRuntimeArtifactDirectory(explicitPath, "explicit", { environment: {}, repositoryRoot });
  assert.equal(lease.path, resolve(explicitPath));
  assert.equal(lease.source, "explicit-absolute");
  assert.equal(lease.retained, true);
  lease.cleanup();
  assert.equal(existsSync(explicitPath), true);
  rmSync(explicitPath, { recursive: true, force: true });
});

test("artifact scope normalization removes traversal and unsafe separators", () => {
  assert.equal(normalizeArtifactScope("../../Vue XS Admin / login"), "Vue-XS-Admin-login");
  assert.equal(normalizeArtifactScope("..."), "run");
  assert.ok(normalizeArtifactScope("x".repeat(120)).length <= 80);
});

test("external artifact root must be absolute", () => {
  assert.throws(
    () => createRegressionArtifactDirectory("case", { environment: { [ARTIFACT_ROOT_ENV]: "relative/artifacts" } }),
    /must be an absolute path/,
  );
});
