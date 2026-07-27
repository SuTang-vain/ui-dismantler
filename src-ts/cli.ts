#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { analyzeHtml } from "./analysis/analyzer.js";
import { generateScenarios } from "./evaluation/scenarios.js";
import { evaluateBrowserQuality, evaluateLibrarySelectorCoverage, resolveQualityViewports } from "./evaluation/browser.js";
import { evaluateRoundtrip } from "./evaluation/roundtrip.js";
import { evaluateSpaRouterContract, type SpaRouterContractConfig } from "./evaluation/spa-router.js";
import { formatSpaRouterVisualDiagnostics } from "./evaluation/spa-router-report.js";
import { appendRuntimeSelectorCheck, validateLibrary } from "./validation/library.js";
import { planComponents, writeComponentPlanningReport, writeComponentSpecs } from "./planning/components.js";
import { generateSpaRouteShellPlan } from "./planning/spa-route-shell.js";
import { generateSpaRouteShellArtifact } from "./planning/spa-route-shell-generator.js";
import { generateSpaRouteShellIntegrationPatch } from "./planning/spa-route-shell-patch.js";
import { analyzeVueRouterResponsibility } from "./planning/vue-router-responsibility.js";
import { generateVueRouterIntegrationPatch } from "./planning/vue-router-patch.js";
import { analyzeEChartsResponsibilities } from "./planning/echarts-responsibility.js";
import { analyzeSfcVisualResponsibilities, type SfcVisualResponsibilityGraph } from "./planning/sfc-visual-responsibility.js";
import { generateVisualTargetPlan, type VisualTargetPlan } from "./planning/visual-target-plan.js";
import { generateVisualTargetArtifact } from "./planning/visual-target-generator.js";
import { analyzeApiFixtureResponsibilities } from "./planning/api-fixture-responsibility.js";
import type { SpaRouteShellPlan } from "./planning/spa-route-shell.js";
import { runQualityGate, writeManifest, writeScenarioDocument } from "./workflow/pipeline.js";

function flag(args: string[], name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function has(args: string[], name: string): boolean { return args.includes(name); }
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
function usage(): void {
  console.error(`ui-dismantler-ts\n\n命令:\n  analyze <html> --out <manifest> [--profile <name>] [--minimal]\n  plan <html> --out <component-plan.json> [--spec-dir <dir>] [--line-budget <n>]\n  validate <lib-dir>\n  scenarios <manifest> --out <scenarios.json>\n  roundtrip <html> --lib <lib-dir> [--out <report.json>]\n  quality <html> --lib <lib-dir> [--manifest <manifest>] [--scenarios <scenarios.json>] [--interaction-coverage <0..1|off>] [--viewports <desktop,tablet,mobile,tiny>] [--browser-mode <legacy|shared-browser>] [--browser-concurrency <n>] [--browser-resource-cache <off|run-local>] [--browser-stability <fixed|adaptive>] [--browser-shutdown <graceful|fast-kill>] [--spa-router <config.json>] [--out <report.json>]\n  spa-router <config.json> [--out <report.json>]\n  spa-shell-generate <route-shell.plan.json> --out-dir <dir> [--baseline-dir <dir>] [--manual-report <report.json>] [--generated-report <report.json>] [--manual-edits <n>] [--manual-edited-lines <n>] [--repair-iterations <n>] [--metrics-out <metrics.json>]\n  spa-vue-router-analyze <source-root> --out <responsibility.graph.json>\n  spa-vue-router-patch <source-root> --source <permission.js> --out-dir <dir> [--import-path <path>]\n  sfc-visual-analyze <source-root> --out <sfc-visual.graph.json> [--fixture-config <spa-router.config.json>]\n  echarts-responsibility-analyze <source-root> --out <echarts.graph.json>\n  visual-target-plan <sfc-visual.graph.json> --route-shell <route-shell.plan.json> --out <visual-target.plan.json> [--metrics-out <metrics.json>]\n  visual-target-generate <visual-target.plan.json> --route-shell <route-shell.plan.json> --out-dir <dir> [--vendor-root <echarts-root>]\n`);
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
    if (command === "analyze") {
      const html = args[0]; const out = flag(args, "--out") ?? flag(args, "-o");
      if (!html || !out) throw new Error("analyze 需要 <html> 和 --out");
      const manifest = analyzeHtml(html, { profile: flag(args, "--profile"), minimal: has(args, "--minimal") });
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
      const manifest = analyzeHtml(html, { profile: flag(args, "--profile"), minimal: has(args, "--minimal") });
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
      console.log(`  components=${graph.metrics.components}，interactive=${graph.metrics.interactiveComponents}，charts=${graph.metrics.chartComponents}，apiFixtures=${graph.apiFixtures?.metrics.matchedFixtures ?? 0}，mediaQueries=${graph.metrics.mediaQueries}，blocked=${graph.blockers.length > 0}`);
      for (const reason of graph.blockers) console.log(`  [BLOCKED] ${reason}`);
      return graph.blockers.length > 0 ? 1 : 0;
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
      const startedAt = performance.now();
      const plan = generateVisualTargetPlan(graph, routePlan);
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
      const report = await evaluateSpaRouterContract(config);
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
        console.log(`[INFO] visual reuse: targetRuns=${report.telemetry.visualTargetRuns}，reused=${report.telemetry.visualTargetReusedRuns}，fresh=${report.telemetry.visualTargetFreshRuns}`);
        console.log(`[INFO] visual stability: adaptiveWaitMs=${report.telemetry.visualAdaptiveWaitMs}，failures=${report.telemetry.visualStabilityFailures}`);
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
