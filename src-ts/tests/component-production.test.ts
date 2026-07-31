import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  createComponentLibraryBuildPlan,
  materializeComponentLibrary,
  runComponentLibraryBuild,
  runComponentLibraryRuntimeSmoke,
  validateComponentLibraryBuildPlan,
  type ComponentLibraryBuildPlanInput,
} from "../production/component-library/index.js";

const root = new URL("../../", import.meta.url).pathname;
const benchmarkRoot = resolve(root, "benchmark/lib");

function benchmarkInput(): ComponentLibraryBuildPlanInput {
  const file = (path: string, role: ComponentLibraryBuildPlanInput["files"][number]["role"], publish: boolean) => ({
    path,
    role,
    sourcePath: resolve(benchmarkRoot, path),
    publish,
    reviewed: true,
    provenance: [{ kind: "reviewed-file" as const, reference: `benchmark/lib/${path}` }],
  });
  return {
    schemaVersion: "1.0",
    sourceRoot: benchmarkRoot,
    library: { name: "Glossary Explorer", packageName: "ui-dismantler-glossary-explorer" },
    files: [
      { ...file("package.json", "package-metadata", true), provenance: [{ kind: "generated-metadata", reference: "benchmark/lib/package.json" }] },
      file("src/glossary.js", "runtime", true),
      { ...file("src/glossary.css", "style", true), provenance: [{ kind: "source-style", reference: "benchmark/lib/src/glossary.css" }] },
      file("README.md", "documentation", true),
      file("docs/设计规范.md", "documentation", true),
      file("examples/template.html", "example", false),
      file("examples/case.html", "example", false),
    ],
    smoke: {
      runtimePath: "src/glossary.js",
      globalName: "GlossaryExplorer",
      mountMethod: "mount",
      hostSelector: "#mount",
      options: {},
      cleanupRequired: false,
    },
  };
}

test("Component Library Build Plan is deterministic and records file provenance", async () => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-build-plan-"));
  try {
    const configPath = join(directory, "config.json");
    await writeFile(configPath, "{}", "utf8");
    const first = await createComponentLibraryBuildPlan(benchmarkInput(), configPath);
    const second = await createComponentLibraryBuildPlan(benchmarkInput(), configPath);
    assert.deepEqual(first, second);
    assert.equal(validateComponentLibraryBuildPlan(first).ready, true);
    assert.equal(first.files.find((file) => file.path === "src/glossary.js")?.contentHash.length, 64);
    assert.equal(first.files.find((file) => file.path === "examples/case.html")?.publish, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Component Library Materializer runs Runtime Smoke before structural validation", async () => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-build-runtime-"));
  try {
    const configPath = join(directory, "config.json");
    await writeFile(configPath, "{}", "utf8");
    const plan = await createComponentLibraryBuildPlan(benchmarkInput(), configPath);
    const outputRoot = join(directory, "library");
    const materialized = await materializeComponentLibrary(plan, outputRoot);
    assert.equal(materialized.status, "succeeded");
    const smoke = await runComponentLibraryRuntimeSmoke(plan, outputRoot);
    assert.equal(smoke.passed, true);
    assert.equal(smoke.moduleLoaded, true);
    assert.equal(smoke.mountCalled, true);
    assert.ok(smoke.mountedNodeCount > 0);
    const report = await runComponentLibraryBuild(plan, join(directory, "pipeline"));
    assert.equal(report.status, "succeeded");
    assert.equal(report.smoke?.passed, true);
    assert.equal(report.validation?.ok, true);
    assert.equal(JSON.parse(await readFile(join(directory, "pipeline", ".ui-dismantler", "build-report.json"), "utf8")).kind, "component-library-build-report");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Component Library Build Plan blocks unsafe paths, publishable fixtures, and unresolved review state", async () => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-build-blocked-"));
  try {
    const configPath = join(directory, "config.json");
    await writeFile(configPath, "{}", "utf8");
    const input = benchmarkInput();
    await assert.rejects(() => createComponentLibraryBuildPlan({
      ...input,
      files: input.files.map((file, index) => index === 5 ? { ...file, path: "../fixture.js", publish: true, role: "fixture" as const } : file),
    }, configPath), /must be a safe relative path/);
    const blocked = await createComponentLibraryBuildPlan({
      ...input,
      unresolved: ["component owner requires review"],
    }, configPath);
    const validation = validateComponentLibraryBuildPlan(blocked);
    assert.equal(validation.valid, true);
    assert.equal(validation.ready, false);
    const report = await runComponentLibraryBuild(blocked, join(directory, "output"), { reportPath: join(directory, "blocked-report.json") });
    assert.equal(report.status, "blocked");
    assert.equal(report.materialization, undefined);
    assert.equal(JSON.parse(await readFile(join(directory, "blocked-report.json"), "utf8")).status, "blocked");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("component-build CLI materializes a reviewed plan without publishing examples", async (context) => {
  const directory = await mkdtemp(join("/tmp", "ui-dismantler-build-cli-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = join(directory, "config.json");
  const planPath = join(directory, "plan.json");
  const outputRoot = join(directory, "library");
  const input = benchmarkInput();
  await writeFile(configPath, JSON.stringify(input), "utf8");
  execFileSync(process.execPath, ["dist-ts/cli.js", "component-build-plan", configPath, "--out", planPath], { cwd: root, encoding: "utf8" });
  execFileSync(process.execPath, ["dist-ts/cli.js", "component-build", planPath, "--out-dir", outputRoot], { cwd: root, encoding: "utf8" });
  const packageJson = JSON.parse(await readFile(join(outputRoot, "package.json"), "utf8")) as { files?: string[] };
  assert.equal(packageJson.files?.some((entry) => entry.startsWith("examples")), false);
  assert.equal(JSON.parse(await readFile(join(outputRoot, ".ui-dismantler", "build-report.json"), "utf8")).status, "succeeded");
});
