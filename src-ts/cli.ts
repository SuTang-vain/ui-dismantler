#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { generateScenarios } from "./evaluation/scenarios.js";
import { evaluateBrowserQuality, evaluateLibrarySelectorCoverage, resolveQualityViewports } from "./evaluation/browser.js";
import { evaluateRoundtrip } from "./evaluation/roundtrip.js";
import type { SpaRouterContractConfig, SpaRouterContractReport } from "./evaluation/spa-router.js";
import { formatSpaRouterVisualDiagnostics } from "./evaluation/spa-router-report.js";
import { appendRuntimeSelectorCheck, validateLibrary } from "./validation/library.js";
import { planComponents, writeComponentPlanningReport, writeComponentSpecs } from "./planning/components.js";
import { generateSpaRouteShellPlan } from "./planning/spa-route-shell.js";
import { generateSpaRouteShellArtifact } from "./planning/spa-route-shell-generator.js";
import { generateSpaRouteShellIntegrationPatch } from "./planning/spa-route-shell-patch.js";
import { analyzeVueRouterResponsibility } from "./planning/vue-router-responsibility.js";
import { analyzeRouterToSfcResponsibilities } from "./planning/router-sfc-responsibility.js";
import { generateVueRouterIntegrationPatch } from "./planning/vue-router-patch.js";
import { analyzeEChartsResponsibilities } from "./planning/echarts-responsibility.js";
import { analyzeSfcVisualResponsibilities, type SfcVisualResponsibilityGraph } from "./planning/sfc-visual-responsibility.js";
import { generateVisualTargetPlan, type VisualTargetPlan } from "./planning/visual-target-plan.js";
import { generateVisualTargetArtifact } from "./planning/visual-target-generator.js";
import { generateGeneratedTargetAutoV2 } from "./planning/generated-target-auto-v2.js";
import { analyzeApiFixtureResponsibilities, analyzeTransportProxyResponsibilities, type ApiFixtureResponsibilityGraph } from "./planning/api-fixture-responsibility.js";
import { linkApiRouteOwnership } from "./planning/api-route-ownership.js";
import { analyzeSpaAuthResponsibilities } from "./planning/spa-auth-responsibility.js";
import type { SpaRouteShellPlan } from "./planning/spa-route-shell.js";
import { runQualityGate, writeManifest, writeScenarioDocument } from "./workflow/pipeline.js";
import { createDefaultSkillRegistry } from "./skills/default-registry.js";
import type { SourceStructureSkillInput } from "./skills/source-structure.js";
import type { SpaRouterSkillInput } from "./skills/spa-router.js";
import type { Manifest } from "./types.js";
import { assertDataSurfaceManifest, serializeDataSurfaceManifest, validateDataSurfaceManifest, type DataSurfaceManifest, type DataSurfaceManifestInput } from "./skills/data-surface-manifest/index.js";
import type { DataCardinalityResponsibilityGraph, DataCardinalitySkillInput } from "./skills/data-cardinality.js";
import type { PrimitiveDomCompilationGraph } from "./skills/primitive-dom.js";
import { createDefaultTaskProfileRegistry } from "./profiles/default-profiles.js";
import { createDefaultReviewedBindingRegistry } from "./profiles/default-bindings.js";
import { ProfileExecutionPlanner } from "./core/profiles/execution-plan.js";
import { ProfileExecutor } from "./core/profiles/executor.js";
import { readProfileRunConfiguration } from "./profiles/profile-config.js";
import { componentPlanningReportToBuildPlan, acceptComponentLibrary, assessComponentLibrarySourceReadiness, createComponentDataSurfaceArtifactCandidate, createComponentLibraryBuildPlan, createComponentStateEvidenceMapCandidate, createComponentStyleArtifactCandidate, enrichComponentLibraryBuildPlan, primitiveDomCompilationToBuildPlan, runComponentLibraryBuild, runReviewedComponentLibraryProduction, validateComponentLibraryBuildPlan, visualTargetPlanToBuildPlan, type ComponentLibraryBuildPlan, type ComponentLibraryBuildPlanInput, type ComponentLibraryQualityContract, type ComponentLibraryStateEvidenceMap, type ReviewedComponentDataSurfaceArtifact, type ReviewedComponentStyleArtifact } from "./production/component-library/index.js";
import type { ComponentPlanningReport } from "./planning/components.js";
import type { SfcStateResponsibility } from "./planning/sfc-state-responsibility.js";

interface ReviewedComponentProductionConfig {
  readonly schemaVersion: "1.0";
  readonly sourceRoot: string;
  readonly library: { readonly name: string; readonly packageName: string };
  readonly artifacts: {
    readonly primitiveDom: string;
    readonly state?: string;
    readonly stateMap?: string;
    readonly dataSurface?: string;
    readonly dataSurfaceArtifact?: string;
    readonly runtimeOptions?: string;
    readonly style?: string;
  };
  readonly quality?: ComponentLibraryQualityContract;
}

const skillRegistry = createDefaultSkillRegistry();
const taskProfileRegistry = createDefaultTaskProfileRegistry(skillRegistry);
const reviewedBindingRegistry = createDefaultReviewedBindingRegistry(skillRegistry);

function flag(args: string[], name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function has(args: string[], name: string): boolean { return args.includes(name); }
function optionalNonNegativeNumber(args: string[], name: string): number | undefined {
  const raw = flag(args, name); if (raw === undefined) return undefined;
  const value = Number(raw); if (!Number.isFinite(value) || value < 0) throw new Error(`${name} 必须是非负数字`);
  return value;
}
function parseNonNegativeInt(args: string[], name: string): number | undefined {
  const raw = flag(args, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} 必须是非负整数`);
  return value;
}
function optionalThreshold(args: string[], name: string): number | null | undefined {
  const raw = flag(args, name);
  if (raw === undefined) return undefined;
  if (["off", "none", "null"].includes(raw.toLowerCase())) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} 必须是 0..1 的数字，或 off`);
  return value;
}
function componentQualityContract(args: string[]): ComponentLibraryQualityContract | undefined {
  const originalHtmlPath = flag(args, "--quality-html");
  const manifestPath = flag(args, "--quality-manifest");
  const scenarioPath = flag(args, "--quality-scenarios");
  const spaRouterConfigPath = flag(args, "--quality-spa-router");
  const visualArtifactsDir = flag(args, "--quality-artifacts");
  const qualityFlagsPresent = [manifestPath, scenarioPath, spaRouterConfigPath, visualArtifactsDir].some(Boolean) || has(args, "--quality-visual");
  if (!originalHtmlPath) {
    if (qualityFlagsPresent) throw new Error("组件质量合同使用 --quality-* 参数时必须提供 --quality-html");
    return undefined;
  }
  return {
    originalHtmlPath: resolve(originalHtmlPath),
    ...(manifestPath ? { manifestPath: resolve(manifestPath) } : {}),
    ...(scenarioPath ? { scenarioPath: resolve(scenarioPath) } : {}),
    ...(spaRouterConfigPath ? { spaRouterConfigPath: resolve(spaRouterConfigPath) } : {}),
    visual: has(args, "--quality-visual"),
    ...(visualArtifactsDir ? { visualArtifactsDir: resolve(visualArtifactsDir) } : {}),
  };
}
function usage(): void {
  console.error(`ui-dismantler-ts\n\n命令:\n  analyze <html> --out <manifest> [--profile <name>] [--minimal]\n  plan <html> --out <component-plan.json> [--spec-dir <dir>] [--line-budget <n>]\n  validate <lib-dir>\n  scenarios <manifest> --out <scenarios.json>\n  roundtrip <html> --lib <lib-dir> [--out <report.json>]\n  quality <html> --lib <lib-dir> [--manifest <manifest>] [--scenarios <scenarios.json>] [--interaction-coverage <0..1|off>] [--viewports <desktop,tablet,mobile,tiny>] [--browser-mode <legacy|shared-browser>] [--browser-concurrency <n>] [--browser-resource-cache <off|run-local>] [--browser-stability <fixed|adaptive>] [--browser-shutdown <graceful|fast-kill>] [--spa-router <config.json>] [--out <report.json>]\n  spa-router <config.json> [--out <report.json>]\n  spa-shell-generate <route-shell.plan.json> --out-dir <dir> [--baseline-dir <dir>] [--manual-report <report.json>] [--generated-report <report.json>] [--manual-edits <n>] [--manual-edited-lines <n>] [--repair-iterations <n>] [--metrics-out <metrics.json>]\n  spa-vue-router-analyze <source-root> --out <responsibility.graph.json>\n  spa-vue-router-patch <source-root> --source <permission.js> --out-dir <dir> [--import-path <path>]\n  sfc-visual-analyze <source-root> --out <sfc-visual.graph.json> [--fixture-config <spa-router.config.json>]\n  transport-proxy-analyze <source-root> --out <transport-proxy.graph.json>\n  spa-auth-analyze <source-root> --out <spa-auth.graph.json>\n  echarts-responsibility-analyze <source-root> --out <echarts.graph.json>\n  visual-target-plan <sfc-visual.graph.json> --route-shell <route-shell.plan.json> [--router-sfc <router-sfc.graph.json>] --out <visual-target.plan.json> [--metrics-out <metrics.json>]\n  visual-target-generate <visual-target.plan.json> --route-shell <route-shell.plan.json> --out-dir <dir> [--vendor-root <echarts-root>]\n  data-surface <sfc-visual.graph.json> [--cardinality <data-cardinality.graph.json>] [--api <api-fixture.graph.json>] --out <data-surface.manifest.json> [--source-root <root>] [--source-hash <sha256>] [--source-commit <commit>] [--fixture-hash <sha256>] [--config-hash <sha256>] [--generated-at <ISO>]
  data-surface-validate <data-surface.manifest.json> [--require-ready]
  skill-list [--out <skill-catalog.json>]
  skill-run <skill-id> --input <input.json> --out <output.json> [--evidence-out <evidence.json>]
  profile-list [--out <profile-catalog.json>]
  profile-plan <profile.config.json> --out <profile.plan.json>
  profile-run <profile.config.json> --out <profile.report.json>
  component-state-candidate <sfc-visual.graph.json> --primitive-dom <primitive-dom.graph.json> --out <component-state.map.json>
  component-style-candidate <sfc-visual.graph.json> --primitive-dom <primitive-dom.graph.json> --out <reviewed-component-style.artifact.json>
  component-data-surface-candidate <data-surface.manifest.json> --primitive-dom <primitive-dom.graph.json> --out <reviewed-component-data-surface.artifact.json>
  component-produce <component-production.config.json> --out-dir <dir> [--plan <component-library.build-plan.json>] [--report <component-library.build-report.json>] [--result <component-library.production-result.json>] [--overwrite]
  component-build-plan <component-build.config.json> --out <component-library.build-plan.json>
  component-build <component-library.build-plan.json> --out-dir <dir> [--report <component-library.build-report.json>] [--overwrite]
  component-source-readiness <original.html> [--resource-profile <dom|canvas>] [--out <source-readiness.json>]
  component-accept <original.html> --lib <component-library> [--manifest <manifest.json>] [--scenarios <scenarios.json>] [--resource-profile <dom|canvas>] [--viewports <desktop,tablet,mobile,tiny>] [--browser-mode <legacy|shared-browser>] [--browser-concurrency <n>] [--browser-resource-cache <off|run-local>] [--browser-stability <fixed|adaptive>] [--browser-shutdown <graceful|fast-kill>] [--spa-router <config.json>] [--visual-artifacts <dir>] [--report <component-library.acceptance-report.json>]
  primitive-dom-build-plan <primitive-dom.graph.json> --source-root <root> --name <library-name> --package-name <package-name> --out <component-library.build-plan.json> [--quality-html <original.html>] [--quality-manifest <manifest.json>] [--quality-scenarios <scenarios.json>] [--quality-spa-router <config.json>] [--quality-visual] [--quality-artifacts <dir>]
  component-plan-build-plan <component-plan.json> --source-root <root> --name <library-name> --package-name <package-name> --out <component-library.build-plan.json> [--quality-html <original.html>] [--quality-manifest <manifest.json>] [--quality-scenarios <scenarios.json>] [--quality-spa-router <config.json>] [--quality-visual] [--quality-artifacts <dir>]
  visual-target-build-plan <visual-target.plan.json> --source-root <root> --name <library-name> --package-name <package-name> --out <component-library.build-plan.json> [--quality-html <original.html>] [--quality-manifest <manifest.json>] [--quality-scenarios <scenarios.json>] [--quality-spa-router <config.json>] [--quality-visual] [--quality-artifacts <dir>]
  component-build-enrich <component-library.build-plan.json> [--state <sfc-state.json> | --state-map <component-state.map.json>] [--data-surface <data-surface.manifest.json>] [--primitive-dom <primitive-dom.graph.json>] [--runtime-options <mount-options.json>] --out <component-library.reviewed-build-plan.json>
  visual-target-auto-v2 <visual-target.plan.json> --route-shell <route-shell.plan.json> --router-sfc <router-sfc.graph.json> --sfc-visual <sfc-visual.graph.json> --spa-auth <spa-auth.graph.json> --transport-proxy <transport-proxy.graph.json> [--api-route-ownership <api-route-ownership.graph.json>] --out-dir <dir> [--manual-report <report.json>] [--generated-report <report.json>] [--manual-edited-lines <n>] [--repair-iterations <n>]\n`);
}
function printValidation(report: ReturnType<typeof validateLibrary>): void {
  console.log(`校验目标: ${report.target}`);
  for (const result of report.results) console.log(`${result.passed ? "[PASS]" : "[FAIL]"} ${result.name}\n      ${result.detail}`);
  console.log(`\n结果: ${report.passed} 通过 / ${report.failed} 失败 / 共 ${report.total} 项`);
}

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (!command || command === "help" || command === "--help") { usage(); return command ? 0 : 2; }
  try {
    if (command === "skill-list") {
      const catalog = { schemaVersion: "1.0", kind: "skill-catalog", skills: skillRegistry.list() };
      const out = flag(args, "--out") ?? flag(args, "-o");
      const serialized = `${JSON.stringify(catalog, null, 2)}\n`;
      if (out) await writeFile(resolve(out), serialized, "utf8");
      console.log(catalog.skills.map((skill) => `${skill.id}@${skill.version}`).join("\n"));
      return 0;
    }
    if (command === "skill-run") {
      const skillId = args[0]; const inputPath = flag(args, "--input"); const out = flag(args, "--out") ?? flag(args, "-o");
      if (!skillId || !inputPath || !out) throw new Error("skill-run 需要 <skill-id>、--input 和 --out");
      const input = JSON.parse(await readFile(resolve(inputPath), "utf8")) as unknown;
      if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("skill-run input 必须是 JSON 对象");
      const result = await skillRegistry.executeWithEvidence<unknown, unknown>(skillId, input);
      await writeFile(resolve(out), `${JSON.stringify(result.output, null, 2)}\n`, "utf8");
      const evidenceOut = flag(args, "--evidence-out");
      if (evidenceOut) await writeFile(resolve(evidenceOut), `${JSON.stringify(result.evidence, null, 2)}\n`, "utf8");
      console.log(`✓ Skill 执行: ${skillId} (${result.evidence.durationMs}ms)`);
      return 0;
    }
    if (command === "profile-list") {
      const catalog = { schemaVersion: "1.0", kind: "profile-catalog", profiles: taskProfileRegistry.list() };
      const out = flag(args, "--out") ?? flag(args, "-o");
      const serialized = `${JSON.stringify(catalog, null, 2)}\n`;
      if (out) await writeFile(resolve(out), serialized, "utf8");
      console.log(catalog.profiles.map((profile) => `${profile.id}: ${profile.summary}`).join("\n"));
      return 0;
    }
    if (command === "component-state-candidate") {
      const visualGraphPath = args[0]; const primitivePath = flag(args, "--primitive-dom"); const out = flag(args, "--out") ?? flag(args, "-o");
      if (!visualGraphPath || !primitivePath || !out) throw new Error("component-state-candidate 需要 <sfc-visual.graph.json>、--primitive-dom 和 --out");
      const visualGraph = JSON.parse(await readFile(resolve(visualGraphPath), "utf8")) as SfcVisualResponsibilityGraph;
      const primitiveGraph = JSON.parse(await readFile(resolve(primitivePath), "utf8")) as PrimitiveDomCompilationGraph;
      const artifact = createComponentStateEvidenceMapCandidate(visualGraph, primitiveGraph);
      await writeFile(resolve(out), `${JSON.stringify(artifact, null, 2)}
`, "utf8");
      console.log(`✓ Component State Candidate: ${resolve(out)} (entries=${artifact.entries.length}，unresolved=${artifact.unresolved?.length ?? 0}，reviewRequired=${artifact.reviewRequired})`);
      return 0;
    }
    if (command === "component-style-candidate") {
      const visualGraphPath = args[0]; const primitivePath = flag(args, "--primitive-dom"); const out = flag(args, "--out") ?? flag(args, "-o");
      if (!visualGraphPath || !primitivePath || !out) throw new Error("component-style-candidate 需要 <sfc-visual.graph.json>、--primitive-dom 和 --out");
      const visualGraph = JSON.parse(await readFile(resolve(visualGraphPath), "utf8")) as SfcVisualResponsibilityGraph;
      const primitiveGraph = JSON.parse(await readFile(resolve(primitivePath), "utf8")) as PrimitiveDomCompilationGraph;
      const artifact = createComponentStyleArtifactCandidate(visualGraph, primitiveGraph);
      await writeFile(resolve(out), `${JSON.stringify(artifact, null, 2)}
`, "utf8");
      console.log(`✓ Component Style Candidate: ${resolve(out)} (entries=${artifact.entries.length}，unresolved=${artifact.unresolved?.length ?? 0}，reviewRequired=${artifact.reviewRequired})`);
      return 0;
    }
    if (command === "component-data-surface-candidate") {
      const manifestPath = args[0]; const primitivePath = flag(args, "--primitive-dom"); const out = flag(args, "--out") ?? flag(args, "-o");
      if (!manifestPath || !primitivePath || !out) throw new Error("component-data-surface-candidate 需要 <data-surface.manifest.json>、--primitive-dom 和 --out");
      const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8")) as DataSurfaceManifest;
      const primitiveGraph = JSON.parse(await readFile(resolve(primitivePath), "utf8")) as PrimitiveDomCompilationGraph;
      const artifact = createComponentDataSurfaceArtifactCandidate(manifest, primitiveGraph);
      await writeFile(resolve(out), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
      console.log(`✓ Component Data Surface Candidate: ${resolve(out)} (surfaces=${manifest?.surfaces?.length ?? 0}，unresolved=${artifact.unresolved?.length ?? 0}，reviewRequired=${artifact.reviewRequired})`);
      return 0;
    }
    if (command === "component-produce") {
      const configPath = args[0]; const outDir = flag(args, "--out-dir");
      if (!configPath || !outDir) throw new Error("component-produce 需要 <component-production.config.json> 和 --out-dir");
      const absoluteConfigPath = resolve(configPath); const configRoot = dirname(absoluteConfigPath);
      const config = JSON.parse(await readFile(absoluteConfigPath, "utf8")) as ReviewedComponentProductionConfig;
      if (config.schemaVersion !== "1.0" || !config.sourceRoot || !config.library?.name || !config.library?.packageName || !config.artifacts?.primitiveDom) throw new Error("component production config 缺少必需字段或 schemaVersion 不是 1.0");
      if (config.artifacts.state && config.artifacts.stateMap) throw new Error("component production config 的 state 与 stateMap 不能同时使用");
      if (config.artifacts.dataSurface && config.artifacts.dataSurfaceArtifact) throw new Error("component production config 的 dataSurface 与 dataSurfaceArtifact 不能同时使用");
      const readJson = async <T>(path: string | undefined): Promise<T | undefined> => path ? JSON.parse(await readFile(resolve(configRoot, path), "utf8")) as T : undefined;
      const primitiveGraph = await readJson<PrimitiveDomCompilationGraph>(config.artifacts.primitiveDom) as PrimitiveDomCompilationGraph;
      const state = await readJson<SfcStateResponsibility>(config.artifacts.state);
      const stateMap = await readJson<ComponentLibraryStateEvidenceMap>(config.artifacts.stateMap);
      const dataSurface = await readJson<DataSurfaceManifest>(config.artifacts.dataSurface);
      const dataSurfaceArtifact = await readJson<ReviewedComponentDataSurfaceArtifact>(config.artifacts.dataSurfaceArtifact);
      const runtimeOptions = await readJson<unknown>(config.artifacts.runtimeOptions);
      const styleArtifact = await readJson<ReviewedComponentStyleArtifact>(config.artifacts.style);
      const quality = config.quality ? {
        ...config.quality,
        originalHtmlPath: resolve(configRoot, config.quality.originalHtmlPath),
        ...(config.quality.manifestPath ? { manifestPath: resolve(configRoot, config.quality.manifestPath) } : {}),
        ...(config.quality.scenarioPath ? { scenarioPath: resolve(configRoot, config.quality.scenarioPath) } : {}),
        ...(config.quality.spaRouterConfigPath ? { spaRouterConfigPath: resolve(configRoot, config.quality.spaRouterConfigPath) } : {}),
        ...(config.quality.visualArtifactsDir ? { visualArtifactsDir: resolve(configRoot, config.quality.visualArtifactsDir) } : {}),
      } : undefined;
      const result = await runReviewedComponentLibraryProduction({
        primitiveGraph,
        projection: { sourceRoot: resolve(configRoot, config.sourceRoot), libraryName: config.library.name, packageName: config.library.packageName, ...(quality ? { quality } : {}) },
        ...(state ? { state } : {}), ...(stateMap ? { stateMap } : {}), ...(dataSurface ? { dataSurface } : {}), ...(dataSurfaceArtifact ? { dataSurfaceArtifact } : {}), ...(runtimeOptions !== undefined ? { runtimeOptions } : {}), ...(styleArtifact ? { styleArtifact } : {}),
      }, outDir, { overwrite: has(args, "--overwrite"), reportPath: flag(args, "--report") });
      const planPath = flag(args, "--plan"); if (planPath) await writeFile(resolve(planPath), `${JSON.stringify(result.plan, null, 2)}
`, "utf8");
      const resultPath = flag(args, "--result"); if (resultPath) await writeFile(resolve(resultPath), `${JSON.stringify(result, null, 2)}
`, "utf8");
      console.log(`${result.build.status === "accepted" ? "✓" : "✗"} Reviewed Component Production: ${result.build.status}`);
      console.log(`  output=${result.build.outputRoot}，reviewRequired=${result.plan.reviewRequired}，smoke=${result.build.smoke?.passed ?? false}，quality=${result.build.quality?.passed ?? "not-run"}`);
      for (const blocker of result.build.blockers) console.log(`  - ${blocker}`);
      return result.build.status === "accepted" ? 0 : 1;
    }
    if (command === "primitive-dom-build-plan") {
      const graphPath = args[0]; const out = flag(args, "--out") ?? flag(args, "-o"); const sourceRoot = flag(args, "--source-root"); const libraryName = flag(args, "--name"); const packageName = flag(args, "--package-name");
      if (!graphPath || !out || !sourceRoot || !libraryName || !packageName) throw new Error("primitive-dom-build-plan 需要 graph、--source-root、--name、--package-name 和 --out");
      const graph = JSON.parse(await readFile(resolve(graphPath), "utf8")) as PrimitiveDomCompilationGraph;
      const plan = await primitiveDomCompilationToBuildPlan(graph, { sourceRoot, libraryName, packageName, quality: componentQualityContract(args) });
      await writeFile(resolve(out), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      const validation = validateComponentLibraryBuildPlan(plan);
      console.log(`${validation.ready ? "✓" : "✗"} Primitive DOM Build Plan: ${resolve(out)} (reviewRequired=${plan.reviewRequired})`);
      for (const blocker of validation.blockers) console.log(`  - ${blocker.path}: ${blocker.message}`);
      return validation.ready ? 0 : 1;
    }
    if (command === "component-plan-build-plan") {
      const reportPath = args[0]; const out = flag(args, "--out") ?? flag(args, "-o"); const sourceRoot = flag(args, "--source-root"); const libraryName = flag(args, "--name"); const packageName = flag(args, "--package-name");
      if (!reportPath || !out || !sourceRoot || !libraryName || !packageName) throw new Error("component-plan-build-plan 需要 component-plan、--source-root、--name、--package-name 和 --out");
      const report = JSON.parse(await readFile(resolve(reportPath), "utf8")) as ComponentPlanningReport;
      const plan = await componentPlanningReportToBuildPlan(report, { sourceRoot, libraryName, packageName, quality: componentQualityContract(args) });
      await writeFile(resolve(out), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      const validation = validateComponentLibraryBuildPlan(plan);
      console.log(`✗ Component Plan Build Plan requires review: ${resolve(out)}`);
      for (const blocker of validation.blockers) console.log(`  - ${blocker.path}: ${blocker.message}`);
      return 1;
    }
    if (command === "visual-target-build-plan") {
      const planPath = args[0]; const out = flag(args, "--out") ?? flag(args, "-o"); const sourceRoot = flag(args, "--source-root"); const libraryName = flag(args, "--name"); const packageName = flag(args, "--package-name");
      if (!planPath || !out || !sourceRoot || !libraryName || !packageName) throw new Error("visual-target-build-plan 需要 visual-target.plan、--source-root、--name、--package-name 和 --out");
      const visualPlan = JSON.parse(await readFile(resolve(planPath), "utf8")) as VisualTargetPlan;
      const plan = await visualTargetPlanToBuildPlan(visualPlan, { sourceRoot, libraryName, packageName, quality: componentQualityContract(args) });
      await writeFile(resolve(out), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      const validation = validateComponentLibraryBuildPlan(plan);
      console.log(`✗ Visual Target Build Plan remains review-gated: ${resolve(out)}`);
      for (const blocker of validation.blockers) console.log(`  - ${blocker.path}: ${blocker.message}`);
      return 1;
    }
    if (command === "component-build-enrich") {
      const planPath = args[0]; const out = flag(args, "--out") ?? flag(args, "-o"); const statePath = flag(args, "--state"); const stateMapPath = flag(args, "--state-map"); const dataSurfacePath = flag(args, "--data-surface"); const primitiveGraphPath = flag(args, "--primitive-dom"); const runtimeOptionsPath = flag(args, "--runtime-options");
      if (!planPath || !out || (!statePath && !stateMapPath && !dataSurfacePath && !primitiveGraphPath && !runtimeOptionsPath)) throw new Error("component-build-enrich 需要 plan、至少一个 --state/--state-map/--data-surface/--primitive-dom/--runtime-options 和 --out");
      if (statePath && stateMapPath) throw new Error("component-build-enrich 的 --state 与 --state-map 不能同时使用");
      const plan = JSON.parse(await readFile(resolve(planPath), "utf8")) as ComponentLibraryBuildPlan;
      const state = statePath ? JSON.parse(await readFile(resolve(statePath), "utf8")) as SfcStateResponsibility : undefined;
      const stateMap = stateMapPath ? JSON.parse(await readFile(resolve(stateMapPath), "utf8")) as ComponentLibraryStateEvidenceMap : undefined;
      const dataSurface = dataSurfacePath ? JSON.parse(await readFile(resolve(dataSurfacePath), "utf8")) as DataSurfaceManifest : undefined;
      const primitiveGraph = primitiveGraphPath ? JSON.parse(await readFile(resolve(primitiveGraphPath), "utf8")) as PrimitiveDomCompilationGraph : undefined;
      const runtimeOptions = runtimeOptionsPath ? JSON.parse(await readFile(resolve(runtimeOptionsPath), "utf8")) as unknown : undefined;
      const enriched = enrichComponentLibraryBuildPlan(plan, { state, stateMap, dataSurface, primitiveGraph, runtimeOptions });
      await writeFile(resolve(out), `${JSON.stringify(enriched, null, 2)}\n`, "utf8");
      const validation = validateComponentLibraryBuildPlan(enriched);
      console.log(`${validation.ready ? "✓" : "✗"} Component evidence projection: ${resolve(out)} (reviewRequired=${enriched.reviewRequired})`);
      for (const blocker of validation.blockers) console.log(`  - ${blocker.path}: ${blocker.message}`);
      return validation.ready ? 0 : 1;
    }
    if (command === "component-build-plan") {
      const configPath = args[0]; const out = flag(args, "--out") ?? flag(args, "-o");
      if (!configPath || !out) throw new Error("component-build-plan 需要 <component-build.config.json> 和 --out");
      const input = JSON.parse(await readFile(resolve(configPath), "utf8")) as ComponentLibraryBuildPlanInput;
      const plan = await createComponentLibraryBuildPlan(input, configPath);
      await writeFile(resolve(out), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      const validation = validateComponentLibraryBuildPlan(plan);
      console.log(`${validation.ready ? "✓" : "✗"} Component Library Build Plan: ${resolve(out)}`);
      console.log(`  files=${plan.files.length}，publishable=${plan.files.filter((file) => file.publish).length}，reviewRequired=${plan.reviewRequired}`);
      return validation.ready ? 0 : 1;
    }
    if (command === "component-build") {
      const planPath = args[0]; const outDir = flag(args, "--out-dir");
      if (!planPath || !outDir) throw new Error("component-build 需要 <component-library.build-plan.json> 和 --out-dir");
      const plan = JSON.parse(await readFile(resolve(planPath), "utf8")) as ComponentLibraryBuildPlan;
      const report = await runComponentLibraryBuild(plan, outDir, { overwrite: has(args, "--overwrite"), reportPath: flag(args, "--report") });
      console.log(`${report.status === "accepted" ? "✓" : "✗"} Component Library Build: ${report.status}`);
      console.log(`  output=${report.outputRoot}，smoke=${report.smoke?.passed ?? false}，validation=${report.validation?.ok ?? false}，quality=${report.quality?.passed ?? "not-run"}`);
      for (const blocker of report.blockers) console.log(`  - ${blocker}`);
      return report.status === "accepted" ? 0 : 1;
    }
    if (command === "component-source-readiness") {
      const htmlPath = args[0]; const out = flag(args, "--out") ?? flag(args, "-o");
      if (!htmlPath) throw new Error("component-source-readiness 需要 <original.html>");
      const resourceProfile = flag(args, "--resource-profile") ?? "dom";
      if (!(["dom", "canvas"] as string[]).includes(resourceProfile)) throw new Error("--resource-profile 必须是 dom 或 canvas");
      const report = await assessComponentLibrarySourceReadiness({ originalHtmlPath: htmlPath, resourceProfile: resourceProfile as "dom" | "canvas", visual: true });
      if (out) await writeFile(resolve(out), `${JSON.stringify(report, null, 2)}
`, "utf8");
      console.log(`${report.status === "ready" ? "✓" : "✗"} Component Source Readiness: ${report.status}`);
      console.log(`  source=${report.sourcePath}，bytes=${report.metrics.sourceBytes}，critical=${report.metrics.criticalResourceReferences}，missing=${report.metrics.missingLocalResources}，remote=${report.metrics.remoteCriticalResources}`);
      for (const issue of report.issues) console.log(`  - ${issue.severity}:${issue.id}: ${issue.detail}${issue.reference ? ` (${issue.reference})` : ""}`);
      return report.status === "ready" ? 0 : 1;
    }
    if (command === "component-accept") {
      const htmlPath = args[0]; const libraryRoot = flag(args, "--lib");
      if (!htmlPath || !libraryRoot) throw new Error("component-accept 需要 <original.html> 和 --lib");
      const resourceProfile = flag(args, "--resource-profile") ?? "dom";
      if (!(["dom", "canvas"] as string[]).includes(resourceProfile)) throw new Error("--resource-profile 必须是 dom 或 canvas");
      const viewportFlag = flag(args, "--viewports");
      const viewports = viewportFlag ? resolveQualityViewports(viewportFlag) : undefined;
      const browserMode = flag(args, "--browser-mode") ?? "legacy";
      if (!(["legacy", "shared-browser"] as string[]).includes(browserMode)) throw new Error("--browser-mode 必须是 legacy 或 shared-browser");
      const concurrencyValue = flag(args, "--browser-concurrency");
      const browserConcurrency = concurrencyValue === undefined ? 1 : Number(concurrencyValue);
      if (!Number.isInteger(browserConcurrency) || browserConcurrency < 1 || browserConcurrency > 8) throw new Error("--browser-concurrency 必须是 1..8 的整数");
      const browserResourceCache = flag(args, "--browser-resource-cache") ?? "off";
      if (!(["off", "run-local"] as string[]).includes(browserResourceCache)) throw new Error("--browser-resource-cache 必须是 off 或 run-local");
      const browserStability = flag(args, "--browser-stability") ?? "fixed";
      if (!(["fixed", "adaptive"] as string[]).includes(browserStability)) throw new Error("--browser-stability 必须是 fixed 或 adaptive");
      const browserShutdown = flag(args, "--browser-shutdown") ?? "graceful";
      if (!(["graceful", "fast-kill"] as string[]).includes(browserShutdown)) throw new Error("--browser-shutdown 必须是 graceful 或 fast-kill");
      const report = await acceptComponentLibrary(htmlPath, libraryRoot, {
        manifestPath: flag(args, "--manifest"),
        scenarioPath: flag(args, "--scenarios"),
        spaRouterConfigPath: flag(args, "--spa-router"),
        resourceProfile: resourceProfile as "dom" | "canvas",
        visualArtifactsDir: flag(args, "--visual-artifacts"),
        viewports,
        browserMode: browserMode as "legacy" | "shared-browser",
        browserConcurrency,
        browserResourceCache: browserResourceCache as "off" | "run-local",
        browserStability: browserStability as "fixed" | "adaptive",
        browserShutdown: browserShutdown as "graceful" | "fast-kill",
        reportPath: flag(args, "--report") ?? flag(args, "--out"),
      });
      console.log(`${report.status === "accepted" ? "✓" : "✗"} Component Library Acceptance: ${report.status}`);
      console.log(`  library=${report.libraryRoot}，source=${report.sourceReadiness?.status ?? "not-run"}，validation=${report.validation?.ok ?? false}，quality=${report.quality?.passed ?? "not-run"}`);
      for (const blocker of report.blockers) console.log(`  - ${blocker}`);
      return report.status === "accepted" ? 0 : 1;
    }
    if (command === "profile-plan") {
      const configPath = args[0]; const out = flag(args, "--out") ?? flag(args, "-o");
      if (!configPath || !out) throw new Error("profile-plan 需要 <profile.config.json> 和 --out");
      const config = await readProfileRunConfiguration(configPath);
      const plan = new ProfileExecutionPlanner(taskProfileRegistry, reviewedBindingRegistry).plan(config.profileId, {
        enabledOptionalSkills: config.enabledOptionalSkills,
        inputProviders: config.inputProviders.map(({ contract, providerId, reviewed }) => ({ contract, providerId, reviewed })),
      });
      await writeFile(resolve(out), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      console.log(`${plan.ready ? "✓" : "✗"} Profile 计划: ${plan.profileId} (${plan.steps.filter((step) => step.ready).length}/${plan.steps.length} Skills ready)`);
      for (const blocker of plan.blockers) console.log(`  - ${blocker}`);
      return plan.ready ? 0 : 1;
    }
    if (command === "profile-run") {
      const configPath = args[0]; const out = flag(args, "--out") ?? flag(args, "-o");
      if (!configPath || !out) throw new Error("profile-run 需要 <profile.config.json> 和 --out");
      const config = await readProfileRunConfiguration(configPath);
      const report = await new ProfileExecutor(skillRegistry, taskProfileRegistry, reviewedBindingRegistry).execute(config.profileId, {
        enabledOptionalSkills: config.enabledOptionalSkills,
        inputProviders: config.inputProviders,
      });
      await writeFile(resolve(out), `${JSON.stringify(report, null, 2)}\n`, "utf8");
      console.log(`${report.status === "succeeded" ? "✓" : "✗"} Profile 执行: ${report.profileId} (${report.steps.filter((step) => step.status === "succeeded").length}/${report.steps.length} Skills succeeded)`);
      for (const blocker of report.blockers) console.log(`  - ${blocker}`);
      return report.status === "succeeded" ? 0 : 1;
    }
    if (command === "analyze") {
      const html = args[0]; const out = flag(args, "--out") ?? flag(args, "-o");
      if (!html || !out) throw new Error("analyze 需要 <html> 和 --out");
      const manifest = await skillRegistry.execute<SourceStructureSkillInput, Manifest>("source-structure", { htmlPath: html, options: { profile: flag(args, "--profile"), minimal: has(args, "--minimal") } });
      await writeManifest(out, manifest);
      console.log(`✓ 已生成 manifest: ${resolve(out)}`);
      console.log(`  视图: ${manifest.structure.views.map((view) => view.type).join(", ") || "generic"}`);
      console.log(`  主题色令牌: ${manifest.theme.tokens.length} 个`);
      console.log(`  交互: ${manifest.interactions.length} 个`);
      if (manifest.warnings.length) console.log(`  ⚠ 告警: ${manifest.warnings.join("；")}`);
      return 0;
    }
    if (command === "plan") {
      const html = args[0]; const out = flag(args, "--out") ?? flag(args, "-o");
      if (!html || !out) throw new Error("plan 需要 <html> 和 --out");
      const rawBudget = flag(args, "--line-budget");
      const lineBudget = rawBudget === undefined ? undefined : Number(rawBudget);
      const manifest = await skillRegistry.execute<SourceStructureSkillInput, Manifest>("source-structure", { htmlPath: html, options: { profile: flag(args, "--profile"), minimal: has(args, "--minimal") } });
      const report = planComponents(manifest, { lineBudget });
      await writeComponentPlanningReport(out, report);
      const specDir = flag(args, "--spec-dir");
      if (specDir) await writeComponentSpecs(specDir, report);
      console.log(`✓ 已生成组件计划: ${resolve(out)}`);
      console.log(`  组件: ${report.summary.components}，超预算: ${report.summary.overBudget}，错误: ${report.summary.errors}，警告: ${report.summary.warnings}`);
      if (specDir) console.log(`  specs: ${resolve(specDir)}`);
      return report.summary.ready ? 0 : 1;
    }
    if (command === "validate") {
      const dir = args[0]; if (!dir) throw new Error("validate 需要 <lib-dir>");
      const staticReport = validateLibrary(dir);
      const runtime = has(args, "--no-runtime") ? null : await evaluateLibrarySelectorCoverage(dir);
      const report = runtime ? appendRuntimeSelectorCheck(staticReport, runtime.coverage ?? null) : staticReport;
      printValidation(report); return report.ok ? 0 : 1;
    }
    if (command === "scenarios") {
      const manifestPath = args[0]; const out = flag(args, "--out");
      if (!manifestPath || !out) throw new Error("scenarios 需要 <manifest> 和 --out");
      const document = generateScenarios(JSON.parse(await readFile(resolve(manifestPath), "utf8")));
      await writeScenarioDocument(out, document); console.log(`✓ 已生成 ${document.scenarios.length} 个候选场景: ${resolve(out)}`); return 0;
    }
    if (command === "roundtrip") {
      const html = args[0]; const lib = flag(args, "--lib"); if (!html || !lib) throw new Error("roundtrip 需要 <html> 和 --lib");
      const report = await evaluateRoundtrip(html, lib);
      const browser = has(args, "--no-visual") ? undefined : await evaluateBrowserQuality(html, lib);
      const fullReport = { ...report, browser };
      const out = flag(args, "--out"); const serialized = `${JSON.stringify(fullReport, null, 2)}\n`;
      if (out) await writeFile(resolve(out), serialized, "utf8"); console.log(serialized);
      return report.score && report.score.overall >= 0.85 && (!browser || browser.passed === true) ? 0 : 1;
    }
    if (command === "spa-shell-plan") {
      const configPath = args[0], out = flag(args, "--out");
      if (!configPath || !out) throw new Error("spa-shell-plan 需要 <config.json> 和 --out");
      const config = JSON.parse(await readFile(resolve(configPath), "utf8")) as SpaRouterContractConfig;
      const reportPath = flag(args, "--report");
      const report = reportPath ? JSON.parse(await readFile(resolve(reportPath), "utf8")) : undefined;
      const planningStartedAt = performance.now();
      const plan = generateSpaRouteShellPlan(config, report);
      const generationMs = Number((performance.now() - planningStartedAt).toFixed(3));
      await writeFile(resolve(out), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      const metricsOut = flag(args, "--metrics-out");
      if (metricsOut) {
        const metrics = {
          schemaVersion: "1.0", phase: "route-shell-planning", deterministic: true, modelCalls: 0, generationMs,
          manualEdits: 0, manualEditedLines: 0, repairIterations: 0, qualityRuns: 0,
          routes: plan.routes.length, transitions: plan.transitions.length, reviewedVisualStates: plan.capabilities.reviewedVisualStates,
          reportIncluded: plan.source.reportIncluded, reportPassed: plan.source.reportPassed, requiresHumanReview: plan.reviewRequired,
        };
        await writeFile(resolve(metricsOut), `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
      }
      console.log(`✓ 已生成 SPA route shell 计划: ${resolve(out)}`);
      console.log(`  routes=${plan.routes.length}，transitions=${plan.transitions.length}，visualStates=${plan.capabilities.reviewedVisualStates}，reviewRequired=${plan.reviewRequired}，generationMs=${generationMs}`);
      return 0;
    }
    if (command === "spa-auth-analyze") {
      const sourceRoot = args[0], out = flag(args, "--out");
      if (!sourceRoot || !out) throw new Error("spa-auth-analyze 需要 <source-root> 和 --out");
      const graph = analyzeSpaAuthResponsibilities(resolve(sourceRoot));
      await writeFile(resolve(out), `${JSON.stringify({ ...graph, sourceRoot: "<external-source>" }, null, 2)}
`, "utf8");
      console.log(`✓ 已生成 SPA auth responsibility graph: ${resolve(out)}`);
      console.log(`  files=${graph.metrics.filesScanned}，tokenChains=${graph.metrics.completeQueryStorageAuthorizationChains}，loginFlows=${graph.metrics.completeLoginFlows}/${graph.metrics.loginFlows}，guards=${graph.metrics.completeRouteGuards}/${graph.metrics.guardRegistrations}，dynamicRoutes=${graph.metrics.completeDynamicRouteInitializers}/${graph.metrics.dynamicRouteInitializers}，storageAdapters=${graph.metrics.resolvedStorageAdapters}/${graph.metrics.storageAdapters}`);
      return 0;
    }
    if (command === "spa-vue-router-analyze") {
      const sourceRoot = args[0], out = flag(args, "--out");
      if (!sourceRoot || !out) throw new Error("spa-vue-router-analyze 需要 <source-root> 和 --out");
      const graph = analyzeVueRouterResponsibility(resolve(sourceRoot));
      const serializable = { ...graph, sourceRoot: "<external-source>" };
      await writeFile(resolve(out), `${JSON.stringify(serializable, null, 2)}\n`, "utf8");
      console.log(`✓ 已生成 Vue Router responsibility graph: ${resolve(out)}`);
      console.log(`  files=${graph.metrics.filesScanned}，routes=${graph.metrics.routesDiscovered}，evidence=${graph.metrics.evidenceCount}，blocked=${graph.blockers.length > 0}，reviewRequired=${graph.reviewRequired}`);
      for (const reason of graph.blockers) console.log(`  [BLOCKED] ${reason}`);
      return graph.blockers.length > 0 ? 1 : 0;
    }
    if (command === "spa-router-sfc-analyze") {
      const sourceRoot = args[0], out = flag(args, "--out");
      if (!sourceRoot || !out) throw new Error("spa-router-sfc-analyze 需要 <source-root> 和 --out");
      const graph = analyzeRouterToSfcResponsibilities(resolve(sourceRoot));
      const serializable = { ...graph, sourceRoot: "<external-source>" };
      await writeFile(resolve(out), `${JSON.stringify(serializable, null, 2)}\n`, "utf8");
      console.log(`✓ 已生成 Router-to-SFC responsibility graph: ${resolve(out)}`);
      console.log(`  files=${graph.metrics.filesScanned}，routes=${graph.metrics.routeBindings}，resolved=${graph.metrics.resolvedRoutes}，dynamic=${graph.metrics.dynamicImports}，unresolved=${graph.metrics.unresolvedRoutes}，reviewRequired=${graph.reviewRequired}`);
      return graph.metrics.unresolvedRoutes > 0 ? 1 : 0;
    }
    if (command === "spa-api-route-link") {
      const sourceRoot = args[0], fixtureConfigPath = flag(args, "--fixture-config"), out = flag(args, "--out");
      if (!sourceRoot || !fixtureConfigPath || !out) throw new Error("spa-api-route-link 需要 <source-root>、--fixture-config 和 --out");
      const absoluteSourceRoot = resolve(sourceRoot);
      const config = JSON.parse(await readFile(resolve(fixtureConfigPath), "utf8")) as SpaRouterContractConfig;
      const sfc = analyzeSfcVisualResponsibilities(absoluteSourceRoot);
      const api = analyzeApiFixtureResponsibilities(absoluteSourceRoot, config, sfc.components);
      const router = analyzeRouterToSfcResponsibilities(absoluteSourceRoot);
      const graph = linkApiRouteOwnership(api, router, config);
      await writeFile(resolve(out), `${JSON.stringify({ ...graph, sourceRoot: "<external-source>" }, null, 2)}\n`, "utf8");
      console.log(`✓ 已生成 API route ownership graph: ${resolve(out)}`);
      console.log(`  flows=${graph.metrics.dynamicRouteFlows}，links=${graph.metrics.routeLinks}，matchedRecords=${graph.metrics.matchedRouteRecords}，unresolved=${graph.metrics.unresolvedFlows}，reviewRequired=${graph.reviewRequired}`);
      return 0;
    }
    if (command === "spa-vue-router-patch") {
      const sourceRoot = args[0], sourcePath = flag(args, "--source"), outDir = flag(args, "--out-dir");
      if (!sourceRoot || !sourcePath || !outDir) throw new Error("spa-vue-router-patch 需要 <source-root>、--source 和 --out-dir");
      const graph = analyzeVueRouterResponsibility(resolve(sourceRoot));
      const source = await readFile(resolve(sourcePath), "utf8");
      const patch = generateVueRouterIntegrationPatch(graph, source, { sourcePath: "permission.js", importPath: flag(args, "--import-path") });
      const absoluteOutDir = resolve(outDir);
      await mkdir(absoluteOutDir, { recursive: true });
      await writeFile(resolve(absoluteOutDir, "responsibility.graph.json"), `${JSON.stringify({ ...graph, sourceRoot: "<external-source>" }, null, 2)}\n`, "utf8");
      await writeFile(resolve(absoluteOutDir, "vue-router-contract-adapter.js.preview"), patch.adapter, "utf8");
      await writeFile(resolve(absoluteOutDir, "permission.js.preview"), patch.patched, "utf8");
      await writeFile(resolve(absoluteOutDir, "integration.patch"), patch.diff, "utf8");
      await writeFile(resolve(absoluteOutDir, "integration.metrics.json"), `${JSON.stringify(patch.metrics, null, 2)}\n`, "utf8");
      console.log(`✓ 已生成 review-only Vue Router integration patch: ${absoluteOutDir}`);
      console.log(`  blocked=${patch.metrics.blocked}，covered=${patch.metrics.responsibilitiesCovered.length}，missing=${patch.metrics.responsibilitiesMissing.length}，applied=${patch.metrics.applied}`);
      for (const reason of patch.metrics.blockingReasons) console.log(`  [BLOCKED] ${reason}`);
      return patch.metrics.blocked ? 1 : 0;
    }
    if (command === "transport-proxy-analyze") {
      const sourceRoot = args[0], out = flag(args, "--out");
      if (!sourceRoot || !out) throw new Error("transport-proxy-analyze 需要 <source-root> 和 --out");
      const graph = analyzeTransportProxyResponsibilities(resolve(sourceRoot));
      const serializable = { ...graph, sourceRoot: "<external-source>" };
      await writeFile(resolve(out), `${JSON.stringify(serializable, null, 2)}
`, "utf8");
      console.log(`✓ 已生成 Transport Proxy responsibility graph: ${resolve(out)}`);
      console.log(`  configs=${graph.metrics.configFiles}，scopes=${graph.metrics.proxyScopes}，routes=${graph.metrics.routes}，dynamicContexts=${graph.metrics.dynamicContextsMaterialized}，fallback=${graph.metrics.fallbackRoutes}，diagnostics=${graph.metrics.diagnostics}`);
      return graph.metrics.fallbackRoutes > 0 || graph.metrics.diagnostics > 0 ? 1 : 0;
    }
    if (command === "sfc-visual-analyze") {
      const sourceRoot = args[0], out = flag(args, "--out");
      if (!sourceRoot || !out) throw new Error("sfc-visual-analyze 需要 <source-root> 和 --out");
      const absoluteSourceRoot = resolve(sourceRoot);
      const graph = analyzeSfcVisualResponsibilities(absoluteSourceRoot);
      const fixtureConfigPath = flag(args, "--fixture-config");
      if (fixtureConfigPath) {
        const fixtureConfig = JSON.parse(await readFile(resolve(fixtureConfigPath), "utf8")) as SpaRouterContractConfig;
        graph.apiFixtures = analyzeApiFixtureResponsibilities(absoluteSourceRoot, fixtureConfig, graph.components);
      }
      const serializable = {
        ...graph,
        sourceRoot: "<external-source>",
        echarts: { ...graph.echarts, sourceRoot: "<external-source>" },
        apiFixtures: graph.apiFixtures ? { ...graph.apiFixtures, sourceRoot: "<external-source>" } : undefined,
      };
      await writeFile(resolve(out), `${JSON.stringify(serializable, null, 2)}\n`, "utf8");
      console.log(`✓ 已生成 SFC visual responsibility graph: ${resolve(out)}`);
      console.log(`  components=${graph.metrics.components}，interactive=${graph.metrics.interactiveComponents}，charts=${graph.metrics.chartComponents}，apiWrappers=${graph.apiFixtures?.metrics.actualApiWrappers ?? 0}，apiFixtures=${graph.apiFixtures?.metrics.matchedFixtures ?? 0}，apiFlows=${graph.apiFixtures?.metrics.responseFlows ?? 0}，dynamicRouteFlows=${graph.apiFixtures?.metrics.dynamicRouteFlows ?? 0}，stateHandlers=${graph.metrics.stateHandlers}，stateWrites=${graph.metrics.stateWrites}，displayFunctions=${graph.metrics.displayFunctions}，unresolvedStateWrites=${graph.metrics.unresolvedStateWrites}，mediaQueries=${graph.metrics.mediaQueries}，blocked=${graph.blockers.length > 0}`);
      for (const reason of graph.blockers) console.log(`  [BLOCKED] ${reason}`);
      return graph.blockers.length > 0 ? 1 : 0;
    }
    if (command === "data-surface") {
      const sfcPath = args[0], cardinalityPath = flag(args, "--cardinality"), apiPath = flag(args, "--api"), out = flag(args, "--out");
      if (!sfcPath || !out) throw new Error("data-surface 需要 <sfc-visual.graph.json> 和 --out");
      const sfcGraph = JSON.parse(await readFile(resolve(sfcPath), "utf8")) as { kind?: string; components?: DataSurfaceManifestInput["components"]; apiFixtures?: ApiFixtureResponsibilityGraph };
      if (sfcGraph.kind !== "sfc-visual-responsibility-graph" || !Array.isArray(sfcGraph.components)) throw new Error("data-surface 的 SFC 输入必须是 sfc-visual-responsibility-graph");
      const cardinality = cardinalityPath
        ? JSON.parse(await readFile(resolve(cardinalityPath), "utf8")) as DataCardinalityResponsibilityGraph
        : await skillRegistry.execute<DataCardinalitySkillInput, DataCardinalityResponsibilityGraph>("data-cardinality", { components: sfcGraph.components });
      const api = apiPath ? JSON.parse(await readFile(resolve(apiPath), "utf8")) as ApiFixtureResponsibilityGraph : sfcGraph.apiFixtures;
      if (cardinality.kind !== "data-cardinality-responsibility-graph") throw new Error("data-surface 的 cardinality 输入必须是 data-cardinality-responsibility-graph");
      if (!api || api.kind !== "api-fixture-responsibility-graph") throw new Error("data-surface 需要 --api 或 SFC graph.apiFixtures");
      if (!flag(args, "--source-root") && api.sourceRoot === "<external-source>") throw new Error("data-surface 输入使用了外部源占位符，必须提供 --source-root");
      const sourceHash = flag(args, "--source-hash");
      const identity = {
        ...(flag(args, "--source-root") ? { sourceRoot: resolve(flag(args, "--source-root")!) } : {}),
        ...(sourceHash ? { sourceHash, sourceHashKind: "source-content" as const } : {}),
        ...(flag(args, "--source-commit") ? { sourceCommit: flag(args, "--source-commit") } : {}),
        ...(flag(args, "--fixture-hash") ? { fixtureHash: flag(args, "--fixture-hash"), fixtureHashKind: "fixture-content" as const } : {}),
        ...(flag(args, "--config-hash") ? { configurationHash: flag(args, "--config-hash"), configurationHashKind: "configuration-content" as const } : {}),
        ...(flag(args, "--generated-at") ? { generatedAt: flag(args, "--generated-at") } : {}),
      };
      const manifest = await skillRegistry.execute<DataSurfaceManifestInput, DataSurfaceManifest>("data-surface-manifest", {
        components: sfcGraph.components,
        cardinality,
        api,
        ...(Object.keys(identity).length ? { identity } : {}),
      });
      assertDataSurfaceManifest(manifest);
      await writeFile(resolve(out), serializeDataSurfaceManifest(manifest), "utf8");
      console.log(`✓ 已生成 Data Surface Manifest: ${resolve(out)}`);
      console.log(`  surfaces=${manifest.metrics.surfaces}，api=${manifest.metrics.apiSurfaces}，static=${manifest.metrics.staticSurfaces}，prop=${manifest.metrics.propSurfaces}，runtime=${manifest.metrics.runtimeSurfaces}，unresolved=${manifest.metrics.unresolved}，reviewRequired=${manifest.reviewRequired}`);
      console.log(`  sourceHash=${manifest.identity.sourceHash}，fixtureHash=${manifest.identity.fixtureHash}，configurationHash=${manifest.identity.configurationHash}`);
      return 0;
    }
    if (command === "data-surface-validate") {
      const manifestPath = args[0];
      if (!manifestPath) throw new Error("data-surface-validate 需要 <data-surface.manifest.json>");
      const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8")) as DataSurfaceManifest;
      const report = validateDataSurfaceManifest(manifest);
      for (const item of report.issues) console.log(`[${report.valid ? "PASS" : "FAIL"}] ${item.path}: ${item.message}`);
      console.log(`Data Surface Manifest: ${report.valid ? "PASS" : "FAIL"}`);
      if (report.valid) {
        const blockers = manifest.review?.blockers.length ?? manifest.unresolved?.length ?? 0;
        const policyNotices = manifest.review?.policyNotices.length ?? 0;
        console.log(`  surfaces=${manifest.metrics.surfaces}，blockers=${blockers}，policyNotices=${policyNotices}，handoff=${manifest.reviewRequired ? "REVIEW_REQUIRED" : "READY"}`);
      }
      if (!report.valid) return 1;
      if (has(args, "--require-ready") && manifest.reviewRequired) return 1;
      return 0;
    }
    if (command === "visual-target-auto-v2") {
      const planPath = args[0], routeShellPath = flag(args, "--route-shell"), routerSfcPath = flag(args, "--router-sfc");
      const sfcVisualPath = flag(args, "--sfc-visual"), spaAuthPath = flag(args, "--spa-auth"), transportProxyPath = flag(args, "--transport-proxy"), apiRouteOwnershipPath = flag(args, "--api-route-ownership"), outDir = flag(args, "--out-dir");
      if (!planPath || !routeShellPath || !routerSfcPath || !sfcVisualPath || !spaAuthPath || !transportProxyPath || !outDir) throw new Error("visual-target-auto-v2 需要 visual plan、route shell、router-SFC、SFC visual、SPA auth、transport proxy 和 --out-dir");
      const visualPlan = JSON.parse(await readFile(resolve(planPath), "utf8")) as VisualTargetPlan;
      const routePlan = JSON.parse(await readFile(resolve(routeShellPath), "utf8")) as SpaRouteShellPlan;
      const routerSfc = JSON.parse(await readFile(resolve(routerSfcPath), "utf8")) as import("./planning/router-sfc-responsibility.js").RouterSfcResponsibilityGraph;
      const sfcVisual = JSON.parse(await readFile(resolve(sfcVisualPath), "utf8")) as SfcVisualResponsibilityGraph;
      const spaAuth = JSON.parse(await readFile(resolve(spaAuthPath), "utf8"));
      const transportProxy = JSON.parse(await readFile(resolve(transportProxyPath), "utf8"));
      const apiRouteOwnership = apiRouteOwnershipPath ? JSON.parse(await readFile(resolve(apiRouteOwnershipPath), "utf8")) as import("./planning/api-route-ownership.js").ApiRouteOwnershipGraph : undefined;
      const unresolvedApiRouteLinks = apiRouteOwnership?.links.filter((link) => link.routeOwnership.requiresReview).length ?? 0;
      if (routerSfc.metrics.unresolvedRoutes > 0 || visualPlan.metrics.unresolvedRoutes > 0 || unresolvedApiRouteLinks > 0) throw new Error(`auto-v2 dispatch blocked: routerSfc=${routerSfc.metrics.unresolvedRoutes}, visualPlan=${visualPlan.metrics.unresolvedRoutes}, apiRouteOwnership=${unresolvedApiRouteLinks}`);
      const readOptionalReport = async (name: string): Promise<unknown> => { const path = flag(args, name); return path ? JSON.parse(await readFile(resolve(path), "utf8")) : undefined; };
      const startedAt = performance.now();
      const bundle = { routePlan, visualPlan, routerSfc, sfcVisual, apiFixture: sfcVisual.apiFixtures, apiRouteOwnership, spaAuth, transportProxy };
      const artifact = generateGeneratedTargetAutoV2(bundle, {
        manualQualityReport: await readOptionalReport("--manual-report"), generatedQualityReport: await readOptionalReport("--generated-report"),
        manualEditedLines: optionalNonNegativeNumber(args, "--manual-edited-lines"), repairIterations: optionalNonNegativeNumber(args, "--repair-iterations"),
      });
      const generationMs = Number((performance.now() - startedAt).toFixed(3)); artifact.metrics.generationMs = generationMs; artifact.costComparison.autoV2FirstPass.generationMs = generationMs;
      const absoluteOutDir = resolve(outDir);
      for (const generated of artifact.files) { const destination = resolve(absoluteOutDir, generated.path); await mkdir(resolve(destination, ".."), { recursive: true }); await writeFile(destination, generated.content, "utf8"); }
      await writeFile(resolve(absoluteOutDir, "artifact.manifest.json"), `${JSON.stringify({ ...artifact, files: artifact.files.map(({ path, lines }) => ({ path, lines })) }, null, 2)}\n`, "utf8");
      await writeFile(resolve(absoluteOutDir, "generation.metrics.json"), `${JSON.stringify({ ...artifact.metrics, schemaVersion: "1.0", phase: "generated-target-auto-v2", deterministic: true, reviewRequired: true }, null, 2)}\n`, "utf8");
      await writeFile(resolve(absoluteOutDir, "experiment.comparison.json"), `${JSON.stringify({ quality: artifact.qualityComparison, cost: artifact.costComparison }, null, 2)}\n`, "utf8");
      await writeFile(resolve(absoluteOutDir, "README.md"), `# Generated target auto-v2

Responsibility-guided route and visual-owner shell.

- model calls: 0
- manual edits: 0
- route entries: ${artifact.metrics.routeEntries}
- visual owners: ${artifact.metrics.visualOwners}
- generated lines: ${artifact.metrics.generatedLines}
- generated bytes: ${artifact.metrics.generatedBytes}
- compiled visual nodes: ${artifact.metrics.generatedVisualNodes}
- interaction bindings: ${artifact.metrics.generatedInteractionBindings}
- global style contexts: ${artifact.metrics.globalStyleSheetsMaterialized}
- source styles: ${artifact.metrics.sourceStyleSheetsMaterialized}/${artifact.metrics.sourceStyleSheetsAvailable} materialized
- source style rules: ${artifact.metrics.sourceStyleRulesMaterialized}
- source style selector contexts: ${artifact.metrics.sourceStyleSelectorsMaterialized}
- initial state bindings: ${artifact.metrics.initialStateBindings}
- executable interaction bindings: ${artifact.metrics.executableInteractionBindings}
- executable state writes: ${artifact.metrics.executableStateWrites}
- runtime condition bindings: ${artifact.metrics.runtimeConditionBindings}
- reviewed fixture bindings: ${artifact.metrics.reviewedFixtureBindings}
- generated loop instances: ${artifact.metrics.generatedLoopInstances}
- resolved/unresolved text bindings: ${artifact.metrics.resolvedTextBindings}/${artifact.metrics.unresolvedTextBindings}
- inferred reviewed fixture selections: ${artifact.metrics.inferredFixtureSelections}
- reviewed API route links: ${artifact.metrics.reviewedApiRouteLinks}
- API route-owned records: ${artifact.metrics.apiRouteOwnedRecords}
- review required: true
- full generated application: false
- visual equivalence claimed: ${artifact.qualityComparison.comparable && artifact.qualityComparison.generated.passed === true ? "quality-report supplied; inspect formal gates" : "no"}

The artifact consumes Router-to-SFC, SFC visual, API fixture, SPA auth, transport proxy, and route-shell responsibility evidence. It must pass Semantic and Gold+ before any fidelity claim.
`, "utf8");
      console.log(`✓ 已生成 generated-target-auto-v2: ${absoluteOutDir}`);
      console.log(`  routes=${artifact.metrics.routeEntries}，owners=${artifact.metrics.visualOwners}，lines=${artifact.metrics.generatedLines}，nodes=${artifact.metrics.generatedVisualNodes}，bindings=${artifact.metrics.generatedInteractionBindings}，executableBindings=${artifact.metrics.executableInteractionBindings}，stateWrites=${artifact.metrics.executableStateWrites}，conditions=${artifact.metrics.runtimeConditionBindings}，fixtureBindings=${artifact.metrics.reviewedFixtureBindings}，loopInstances=${artifact.metrics.generatedLoopInstances}，textBindings=${artifact.metrics.resolvedTextBindings}/${artifact.metrics.unresolvedTextBindings}，fixtureSelections=${artifact.metrics.inferredFixtureSelections}，globalStyles=${artifact.metrics.globalStyleSheetsMaterialized}，sourceStyles=${artifact.metrics.sourceStyleSheetsMaterialized}/${artifact.metrics.sourceStyleSheetsAvailable}，sourceRules=${artifact.metrics.sourceStyleRulesMaterialized}，modelCalls=0，manualEdits=0，generationMs=${generationMs}，qualityComparable=${artifact.qualityComparison.comparable}`);
      return 0;
    }
    if (command === "visual-target-generate") {
      const planPath = args[0], routeShellPath = flag(args, "--route-shell"), outDir = flag(args, "--out-dir");
      if (!planPath || !routeShellPath || !outDir) throw new Error("visual-target-generate 需要 <visual-target.plan.json>、--route-shell 和 --out-dir");
      const plan = JSON.parse(await readFile(resolve(planPath), "utf8")) as VisualTargetPlan;
      const routePlan = JSON.parse(await readFile(resolve(routeShellPath), "utf8")) as SpaRouteShellPlan;
      const startedAt = performance.now();
      const artifact = generateVisualTargetArtifact(plan, routePlan);
      const absoluteOutDir = resolve(outDir);
      for (const generated of artifact.files) {
        const destination = resolve(absoluteOutDir, generated.path);
        await mkdir(resolve(destination, ".."), { recursive: true });
        await writeFile(destination, generated.content, "utf8");
      }
      const vendorRoot = flag(args, "--vendor-root");
      if (vendorRoot) {
        const vendorOut = resolve(absoluteOutDir, "public/vendor");
        await mkdir(vendorOut, { recursive: true });
        await copyFile(resolve(vendorRoot, "dist/echarts.min.js"), resolve(vendorOut, "echarts.min.js"));
        await copyFile(resolve(vendorRoot, "theme/macarons.js"), resolve(vendorOut, "macarons.js"));
      }
      const generationMs = Number((performance.now() - startedAt).toFixed(3));
      const metrics = { ...artifact.metrics, schemaVersion: "1.0", phase: "visual-target-generation", deterministic: true, generationMs, reviewMs: null, semanticRuns: 0, visualRuns: 0, qualityComparable: true };
      await writeFile(resolve(absoluteOutDir, "generation.metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
      await writeFile(resolve(absoluteOutDir, "artifact.manifest.json"), `${JSON.stringify({ ...artifact, files: artifact.files.map(({ path, lines }) => ({ path, lines })) }, null, 2)}\n`, "utf8");
      await writeFile(resolve(absoluteOutDir, "README.md"), `# Generated visual target auto-v1

Deterministic visual target generated from the reviewed route-shell plan and visual responsibility evidence.

- model calls: 0
- artifact manual edits: 0
- generated files: ${artifact.metrics.generatedFiles}
- generated lines: ${artifact.metrics.generatedLines}
- selected visual owners: ${artifact.metrics.visualOwners}
- primitive DOM nodes: ${artifact.metrics.primitiveDomNodes}
- primitive style rules: ${artifact.metrics.primitiveStyleRules}
- primitive interaction bindings: ${artifact.metrics.primitiveInteractionBindings}
- review required: true
- reviewed target source copied: no

Run Semantic navigation before visual Gold+. Formal measured iterations and remaining blockers are recorded in experiment.metrics.json and the parent case README.
`, "utf8");
      console.log(`✓ 已生成独立 auto-v1 visual target: ${absoluteOutDir}`);
      console.log(`  files=${artifact.metrics.generatedFiles}，lines=${artifact.metrics.generatedLines}，owners=${artifact.metrics.visualOwners}，charts=${artifact.metrics.chartOwners}，modelCalls=0，manualEdits=0，generationMs=${generationMs}`);
      if (!vendorRoot && artifact.metrics.chartOwners > 0) console.log("  [REVIEW] 未提供 --vendor-root；图表运行时需人工补齐后再执行视觉门禁");
      return 0;
    }
    if (command === "visual-target-plan") {
      const graphPath = args[0], routeShellPath = flag(args, "--route-shell"), out = flag(args, "--out");
      if (!graphPath || !routeShellPath || !out) throw new Error("visual-target-plan 需要 <sfc-visual.graph.json>、--route-shell 和 --out");
      const graph = JSON.parse(await readFile(resolve(graphPath), "utf8")) as SfcVisualResponsibilityGraph;
      const routePlan = JSON.parse(await readFile(resolve(routeShellPath), "utf8")) as SpaRouteShellPlan;
      const routerSfcPath = flag(args, "--router-sfc");
      const routerSfcGraph = routerSfcPath ? JSON.parse(await readFile(resolve(routerSfcPath), "utf8")) as import("./planning/router-sfc-responsibility.js").RouterSfcResponsibilityGraph : undefined;
      const startedAt = performance.now();
      const plan = generateVisualTargetPlan(graph, routePlan, routerSfcGraph);
      const generationMs = Number((performance.now() - startedAt).toFixed(3));
      await writeFile(resolve(out), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      const metricsOut = flag(args, "--metrics-out");
      if (metricsOut) await writeFile(resolve(metricsOut), `${JSON.stringify({
        schemaVersion: "1.0", phase: "visual-target-planning", deterministic: true, modelCalls: 0, generationMs,
        manualEdits: 0, manualEditedLines: 0, repairIterations: 0, semanticRuns: 0, visualRuns: 0,
        ...plan.metrics, requiresHumanReview: plan.reviewRequired,
      }, null, 2)}\n`, "utf8");
      console.log(`✓ 已生成 review-only visual target 计划: ${resolve(out)}`);
      console.log(`  boundaries=${plan.metrics.boundaries}，owners=${plan.metrics.owners}，charts=${plan.metrics.chartOwners}，responsive=${plan.metrics.responsiveOwners}，unresolved=${plan.metrics.unresolvedRoutes}，generationMs=${generationMs}`);
      for (const item of plan.unresolved) console.log(`  [UNRESOLVED] ${item.route}: ${item.reason}`);
      return plan.metrics.unresolvedRoutes > 0 ? 1 : 0;
    }
    if (command === "echarts-responsibility-analyze") {
      const sourceRoot = args[0], out = flag(args, "--out");
      if (!sourceRoot || !out) throw new Error("echarts-responsibility-analyze 需要 <source-root> 和 --out");
      const graph = analyzeEChartsResponsibilities(resolve(sourceRoot));
      await writeFile(resolve(out), `${JSON.stringify({ ...graph, sourceRoot: "<external-source>" }, null, 2)}\n`, "utf8");
      console.log(`✓ 已生成 ECharts responsibility graph: ${resolve(out)}`);
      console.log(`  chartFiles=${graph.metrics.chartFiles}，components=${graph.metrics.components}，types=${graph.chartTypes.join(",") || "unknown"}，themes=${graph.themes.join(",") || "default"}，blocked=${graph.blockers.length > 0}`);
      for (const reason of graph.blockers) console.log(`  [BLOCKED] ${reason}`);
      return graph.blockers.length > 0 ? 1 : 0;
    }
    if (command === "spa-shell-patch") {
      const planPath = args[0], sourcePath = flag(args, "--source"), outDir = flag(args, "--out-dir");
      if (!planPath || !sourcePath || !outDir) throw new Error("spa-shell-patch 需要 <route-shell.plan.json>、--source 和 --out-dir");
      const plan = JSON.parse(await readFile(resolve(planPath), "utf8"));
      const source = await readFile(resolve(sourcePath), "utf8");
      const patch = generateSpaRouteShellIntegrationPatch(plan, source, { sourcePath, importPath: flag(args, "--import-path") });
      const absoluteOutDir = resolve(outDir);
      await mkdir(absoluteOutDir, { recursive: true });
      await writeFile(resolve(absoluteOutDir, "integration.patch"), patch.diff, "utf8");
      await writeFile(resolve(absoluteOutDir, "app.js.preview"), patch.patched, "utf8");
      await writeFile(resolve(absoluteOutDir, "integration.metrics.json"), `${JSON.stringify(patch.metrics, null, 2)}\n`, "utf8");
      console.log(`✓ 已生成 review-only SPA route shell integration patch: ${absoluteOutDir}`);
      console.log(`  blocked=${patch.metrics.blocked}，changedLines=${patch.metrics.changedLines}，changedHunks=${patch.metrics.changedHunks}，applied=${patch.metrics.applied}`);
      for (const reason of patch.metrics.blockingReasons) console.log(`  [BLOCKED] ${reason}`);
      return patch.metrics.blocked ? 1 : 0;
    }
    if (command === "spa-shell-generate") {
      const planPath = args[0], outDir = flag(args, "--out-dir");
      if (!planPath || !outDir) throw new Error("spa-shell-generate 需要 <route-shell.plan.json> 和 --out-dir");
      const plan = JSON.parse(await readFile(resolve(planPath), "utf8"));
      const generationStartedAt = performance.now();
      const artifact = generateSpaRouteShellArtifact(plan, {
        baselinePath: flag(args, "--baseline-dir"),
        manualReportPath: flag(args, "--manual-report"),
        generatedReportPath: flag(args, "--generated-report"),
        generationMs: Number((performance.now() - generationStartedAt).toFixed(3)),
        manualEdits: parseNonNegativeInt(args, "--manual-edits"),
        manualEditedLines: parseNonNegativeInt(args, "--manual-edited-lines"),
        repairIterations: parseNonNegativeInt(args, "--repair-iterations"),
      });
      const absoluteOutDir = resolve(outDir);
      await mkdir(absoluteOutDir, { recursive: true });
      for (const file of artifact.files) await writeFile(resolve(absoluteOutDir, file.path), file.content, "utf8");
      const metricsOut = flag(args, "--metrics-out") ?? resolve(absoluteOutDir, "generation.metrics.json");
      await writeFile(resolve(metricsOut), `${JSON.stringify(artifact.metrics, null, 2)}\n`, "utf8");
      console.log(`✓ 已生成 SPA route shell 骨架: ${absoluteOutDir}`);
      console.log(`  files=${artifact.files.length}，lines=${artifact.metrics.generatedLines}，generationMs=${artifact.metrics.generationMs}`);
      console.log(`  diffComparable=${artifact.metrics.diff.comparable}，changedFiles=${artifact.metrics.diff.changedFiles}，changedLines=${artifact.metrics.diff.changedLines}`);
      console.log(`  qualityComparable=${artifact.metrics.qualityComparison.comparable}，reviewRequired=${artifact.metrics.reviewRequired}`);
      return 0;
    }
    if (command === "spa-router") {
      const configPath = args[0]; if (!configPath) throw new Error("spa-router 需要 <config.json>");
      const config = JSON.parse(await readFile(resolve(configPath), "utf8")) as SpaRouterContractConfig;
      const report = await skillRegistry.execute<SpaRouterSkillInput, SpaRouterContractReport>("spa-router", { config });
      const serialized = `${JSON.stringify(report, null, 2)}\n`;
      const out = flag(args, "--out"); if (out) await writeFile(resolve(out), serialized, "utf8");
      const lifecycleOut = flag(args, "--lifecycle-out");
      if (lifecycleOut) {
        const lifecyclePath = resolve(lifecycleOut);
        const lifecycle: Record<string, unknown> = { schemaVersion: "1.0", pid: process.pid, reportReady: true, reportWritten: Boolean(out), beforeExitObserved: false, exitObserved: false, reportReadyMs: report.telemetry.timing.reportReadyMs, browserCloseMs: report.telemetry.timing.browserCloseMs, activeHandlesAfterClose: report.telemetry.activeHandlesAfterClose, createdAt: new Date().toISOString() };
        const writeLifecycle = (): void => writeFileSync(lifecyclePath, `${JSON.stringify(lifecycle, null, 2)}\n`, "utf8");
        process.once("beforeExit", () => { lifecycle.beforeExitObserved = true; lifecycle.beforeExitAt = new Date().toISOString(); writeLifecycle(); });
        process.once("exit", (code) => { lifecycle.exitObserved = true; lifecycle.exitCode = code; lifecycle.exitAt = new Date().toISOString(); writeLifecycle(); });
        writeLifecycle();
      }
      if (report.mode === "reference-generated") {
        for (const comparison of report.comparisons ?? []) {
          const failureDetail = comparison.failures.map((failure) => failure.detail).join("；");
          console.log(`${comparison.passed ? "[PASS]" : "[FAIL]"} ${comparison.id}: referenceTransitions=${comparison.reference?.transitions.length ?? 0}，generatedTransitions=${comparison.generated?.transitions.length ?? 0}${failureDetail ? `，${failureDetail}` : ""}`);
        }
      } else {
        for (const result of report.results) console.log(`${result.passed ? "[PASS]" : "[FAIL]"} ${result.id}: ${new URL(result.finalUrl).pathname}，transitions=${result.transitions.length}，runtimeErrors=${result.runtimeErrors.length}，unmockedApi=${result.unmockedApiRequests.length}`);
      }
      for (const gate of report.qualityGates) console.log(`${gate.passed ? "[PASS]" : "[FAIL]"} ${gate.id}: ${gate.detail}`);
      if (report.telemetry.visualTargetRuns > 0) {
        console.log(`[INFO] visual reuse: targetRuns=${report.telemetry.visualTargetRuns}，reused=${report.telemetry.visualTargetReusedRuns}，fresh=${report.telemetry.visualTargetFreshRuns}，reviewedStateReused=${report.telemetry.visualStateReusedRuns}`);
        console.log(`[INFO] setup reuse: contractRuns=${report.telemetry.contractSetupStateReusedRuns}，contractStepsSkipped=${report.telemetry.contractSetupStepsSkipped}，visualRuns=${report.telemetry.visualSetupStateReusedRuns}，visualStepsSkipped=${report.telemetry.visualSetupStepsSkipped}`);
        console.log(`[INFO] setup owner timing: owners=${report.telemetry.contractSetupOwnerTiming.ownerRuns}，totalMs=${report.telemetry.contractSetupOwnerTiming.totalMs}，navigationMs=${report.telemetry.contractSetupOwnerTiming.navigationMs}，initialSettleMs=${report.telemetry.contractSetupOwnerTiming.initialSettleMs}，prefixStepsMs=${report.telemetry.contractSetupOwnerTiming.setupPrefixStepsMs}，checkpointMs=${report.telemetry.contractSetupOwnerTiming.checkpointStorageMs}，visualCaptureMs=${report.telemetry.contractSetupOwnerTiming.visualCaptureMs}`);
        console.log(`[INFO] visual stability: adaptiveWaitMs=${report.telemetry.visualAdaptiveWaitMs}，failures=${report.telemetry.visualStabilityFailures}`);
        console.log(`[INFO] canvas stability: scanMs=${report.telemetry.visualCanvas.canvasScanMs}，samples=${report.telemetry.visualCanvas.canvasSamples}，cacheHits=${report.telemetry.visualCanvas.canvasCacheHits}，signatureChanges=${report.telemetry.visualCanvas.canvasSignatureChanges}，invalidations=${report.telemetry.visualCanvas.canvasInvalidations}，postAnchorSkipped=${report.telemetry.visualPostAnchorSkippedRuns}`);
        console.log(`[INFO] visual phase timing: queueMs=${report.telemetry.visualRunTiming.queueWaitMs}，contextCreateMs=${report.telemetry.visualRunTiming.contextCreateMs}，navigationMs=${report.telemetry.visualRunTiming.navigationMs}，initialSettleMs=${report.telemetry.visualRunTiming.initialSettleMs}，stepsMs=${report.telemetry.visualRunTiming.scenarioStepsMs}，preAnchorMs=${report.telemetry.visualRunTiming.preAnchorStabilityMs}，postAnchorMs=${report.telemetry.visualRunTiming.postAnchorStabilityMs}，styleMs=${report.telemetry.visualRunTiming.computedStyleMs}，screenshotMs=${report.telemetry.visualRunTiming.screenshotMs}，pixelMs=${report.telemetry.visualRunTiming.pixelCompareMs}，contextCloseMs=${report.telemetry.visualRunTiming.contextCloseMs}`);
        console.log(`[INFO] visual scheduler: viewport=${report.telemetry.visualScheduler.maxActiveViewports}/${report.telemetry.visualScheduler.configuredViewportConcurrency}，contexts=${report.telemetry.visualScheduler.maxActiveContexts}，capture=${report.telemetry.visualScheduler.maxActiveCaptures}/${report.telemetry.visualScheduler.configuredCaptureConcurrency}，canvas=${report.telemetry.visualScheduler.maxActiveCanvasCaptures}/${report.telemetry.visualScheduler.configuredCanvasConcurrency}，pixel=${report.telemetry.visualScheduler.maxActivePixelComparisons}/${report.telemetry.visualScheduler.configuredPixelConcurrency}，captureQueueMs=${report.telemetry.visualScheduler.captureQueueWaitMs}，canvasQueueMs=${report.telemetry.visualScheduler.canvasQueueWaitMs}，pixelQueueMs=${report.telemetry.visualScheduler.pixelQueueWaitMs}`);
        console.log(`[INFO] visual stability samples: readinessMs=${report.telemetry.visualStability.resourceReadinessMs}，signatureMs=${report.telemetry.visualStability.signatureScanMs}，networkProbeMs=${report.telemetry.visualStability.networkProbeMs}，samples=${report.telemetry.visualStability.samples}，mutationBlocked=${report.telemetry.visualStability.mutationBlockedSamples}，resizeBlocked=${report.telemetry.visualStability.resizeBlockedSamples}，canvasBlocked=${report.telemetry.visualStability.canvasBlockedSamples}，layoutBlocked=${report.telemetry.visualStability.layoutBlockedSamples}，networkBlocked=${report.telemetry.visualStability.networkBlockedSamples}`);
        console.log(`[INFO] incremental signature: full=${report.telemetry.visualStability.signature.fullScans}，incremental=${report.telemetry.visualStability.signature.incrementalScans}，nodesScanned=${report.telemetry.visualStability.signature.nodesScanned}，nodesReused=${report.telemetry.visualStability.signature.nodesReused}，mutationInvalidations=${report.telemetry.visualStability.signature.mutationInvalidations}，resizeInvalidations=${report.telemetry.visualStability.signature.resizeInvalidations}，scrollInvalidations=${report.telemetry.visualStability.signature.scrollInvalidations}`);
        console.log(`[INFO] animation completion: targets=${report.telemetry.visualCanvas.animationTargetSamples}，completed=${report.telemetry.visualCanvas.animationCompletedSamples}，pendingSamples=${report.telemetry.visualCanvas.animationPendingSamples}，signals=${report.telemetry.visualCanvas.animationCompletionSignals}，echarts=${report.telemetry.visualCanvas.echartsCompletionSignals}，zrender=${report.telemetry.visualCanvas.zrenderCompletionSignals}`);
        for (const line of formatSpaRouterVisualDiagnostics(report)) console.log(line);
        console.log(`[INFO] browser shutdown: disconnectMs=${report.telemetry.timing.browserDisconnectMs}，processCloseMs=${report.telemetry.timing.browserProcessCloseMs}，totalCloseMs=${report.telemetry.timing.browserCloseMs}`);
      }
      console.log(`\nSPA Router 合同: ${report.passed ? "PASS" : "FAIL"} (${report.scenariosPassed}/${report.scenariosTotal})`);
      return report.passed ? 0 : 1;
    }
    if (command === "quality") {
      const html = args[0]; const lib = flag(args, "--lib"); if (!html || !lib) throw new Error("quality 需要 <html> 和 --lib");
      const interactionCoverage = optionalThreshold(args, "--interaction-coverage");
      const thresholds = interactionCoverage === undefined ? undefined : { interactionCoverage };
      const viewportFlag = flag(args, "--viewports");
      const viewports = viewportFlag ? resolveQualityViewports(viewportFlag) : undefined;
      const browserModeFlag = flag(args, "--browser-mode") ?? "legacy";
      if (!["legacy", "shared-browser"].includes(browserModeFlag)) throw new Error("--browser-mode 必须是 legacy 或 shared-browser");
      const concurrencyFlag = flag(args, "--browser-concurrency");
      const browserConcurrency = concurrencyFlag === undefined ? 1 : Number(concurrencyFlag);
      if (!Number.isInteger(browserConcurrency) || browserConcurrency < 1 || browserConcurrency > 8) throw new Error("--browser-concurrency 必须是 1..8 的整数");
      const browserResourceCache = flag(args, "--browser-resource-cache") ?? "off";
      if (!["off", "run-local"].includes(browserResourceCache)) throw new Error("--browser-resource-cache 必须是 off 或 run-local");
      const browserStability = flag(args, "--browser-stability") ?? "fixed";
      if (!["fixed", "adaptive"].includes(browserStability)) throw new Error("--browser-stability 必须是 fixed 或 adaptive");
      const browserShutdown = flag(args, "--browser-shutdown") ?? "graceful";
      if (!["graceful", "fast-kill"].includes(browserShutdown)) throw new Error("--browser-shutdown 必须是 graceful 或 fast-kill");
      const report = await runQualityGate({ htmlPath: html, libDir: lib, manifestPath: flag(args, "--manifest"), scenarioPath: flag(args, "--scenarios"), visual: !has(args, "--no-visual"), visualArtifactsDir: flag(args, "--visual-artifacts"), viewports, browserMode: browserModeFlag as "legacy" | "shared-browser", browserConcurrency, browserResourceCache: browserResourceCache as "off" | "run-local", browserStability: browserStability as "fixed" | "adaptive", browserShutdown: browserShutdown as "graceful" | "fast-kill", spaRouterConfigPath: flag(args, "--spa-router"), thresholds });
      const out = flag(args, "--out"); const serialized = `${JSON.stringify(report, null, 2)}\n`;
      if (out) await writeFile(resolve(out), serialized, "utf8"); for (const gate of report.gates) console.log(`${gate.passed ? "[PASS]" : "[FAIL]"} ${gate.id}: ${gate.detail}`); console.log(`\n质量门禁: ${report.passed ? "PASS" : "FAIL"}`); return report.passed ? 0 : 1;
    }
    usage(); return 2;
  } catch (error) { console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`); return 2; }
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
