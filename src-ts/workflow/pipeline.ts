import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyzeHtml } from "../analysis/analyzer.js";
import { generateScenarios, computeCoverage, loadScenarios } from "../evaluation/scenarios.js";
import { evaluateBrowserQualityMatrix } from "../evaluation/browser.js";
import { evaluateRoundtrip, evaluateScenario } from "../evaluation/roundtrip.js";
import { appendRuntimeSelectorCheck, validateLibrary } from "../validation/library.js";
import type { BrowserQualityMatrixReport, Manifest, QualityThresholds, QualityViewport, ScenarioDocument } from "../types.js";

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
  scores: { dom: number; visual: number | null; overall: number };
  passed: boolean;
  gates: Array<{ id: string; passed: boolean; detail: string }>;
}

export async function runQualityGate(options: {
  htmlPath: string;
  libDir: string;
  manifestPath?: string;
  scenarioPath?: string;
  visual?: boolean;
  visualArtifactsDir?: string;
  viewports?: QualityViewport[];
  thresholds?: Partial<QualityThresholds>;
}): Promise<QualityGateReport> {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  const manifest = options.manifestPath
    ? JSON.parse(await readFile(resolve(options.manifestPath), "utf8")) as Manifest
    : analyzeHtml(options.htmlPath);
  const staticValidation = validateLibrary(options.libDir);
  const roundtrip = await evaluateRoundtrip(options.htmlPath, options.libDir);
  const browserEvaluation = options.visual === false ? undefined : await evaluateBrowserQualityMatrix(options.htmlPath, options.libDir, {
    artifactDir: options.visualArtifactsDir,
    pixelThreshold: thresholds.pixelDiff,
    selectorCoverageThreshold: thresholds.selectorCoverage,
    styleThreshold: thresholds.style,
    viewports: options.viewports,
  });
  const browser = browserEvaluation?.primary;
  const browserMatrix = browserEvaluation?.matrix;
  const validation = browserEvaluation ? appendRuntimeSelectorCheck(staticValidation, browserEvaluation.worstSelectorCoverage ?? null) : staticValidation;
  let scenarios: QualityGateReport["scenarios"];
  let coverage: QualityGateReport["coverage"];
  let scenarioDocument: ScenarioDocument | undefined;
  let formalScenarioCount = 0;
  if (options.scenarioPath) {
    scenarioDocument = loadScenarios(JSON.parse(await readFile(resolve(options.scenarioPath), "utf8")));
    const formalScenarios = scenarioDocument.scenarios.filter((item) => !item.candidate);
    formalScenarioCount = formalScenarios.length;
    scenarios = [];
    const verified = new Set<string>();
    for (const scenario of formalScenarios) {
      const result = await evaluateScenario(options.htmlPath, options.libDir, options.scenarioPath, scenario, { threshold: thresholds.scenarioState });
      scenarios.push(result);
      if (result.passed) for (const fingerprint of scenario.covers ?? []) verified.add(fingerprint);
    }
    coverage = computeCoverage(manifest.interactions, scenarioDocument, verified);
  }
  const visualScore = browserMatrix?.score ?? 0;
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
    gates.push({ id: "viewport-matrix", passed: browserMatrix.passed, detail: `${passedViewports}/${browserMatrix.viewports.length} 视口通过，worst=${browserMatrix.worstViewport}` });
    gates.push({ id: "visual-runtime", passed: browserMatrix.viewports.length > 0 && browserMatrix.viewports.every((viewport) => viewport.available) && browserMatrix.runtimeErrors === 0, detail: `viewports=${browserMatrix.viewports.length}，runtimeErrors=${browserMatrix.runtimeErrors}` });
    gates.push({ id: "selector-coverage", passed: browserMatrix.worstSelectorCoverage >= thresholds.selectorCoverage, detail: `worstSelectorCoverage=${browserMatrix.worstSelectorCoverage}，门槛=${thresholds.selectorCoverage}` });
    gates.push({ id: "computed-style", passed: browserMatrix.worstComputedStyle >= thresholds.style, detail: `worstComputedStyle=${browserMatrix.worstComputedStyle}，门槛=${thresholds.style}` });
    gates.push({ id: "pixel-diff", passed: browserMatrix.worstPixelDiff <= thresholds.pixelDiff, detail: `worstPixelDiff=${browserMatrix.worstPixelDiff}，门槛=${thresholds.pixelDiff}` });
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
        ? `verifiedCoverage=${coverage.verifiedRate.toFixed(3)}，门槛=${thresholds.interactionCoverage}，eligible=${coverage.eligibleInteractions}，waived=${coverage.waivedInteractions}`
        : `未生成交互覆盖报告，门槛=${thresholds.interactionCoverage}`,
    });
  }
  return { manifest, validation, roundtrip, scenarios, coverage, browser, browserMatrix, scores: { dom: roundtrip.score?.overall ?? 0, visual: browserMatrix?.score ?? null, overall: finalOverall }, gates, passed: gates.every((gate) => gate.passed) };
}

export async function writeManifest(path: string, manifest: Manifest): Promise<void> { await writeFile(resolve(path), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"); }
export async function writeScenarioDocument(path: string, document: ScenarioDocument): Promise<void> { await writeFile(resolve(path), `${JSON.stringify(document, null, 2)}\n`, "utf8"); }
export { analyzeHtml, generateScenarios };
