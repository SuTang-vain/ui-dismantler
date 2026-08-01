import { createHash } from "node:crypto";
import type { ResponsibilityGraphDelta, ResponsibilityNode } from "../core/responsibility/graph.js";
import { defineSkill, type DismantlingSkill } from "../core/skills/contract.js";
import type { QualityViewport } from "../types.js";
import { runQualityGate, type QualityGateReport } from "../workflow/pipeline.js";

export interface VisualEvaluationSkillInput {
  readonly htmlPath: string;
  readonly libraryRoot: string;
  readonly manifestPath?: string;
  readonly scenarioPath?: string;
  readonly spaRouterConfigPath?: string;
  readonly visualArtifactsDir?: string;
  readonly viewports?: readonly QualityViewport[];
  readonly browserMode?: "legacy" | "shared-browser";
  readonly browserConcurrency?: number;
  readonly browserResourceCache?: "off" | "run-local";
  readonly browserStability?: "fixed" | "adaptive";
  readonly browserShutdown?: "graceful" | "fast-kill";
}

export type VisualQualityEvaluator = (options: Parameters<typeof runQualityGate>[0]) => Promise<QualityGateReport>;

function evaluationNodeId(report: QualityGateReport): string {
  const identity = `${report.manifest.meta.source}\n${report.validation.target}`;
  return `visual-evaluation:${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`;
}

export function projectVisualEvaluationDelta(report: QualityGateReport): ResponsibilityGraphDelta {
  const failedGates = report.gates.filter((gate) => !gate.passed);
  const node: ResponsibilityNode = {
    id: evaluationNodeId(report),
    kind: "visual-quality-evaluation",
    owner: { file: report.manifest.meta.source },
    attributes: {
      libraryRoot: report.validation.target,
      passed: report.passed,
      domScore: report.scores.dom,
      visualScore: report.scores.visual,
      overallScore: report.scores.overall,
      viewports: report.browserMatrix?.viewports.length ?? 0,
      scenarioViewportRuns: report.telemetry.workload.scenarioViewportRuns,
      worstSelectorCoverage: report.browserMatrix?.worstSelectorCoverage ?? null,
      worstComputedStyle: report.browserMatrix?.worstComputedStyle ?? null,
      worstPixelDiff: report.browserMatrix?.worstPixelDiff ?? null,
      runtimeErrors: report.browserMatrix?.runtimeErrors ?? 0,
      stabilityFailures: report.browserMatrix?.stabilityFailures ?? 0,
      failedGates: failedGates.map((gate) => gate.id),
    },
    evidence: report.gates.map((gate) => ({ source: report.manifest.meta.source, detail: `${gate.id}: ${gate.detail}`, confidence: gate.passed ? "high" as const : "medium" as const })),
    confidence: report.passed ? "high" : "medium",
    reviewRequired: !report.passed,
  };
  return {
    schemaVersion: "1.0",
    skillId: "visual-evaluation",
    sourceGraphKind: "quality-gate-report",
    nodes: [node],
    edges: [],
    unresolved: failedGates.map((gate) => ({ owner: node.id, source: report.manifest.meta.source, reason: `${gate.id}: ${gate.detail}` })),
    reviewRequired: !report.passed,
  };
}

export function createVisualEvaluationSkill(evaluator: VisualQualityEvaluator = runQualityGate): DismantlingSkill<VisualEvaluationSkillInput, QualityGateReport> {
  return defineSkill({
    manifest: {
      id: "visual-evaluation",
      version: "1.0.0",
      contractVersion: "1.0",
      kind: "evaluation",
      summary: "Compatibility wrapper for the existing formal browser quality gate across reviewed viewports, scenarios, runtime, resources, styles, pixels, navigation, and fonts.",
      stages: ["validate"],
      consumes: ["html-path", "component-library-root"],
      optionalConsumes: ["source-manifest-path", "scenario-document-path", "spa-router-contract-config-path", "visual-artifact-root", "quality-viewports", "browser-execution-options"],
      produces: ["visual-quality-gate-report"],
      requires: ["source-structure", "component-library-validation"],
      optionalDependencies: ["spa-router"],
      qualityGates: ["viewport-matrix", "selector-coverage", "computed-style", "pixel-diff", "visual-runtime", "resource-readiness", "navigation-integrity", "font-face-alignment"],
      sideEffects: ["filesystem", "browser", "network"],
    },
    async execute(input) {
      return await evaluator({
        htmlPath: input.htmlPath,
        libDir: input.libraryRoot,
        visual: true,
        ...(input.manifestPath ? { manifestPath: input.manifestPath } : {}),
        ...(input.scenarioPath ? { scenarioPath: input.scenarioPath } : {}),
        ...(input.spaRouterConfigPath ? { spaRouterConfigPath: input.spaRouterConfigPath } : {}),
        ...(input.visualArtifactsDir ? { visualArtifactsDir: input.visualArtifactsDir } : {}),
        ...(input.viewports ? { viewports: input.viewports.map((viewport) => ({ ...viewport })) } : {}),
        ...(input.browserMode ? { browserMode: input.browserMode } : {}),
        ...(input.browserConcurrency !== undefined ? { browserConcurrency: input.browserConcurrency } : {}),
        ...(input.browserResourceCache ? { browserResourceCache: input.browserResourceCache } : {}),
        ...(input.browserStability ? { browserStability: input.browserStability } : {}),
        ...(input.browserShutdown ? { browserShutdown: input.browserShutdown } : {}),
      });
    },
    projectResponsibilityGraph: projectVisualEvaluationDelta,
  });
}

export const visualEvaluationSkill = createVisualEvaluationSkill();
