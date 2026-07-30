import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeHtml } from "../analysis/analyzer.js";
import { defineSkill, SkillExecutionError } from "../core/skills/contract.js";
import { SkillRegistry } from "../core/skills/registry.js";
import type { SpaRouterContractConfig, SpaRouterContractReport } from "../evaluation/spa-router.js";
import type { SpaAuthGuardResponsibilityAnalysis } from "../planning/spa-auth-guard-responsibility.js";
import { analyzeSfcStateResponsibilities, type SfcStateResponsibility } from "../planning/sfc-state-responsibility.js";
import { createDefaultTaskProfileRegistry } from "../profiles/default-profiles.js";
import { createAuthGuardSkill } from "../skills/auth-guard.js";
import { createDefaultSkillRegistry } from "../skills/default-registry.js";
import { createSourceStructureSkill, sourceStructureSkill, type SourceStructureAnalyzer } from "../skills/source-structure.js";
import { createSpaRouterSkill } from "../skills/spa-router.js";
import { stateResponsibilitySkill } from "../skills/state-responsibility.js";
import type { Manifest } from "../types.js";

test("default Skill Registry exposes deterministic capability manifests", () => {
  const registry = createDefaultSkillRegistry();
  assert.deepEqual(registry.list().map((manifest) => manifest.id), ["auth-guard", "source-structure", "spa-router", "state-responsibility"]);
  assert.equal(registry.get("source-structure").contractVersion, "1.0");
  assert.equal(registry.get("spa-router").optionalDependencies.includes("source-structure"), true);
  assert.deepEqual(registry.resolve(["auth-guard"]).map((manifest) => manifest.id), ["source-structure", "state-responsibility", "auth-guard"]);
});

test("source-structure wrapper preserves the existing analyzer output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ui-dismantler-source-skill-"));
  const htmlPath = join(directory, "source.html");
  await writeFile(htmlPath, `<!doctype html><html lang="en"><head><title>Skill fixture</title><style>:root{--accent:#123456}.panel{display:grid}</style></head><body><main><section class="panel"><h1>Skill fixture</h1><button data-action="toggle">Toggle</button></section></main></body></html>`, "utf8");
  const expected = analyzeHtml(htmlPath, { profile: "skill-test" });
  const actual = await sourceStructureSkill.execute({ htmlPath, options: { profile: "skill-test" } });
  assert.deepEqual(actual, expected);
});

test("source-structure factory forwards inputs without transforming output", async () => {
  const marker = { schemaVersion: "1.0", marker: true } as unknown as Manifest;
  const calls: unknown[] = [];
  const analyzer: SourceStructureAnalyzer = (htmlPath, options) => {
    calls.push({ htmlPath, options });
    return marker;
  };
  const skill = createSourceStructureSkill(analyzer);
  const output = await skill.execute({ htmlPath: "/tmp/source.html", options: { minimal: true } });
  assert.equal(output, marker);
  assert.deepEqual(calls, [{ htmlPath: "/tmp/source.html", options: { minimal: true } }]);
});

test("state-responsibility wrapper preserves structural state analysis", async () => {
  const script = `const open = ref(false); function showEditor(){ open.value = true } function hideEditor(){ open.value = false }`;
  const expected = analyzeSfcStateResponsibilities(script);
  const actual = await stateResponsibilitySkill.execute({ script });
  assert.deepEqual(actual, expected);
});

test("auth-guard wrapper forwards source ownership input without transforming output", async () => {
  const marker = { evidence: [], marker: true } as unknown as SpaAuthGuardResponsibilityAnalysis;
  const calls: string[] = [];
  const skill = createAuthGuardSkill((sourceRoot) => {
    calls.push(sourceRoot);
    return marker;
  });
  const output = await skill.execute({ sourceRoot: "/tmp/spa-source" });
  assert.equal(output, marker);
  assert.deepEqual(calls, ["/tmp/spa-source"]);
});

test("spa-router wrapper forwards config and returns the evaluator report by identity", async () => {
  const config = { reference: { baseUrl: "http://reference.test" }, generated: { baseUrl: "http://generated.test" }, scenarios: [] } as unknown as SpaRouterContractConfig;
  const report = { passed: true, marker: "existing-report" } as unknown as SpaRouterContractReport;
  const calls: unknown[] = [];
  const skill = createSpaRouterSkill(async (receivedConfig, options) => {
    calls.push({ receivedConfig, options });
    return report;
  });
  const output = await skill.execute({ config, options: { executablePath: "/tmp/chromium" } });
  assert.equal(output, report);
  assert.deepEqual(calls, [{ receivedConfig: config, options: { executablePath: "/tmp/chromium" } }]);
});

test("executeWithEvidence keeps execution evidence separate from raw output", async () => {
  const registry = new SkillRegistry();
  const output = { marker: "raw-output" };
  registry.register(defineSkill({
    manifest: {
      id: "evidence-probe", version: "1.0.0", contractVersion: "1.0", kind: "analysis", summary: "Evidence probe",
      stages: ["analyze"], consumes: ["probe-input"], produces: ["probe-output"], requires: [], optionalDependencies: [], qualityGates: ["probe-gate"], sideEffects: ["none"],
    },
    async execute() { return output; },
  }));
  const result = await registry.executeWithEvidence("evidence-probe", { input: true });
  assert.equal(result.output, output);
  assert.equal(result.evidence.status, "succeeded");
  assert.equal(result.evidence.skillId, "evidence-probe");
  assert.equal(result.evidence.schemaVersion, "1.0");
  assert.deepEqual(result.evidence.resolvedDependencies, []);
  assert.equal(result.evidence.error, undefined);
});

test("failed evidence execution throws an auditable SkillExecutionError", async () => {
  const registry = new SkillRegistry();
  registry.register(defineSkill({
    manifest: {
      id: "failure-probe", version: "1.0.0", contractVersion: "1.0", kind: "analysis", summary: "Failure probe",
      stages: ["analyze"], consumes: [], produces: [], requires: [], optionalDependencies: [], qualityGates: [], sideEffects: ["none"],
    },
    async execute(): Promise<never> { throw new Error("expected failure"); },
  }));
  await assert.rejects(
    () => registry.executeWithEvidence("failure-probe", {}),
    (error) => error instanceof SkillExecutionError
      && error.evidence.status === "failed"
      && error.evidence.error === "expected failure",
  );
});

test("Task Profile resolves required and reviewed optional Skills in dependency order", () => {
  const skills = createDefaultSkillRegistry();
  const profiles = createDefaultTaskProfileRegistry(skills);
  assert.deepEqual(profiles.list().map((profile) => profile.id), ["source-page", "spa-application"]);
  const base = profiles.resolve("spa-application");
  assert.deepEqual(base.skills.map((skill) => skill.id), ["source-structure", "state-responsibility", "spa-router"]);
  const authenticated = profiles.resolve("spa-application", ["auth-guard"]);
  assert.deepEqual(authenticated.skills.map((skill) => skill.id), ["source-structure", "state-responsibility", "spa-router", "auth-guard"]);
  assert.equal(authenticated.qualityGates.includes("fresh-authentication-required"), true);
  assert.throws(() => profiles.resolve("spa-application", ["unknown-skill"]), /does not declare optional skill/);
});

test("Skill Registry rejects duplicates, missing dependencies, and dependency cycles", async () => {
  const registry = new SkillRegistry();
  const skillA = defineSkill({
    manifest: {
      id: "skill-a", version: "1.0.0", contractVersion: "1.0", kind: "analysis", summary: "A",
      stages: ["analyze"], consumes: [], produces: [], requires: ["skill-b"], optionalDependencies: [], qualityGates: [], sideEffects: ["none"],
    },
    async execute(input: string) { return input; },
  });
  const skillB = defineSkill({
    manifest: {
      id: "skill-b", version: "1.0.0", contractVersion: "1.0", kind: "analysis", summary: "B",
      stages: ["analyze"], consumes: [], produces: [], requires: ["skill-a"], optionalDependencies: [], qualityGates: [], sideEffects: ["none"],
    },
    async execute(input: string) { return input; },
  });
  registry.register(skillA);
  assert.throws(() => registry.register(skillA), /already registered/);
  assert.throws(() => registry.resolve(["skill-a"]), /unregistered skill: skill-b/);
  registry.register(skillB);
  assert.throws(() => registry.resolve(["skill-a"]), /dependency cycle/);
  await assert.rejects(() => registry.execute("missing-skill", {}), /unknown skill/);
});
