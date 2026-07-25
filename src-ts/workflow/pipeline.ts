import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { analyzeHtml } from "../analysis/analyzer.js";
import { generateScenarios, computeCoverage, loadScenarios } from "../evaluation/scenarios.js";
import { evaluateBrowserQualityMatrix, evaluateBrowserQualitySuite, evaluateScenarioBrowserQualityMatrix } from "../evaluation/browser.js";
import { evaluateRoundtrip, evaluateScenario } from "../evaluation/roundtrip.js";
import { evaluateSpaRouterContract, type SpaRouterContractConfig, type SpaRouterContractReport } from "../evaluation/spa-router.js";
import { appendRuntimeSelectorCheck, validateLibrary } from "../validation/library.js";
import type { BrowserExecutionTelemetry } from "../evaluation/browser.js";
import type { BrowserQualityMatrixReport, BrowserScenarioQualityMatrixReport, Manifest, QualityThresholds, QualityViewport, Scenario, ScenarioDocument } from "../types.js";

export const DEFAULT_THRESHOLDS: QualityThresholds = {
  overall: 0.85,
  structure: 0.7,
  text: 0.8,
  scenarioState: 0.85,
  interactionCoverage: 0.8,
  selectorCoverage: 1,
  style: 0.98,
  pixelDiff: 0.02,
};

export const DISMANTLING_WORKFLOW = [
  { id: "understand", label: "通读 HTML，建立页面结构、主题色、交互和数据理解" },
  { id: "analyze", label: "调用确定性分析器，生成 manifest 作为事实参考" },
  { id: "plan", label: "生成组件边界、交互模型、复杂度预算和多视口验收规格，并通过 preflight" },
  { id: "produce", label: "按组件库规范产出 README/docs/src/examples" },
  { id: "validate", label: "运行 9 项强约束校验和 node --check" },
  { id: "roundtrip", label: "运行原页面与组件库往返对比" },
  { id: "revise", label: "根据失败门禁、缺失文本和交互状态修订，最多循环 3 轮" },
] as const;

export interface QualityGateReport {
  manifest: Manifest;
  validation: ReturnType<typeof validateLibrary>;
  roundtrip: Awaited<ReturnType<typeof evaluateRoundtrip>>;
  scenarios?: Array<Awaited<ReturnType<typeof evaluateScenario>>>;
  coverage?: ReturnType<typeof computeCoverage>;
  browser?: Awaited<ReturnType<typeof evaluateBrowserQualityMatrix>>["primary"];
  browserMatrix?: BrowserQualityMatrixReport;
  scenarioVisualMatrices?: BrowserScenarioQualityMatrixReport[];
  spaRouter?: SpaRouterContractReport;
  scores: { dom: number; visual: number | null; overall: number };
  passed: boolean;
  gates: Array<{ id: string; passed: boolean; detail: string }>;
  telemetry: {
    timing: {
      analyzeMs: number;
      validateMs: number;
      roundtripMs: number;
      visualMatrixMs: number;
      scenarioStateMs: number;
      scenarioVisualMatrixMs: number;
      spaRouterMs: number;
      totalMs: number;
    };
    workload: {
      interactions: number;
      formalScenarios: number;
      criticalScenarios: number;
      coverageWaivers: number;
      viewports: number;
      scenarioViewportRuns: number;
      spaRouterScenarios: number;
      spaRouterViewportRuns: number;
    };
    browser?: BrowserExecutionTelemetry;
  };
}

export async function runQualityGate(options: {
  htmlPath: string;
  libDir: string;
  manifestPath?: string;
  scenarioPath?: string;
  spaRouterConfigPath?: string;
  visual?: boolean;
  visualArtifactsDir?: string;
  viewports?: QualityViewport[];
  browserMode?: "legacy" | "shared-browser";
  browserConcurrency?: number;
  browserResourceCache?: "off" | "run-local";
  browserStability?: "fixed" | "adaptive";
  thresholds?: Partial<QualityThresholds>;
}): Promise<QualityGateReport> {
  const totalStartedAt = performance.now();
  const timing = { analyzeMs: 0, validateMs: 0, roundtripMs: 0, visualMatrixMs: 0, scenarioStateMs: 0, scenarioVisualMatrixMs: 0, spaRouterMs: 0, totalMs: 0 };
  const elapsed = (startedAt: number): number => Number((performance.now() - startedAt).toFixed(3));
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  let phaseStartedAt = performance.now();
  const manifest = options.manifestPath
    ? JSON.parse(await readFile(resolve(options.manifestPath), "utf8")) as Manifest
    : analyzeHtml(options.htmlPath);
  timing.analyzeMs = elapsed(phaseStartedAt);
  phaseStartedAt = performance.now();
  const staticValidation = validateLibrary(options.libDir);
  timing.validateMs = elapsed(phaseStartedAt);
  phaseStartedAt = performance.now();
  const roundtrip = await evaluateRoundtrip(options.htmlPath, options.libDir);
  timing.roundtripMs = elapsed(phaseStartedAt);
  let scenarios: QualityGateReport["scenarios"];
  let coverage: QualityGateReport["coverage"];
  let scenarioDocument: ScenarioDocument | undefined;
  let formalScenarios: Scenario[] = [];
  let criticalScenarios: Scenario[] = [];
  let formalScenarioCount = 0;
  let criticalScenarioCount = 0;
  let scenarioVisualMatrices: BrowserScenarioQualityMatrixReport[] | undefined;
  if (options.scenarioPath) {
    scenarioDocument = loadScenarios(JSON.parse(await readFile(resolve(options.scenarioPath), "utf8")));
    formalScenarios = scenarioDocument.scenarios.filter((item) => !item.candidate);
    criticalScenarios = formalScenarios.filter((scenario) => scenario.critical);
    formalScenarioCount = formalScenarios.length;
    criticalScenarioCount = criticalScenarios.length;
  }

  const browserMode = options.browserMode ?? "legacy";
  const browserConcurrency = Math.max(1, Math.floor(options.browserConcurrency ?? 1));
  let browserEvaluation: Awaited<ReturnType<typeof evaluateBrowserQualityMatrix>> | undefined;
  let browserTelemetry: BrowserExecutionTelemetry | undefined;
  if (options.visual !== false) {
    if (browserMode === "shared-browser") {
      const suite = await evaluateBrowserQualitySuite(options.htmlPath, options.libDir, criticalScenarios, {
        artifactDir: options.visualArtifactsDir,
        pixelThreshold: thresholds.pixelDiff,
        selectorCoverageThreshold: thresholds.selectorCoverage,
        styleThreshold: thresholds.style,
        viewports: options.viewports,
        concurrency: browserConcurrency,
        resourceCache: options.browserResourceCache ?? "off",
        stabilityMode: options.browserStability ?? "fixed",
      });
      browserEvaluation = suite.initial;
      browserTelemetry = suite.telemetry;
      timing.visualMatrixMs = suite.phaseTiming.initialMatrixMs;
      timing.scenarioVisualMatrixMs = suite.phaseTiming.scenarioMatricesMs;
      scenarioVisualMatrices = suite.scenarios.map((item) => ({ scenarioId: item.scenarioId, label: item.label, ...item.evaluation.matrix }));
    } else {
      phaseStartedAt = performance.now();
      browserEvaluation = await evaluateBrowserQualityMatrix(options.htmlPath, options.libDir, {
        artifactDir: options.visualArtifactsDir,
        pixelThreshold: thresholds.pixelDiff,
        selectorCoverageThreshold: thresholds.selectorCoverage,
        styleThreshold: thresholds.style,
        viewports: options.viewports,
        concurrency: browserConcurrency,
        stabilityMode: options.browserStability ?? "fixed",
      });
      timing.visualMatrixMs = elapsed(phaseStartedAt);
    }
  }
  const browser = browserEvaluation?.primary;
  const browserMatrix = browserEvaluation?.matrix;
  const validation = browserEvaluation ? appendRuntimeSelectorCheck(staticValidation, browserEvaluation.worstSelectorCoverage ?? null) : staticValidation;

  if (options.scenarioPath && scenarioDocument) {
    scenarios = [];
    const verified = new Set<string>();
    phaseStartedAt = performance.now();
    for (const scenario of formalScenarios) {
      const result = await evaluateScenario(options.htmlPath, options.libDir, options.scenarioPath, scenario, { threshold: thresholds.scenarioState });
      scenarios.push(result);
      if (result.passed) for (const fingerprint of scenario.covers ?? []) verified.add(fingerprint);
    }
    timing.scenarioStateMs = elapsed(phaseStartedAt);
    coverage = computeCoverage(manifest.interactions, scenarioDocument, verified);
    if (options.visual !== false && browserMode === "legacy" && criticalScenarios.length) {
      scenarioVisualMatrices = [];
      phaseStartedAt = performance.now();
      for (const scenario of criticalScenarios) {
        const result = await evaluateScenarioBrowserQualityMatrix(options.htmlPath, options.libDir, scenario, {
          artifactDir: options.visualArtifactsDir ? resolve(options.visualArtifactsDir, "scenarios", scenario.id) : undefined,
          pixelThreshold: thresholds.pixelDiff,
          selectorCoverageThreshold: thresholds.selectorCoverage,
          styleThreshold: thresholds.style,
          viewports: options.viewports,
          concurrency: browserConcurrency,
          stabilityMode: options.browserStability ?? "fixed",
        });
        scenarioVisualMatrices.push({ scenarioId: scenario.id, label: scenario.label, ...result.matrix });
      }
      timing.scenarioVisualMatrixMs = elapsed(phaseStartedAt);
    }
  }
  let spaRouter: SpaRouterContractReport | undefined;
  if (options.spaRouterConfigPath) {
    phaseStartedAt = performance.now();
    const spaRouterConfig = JSON.parse(await readFile(resolve(options.spaRouterConfigPath), "utf8")) as SpaRouterContractConfig;
    spaRouter = await evaluateSpaRouterContract(spaRouterConfig);
    timing.spaRouterMs = elapsed(phaseStartedAt);
  }
  const spaGate = (id: SpaRouterContractReport["qualityGates"][number]["id"]): boolean => spaRouter?.qualityGates.find((gate) => gate.id === id)?.passed ?? true;
  const visualScores = [browserMatrix?.score ?? 0, ...(scenarioVisualMatrices ?? []).map((matrix) => matrix.score)];
  const visualScore = browserMatrix ? Number(Math.min(...visualScores).toFixed(4)) : 0;
  const finalOverall = browserMatrix ? Number(((roundtrip.score?.overall ?? 0) * 0.4 + visualScore * 0.6).toFixed(4)) : (roundtrip.score?.overall ?? 0);
  const gates = [
    { id: "validation", passed: validation.ok, detail: `${validation.passed}/${validation.total} 校验通过` },
    { id: "render", passed: Boolean(roundtrip.reference.ok && roundtrip.generated.ok), detail: roundtrip.reference.ok && roundtrip.generated.ok ? "原页面和组件库均成功渲染" : "原页面或组件库渲染失败" },
    { id: "overall", passed: finalOverall >= thresholds.overall, detail: `finalOverall=${finalOverall}（dom=${roundtrip.score?.overall ?? 0}，visual=${visualScore}），门槛=${thresholds.overall}` },
    { id: "structure", passed: Boolean(roundtrip.score && roundtrip.score.scores.structure >= thresholds.structure), detail: `structure=${roundtrip.score?.scores.structure ?? 0}，门槛=${thresholds.structure}` },
    { id: "text", passed: Boolean(roundtrip.score && roundtrip.score.text.textMatchRate >= thresholds.text), detail: `text=${roundtrip.score?.text.textMatchRate ?? 0}，门槛=${thresholds.text}` },
  ];
  if (browserMatrix) {
    const passedViewports = browserMatrix.viewports.filter((viewport) => viewport.passed).length;
    const scenarioRuntimeErrors = (scenarioVisualMatrices ?? []).reduce((sum, matrix) => sum + matrix.runtimeErrors, 0);
    const stabilityFailures = browserMatrix.stabilityFailures + (scenarioVisualMatrices ?? []).reduce((sum, matrix) => sum + matrix.stabilityFailures, 0);
    const resourceFailures = browserMatrix.resourceFailures + (scenarioVisualMatrices ?? []).reduce((sum, matrix) => sum + matrix.resourceFailures, 0);
    const externalAvailabilityFailures = browserMatrix.externalAvailabilityFailures + (scenarioVisualMatrices ?? []).reduce((sum, matrix) => sum + matrix.externalAvailabilityFailures, 0);
    const worstSelectorCoverage = Math.min(browserMatrix.worstSelectorCoverage, ...(scenarioVisualMatrices ?? []).map((matrix) => matrix.worstSelectorCoverage));
    const worstComputedStyle = Math.min(browserMatrix.worstComputedStyle, ...(scenarioVisualMatrices ?? []).map((matrix) => matrix.worstComputedStyle));
    const worstPixelDiff = Math.max(browserMatrix.worstPixelDiff, ...(scenarioVisualMatrices ?? []).map((matrix) => matrix.worstPixelDiff));
    gates.push({ id: "viewport-matrix", passed: browserMatrix.passed, detail: `${passedViewports}/${browserMatrix.viewports.length} 视口通过，worst=${browserMatrix.worstViewport}` });
    if (scenarioVisualMatrices?.length || spaRouter?.visualMatrix) {
      const localPassed = !scenarioVisualMatrices?.length || scenarioVisualMatrices.every((matrix) => matrix.passed);
      const spaPassed = spaRouter?.visualMatrix?.passed ?? true;
      gates.push({ id: "scenario-viewport-matrix", passed: localPassed && spaPassed, detail: `interaction=${scenarioVisualMatrices?.filter((matrix) => matrix.passed).length ?? 0}/${scenarioVisualMatrices?.length ?? 0}，spaRouteStates=${spaRouter?.visualMatrix?.scenarios.filter((matrix) => matrix.passed).length ?? 0}/${spaRouter?.visualMatrix?.scenarioCount ?? 0}，spaViewportRuns=${spaRouter?.visualMatrix?.viewportRuns ?? 0}` });
    }
    gates.push({ id: "visual-runtime", passed: browserMatrix.viewports.length > 0 && browserMatrix.viewports.every((viewport) => viewport.available) && browserMatrix.runtimeErrors === 0 && scenarioRuntimeErrors === 0 && stabilityFailures === 0 && spaGate("visual-runtime"), detail: `initialViewports=${browserMatrix.viewports.length}，runtimeErrors=${browserMatrix.runtimeErrors + scenarioRuntimeErrors}，stabilityFailures=${stabilityFailures}，spaRuntimeErrors=${spaRouter?.runtimeErrors ?? 0}` });
    gates.push({ id: "resource-readiness", passed: resourceFailures === 0 && spaGate("resource-readiness"), detail: `requiredResourceFailures=${resourceFailures}，spaUnmockedApi=${spaRouter?.unmockedApiRequests ?? 0}` });
    gates.push({ id: "external-availability", passed: externalAvailabilityFailures === 0, detail: `requiredExternalFailures=${externalAvailabilityFailures}` });
    const navigationFailures = browserMatrix.navigationFailures + (scenarioVisualMatrices ?? []).reduce((sum, matrix) => sum + matrix.navigationFailures, 0);
    const worstNavigationIntegrity = Math.min(browserMatrix.worstNavigationIntegrity, ...(scenarioVisualMatrices ?? []).map((matrix) => matrix.worstNavigationIntegrity));
    gates.push({ id: "navigation-integrity", passed: navigationFailures === 0 && worstNavigationIntegrity >= 1 && spaGate("navigation-integrity"), detail: `worstNavigationIntegrity=${worstNavigationIntegrity}，navigationFailures=${navigationFailures}，spaNavigationIntegrity=${spaRouter?.navigationIntegrity.rate ?? "n/a"}，spaNavigationFailures=${spaRouter?.navigationIntegrity.failures ?? 0}` });
    const fontAlignmentFailures = browserMatrix.fontAlignmentFailures + (scenarioVisualMatrices ?? []).reduce((sum, matrix) => sum + matrix.fontAlignmentFailures, 0);
    const blockingFontStateMismatches = browserMatrix.blockingFontStateMismatches + (scenarioVisualMatrices ?? []).reduce((sum, matrix) => sum + matrix.blockingFontStateMismatches, 0);
    gates.push({ id: "font-face-alignment", passed: fontAlignmentFailures === 0, detail: `alignmentFailures=${fontAlignmentFailures}，blockingStateMismatches=${blockingFontStateMismatches}` });
    gates.push({ id: "selector-coverage", passed: worstSelectorCoverage >= thresholds.selectorCoverage, detail: `worstSelectorCoverage=${worstSelectorCoverage}，门槛=${thresholds.selectorCoverage}` });
    gates.push({ id: "computed-style", passed: worstComputedStyle >= thresholds.style, detail: `worstComputedStyle=${worstComputedStyle}，门槛=${thresholds.style}` });
    gates.push({ id: "pixel-diff", passed: worstPixelDiff <= thresholds.pixelDiff, detail: `worstPixelDiff=${worstPixelDiff}，门槛=${thresholds.pixelDiff}` });
  }
  if (spaRouter && !browserMatrix) {
    if (spaRouter.visualMatrix) gates.push({ id: "scenario-viewport-matrix", passed: spaGate("scenario-viewport-matrix"), detail: `spaRouteStates=${spaRouter.visualMatrix.scenarios.filter((matrix) => matrix.passed).length}/${spaRouter.visualMatrix.scenarioCount}，spaViewportRuns=${spaRouter.visualMatrix.viewportRuns}，worstComputedStyle=${spaRouter.visualMatrix.worstComputedStyle}，worstPixelDiff=${spaRouter.visualMatrix.worstPixelDiff}` });
    gates.push({ id: "visual-runtime", passed: spaGate("visual-runtime"), detail: `spaRuntimeErrors=${spaRouter.runtimeErrors}` });
    gates.push({ id: "resource-readiness", passed: spaGate("resource-readiness"), detail: `spaUnmockedApi=${spaRouter.unmockedApiRequests}` });
    gates.push({ id: "navigation-integrity", passed: spaGate("navigation-integrity"), detail: `spaNavigationIntegrity=${spaRouter.navigationIntegrity.rate}，spaNavigationFailures=${spaRouter.navigationIntegrity.failures}` });
  }
  if (spaRouter) {
    gates.push({ id: "spa-router-contract", passed: spaGate("scenario-protocol"), detail: `${spaRouter.scenariosPassed}/${spaRouter.scenariosTotal} 双端 SPA 场景通过，mode=${spaRouter.mode}` });
  }
  const interactionGateEnabled = thresholds.interactionCoverage !== null && manifest.interactions.length > 0;
  if (interactionGateEnabled) {
    gates.push({
      id: "scenario-protocol",
      passed: Boolean(scenarioDocument && formalScenarioCount > 0),
      detail: scenarioDocument
        ? `正式场景=${formalScenarioCount}，candidate=${scenarioDocument.scenarios.length - formalScenarioCount}，waiver=${scenarioDocument.coverageWaivers?.length ?? 0}`
        : `识别到 ${manifest.interactions.length} 个交互，但未提供 scenarios.json`,
    });
  }
  if (scenarios) {
    gates.push({ id: "scenarios", passed: scenarios.length > 0 && scenarios.every((item) => item.passed), detail: `${scenarios.filter((item) => item.passed).length}/${scenarios.length} 正式场景通过` });
  }
  if (interactionGateEnabled) {
    gates.push({
      id: "coverage",
      passed: Boolean(coverage && coverage.verifiedRate >= (thresholds.interactionCoverage as number)),
      detail: coverage
        ? `verifiedCoverage=${coverage.verifiedRate.toFixed(3)}，门槛=${thresholds.interactionCoverage}，eligible=${coverage.eligibleInteractions}，waived=${coverage.waivedInteractions}，navigation=${coverage.navigationInteractions ?? 0}，noOp=${coverage.noOpInteractions ?? 0}，lifecycle=${coverage.lifecycleInteractions ?? 0}`
        : `未生成交互覆盖报告，门槛=${thresholds.interactionCoverage}`,
    });
  }
  timing.totalMs = elapsed(totalStartedAt);
  const telemetry: QualityGateReport["telemetry"] = {
    timing,
    workload: {
      interactions: manifest.interactions.length,
      formalScenarios: formalScenarioCount,
      criticalScenarios: criticalScenarioCount,
      coverageWaivers: scenarioDocument?.coverageWaivers?.length ?? 0,
      viewports: browserMatrix?.viewports.length ?? 0,
      scenarioViewportRuns: (scenarioVisualMatrices ?? []).reduce((sum, matrix) => sum + matrix.viewports.length, 0),
      spaRouterScenarios: spaRouter?.scenariosTotal ?? 0,
      spaRouterViewportRuns: spaRouter?.visualMatrix?.viewportRuns ?? 0,
    },
    browser: browserTelemetry,
  };
  return { manifest, validation, roundtrip, scenarios, coverage, browser, browserMatrix, scenarioVisualMatrices, spaRouter, scores: { dom: roundtrip.score?.overall ?? 0, visual: browserMatrix ? visualScore : null, overall: finalOverall }, gates, telemetry, passed: gates.every((gate) => gate.passed) };
}

export async function writeManifest(path: string, manifest: Manifest): Promise<void> { await writeFile(resolve(path), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"); }
export async function writeScenarioDocument(path: string, document: ScenarioDocument): Promise<void> { await writeFile(resolve(path), `${JSON.stringify(document, null, 2)}\n`, "utf8"); }
export { analyzeHtml, generateScenarios };
