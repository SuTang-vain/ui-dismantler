import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runQualityGate, type QualityGateReport } from "../../workflow/pipeline.js";
import { validateLibrary } from "../../validation/library.js";
import type { ValidationReport } from "../../types.js";
import { validateComponentLibraryBuildPlan, type ComponentLibraryBuildPlan } from "./contract.js";
import { materializeComponentLibrary, type ComponentLibraryMaterializationReport } from "./materializer.js";
import { runComponentLibraryRuntimeSmoke, type ComponentLibraryRuntimeSmokeReport } from "./smoke.js";

export type ComponentLibraryBuildStatus = "succeeded" | "failed" | "blocked";

export interface ComponentLibraryBuildReport {
  readonly schemaVersion: "1.0";
  readonly kind: "component-library-build-report";
  readonly status: ComponentLibraryBuildStatus;
  readonly outputRoot: string;
  readonly plan: ReturnType<typeof validateComponentLibraryBuildPlan>;
  readonly materialization?: ComponentLibraryMaterializationReport;
  readonly smoke?: ComponentLibraryRuntimeSmokeReport;
  readonly validation?: ValidationReport;
  readonly quality?: QualityGateReport;
  readonly blockers: readonly string[];
  readonly timing: {
    readonly materializeMs: number;
    readonly smokeMs: number;
    readonly validateMs: number;
    readonly qualityMs: number;
    readonly totalMs: number;
  };
}

export async function runComponentLibraryBuild(
  plan: ComponentLibraryBuildPlan,
  outputRoot: string,
  options: { overwrite?: boolean; reportPath?: string } = {},
): Promise<ComponentLibraryBuildReport> {
  const startedAt = performance.now();
  const elapsed = (phaseStartedAt: number): number => Number((performance.now() - phaseStartedAt).toFixed(3));
  const timing = { materializeMs: 0, smokeMs: 0, validateMs: 0, qualityMs: 0, totalMs: 0 };
  const absoluteOutputRoot = resolve(outputRoot);
  const planValidation = validateComponentLibraryBuildPlan(plan);
  if (!planValidation.ready) {
    const report: ComponentLibraryBuildReport = {
      schemaVersion: "1.0",
      kind: "component-library-build-report",
      status: "blocked",
      outputRoot: absoluteOutputRoot,
      plan: planValidation,
      blockers: [
        ...planValidation.issues.map((issue) => `${issue.path}: ${issue.message}`),
        ...planValidation.blockers.map((issue) => `${issue.path}: ${issue.message}`),
        ...(plan.reviewRequired && planValidation.blockers.length === 0 ? ["component-library-build-plan requires review"] : []),
      ],
      timing: { ...timing, totalMs: elapsed(startedAt) },
    };
    if (options.reportPath) await writeFile(resolve(options.reportPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return report;
  }
  let phaseStartedAt = performance.now();
  const materialization = await materializeComponentLibrary(plan, absoluteOutputRoot, { overwrite: options.overwrite });
  timing.materializeMs = elapsed(phaseStartedAt);
  phaseStartedAt = performance.now();
  const smoke = await runComponentLibraryRuntimeSmoke(plan, absoluteOutputRoot);
  timing.smokeMs = elapsed(phaseStartedAt);
  let validation: ValidationReport | undefined;
  let quality: QualityGateReport | undefined;
  const blockers: string[] = [];
  if (!smoke.passed) {
    blockers.push(...smoke.runtimeErrors, ...smoke.consoleErrors, ...smoke.missingLocalResources.map((resource) => `missing local resource: ${resource}`));
  } else {
    phaseStartedAt = performance.now();
    validation = validateLibrary(absoluteOutputRoot);
    timing.validateMs = elapsed(phaseStartedAt);
    if (!validation.ok) blockers.push(...validation.results.filter((result) => !result.passed).map((result) => `${result.id}: ${result.detail}`));
    else if (plan.quality) {
      phaseStartedAt = performance.now();
      quality = await runQualityGate({
        htmlPath: plan.quality.originalHtmlPath,
        libDir: absoluteOutputRoot,
        manifestPath: plan.quality.manifestPath,
        scenarioPath: plan.quality.scenarioPath,
        spaRouterConfigPath: plan.quality.spaRouterConfigPath,
        visual: plan.quality.visual,
        visualArtifactsDir: plan.quality.visualArtifactsDir,
        ...(plan.quality.viewports ? { viewports: plan.quality.viewports.map((viewport) => ({ ...viewport })) } : {}),
        ...(plan.quality.browserMode ? { browserMode: plan.quality.browserMode } : {}),
        ...(plan.quality.browserConcurrency !== undefined ? { browserConcurrency: plan.quality.browserConcurrency } : {}),
        ...(plan.quality.browserResourceCache ? { browserResourceCache: plan.quality.browserResourceCache } : {}),
        ...(plan.quality.browserStability ? { browserStability: plan.quality.browserStability } : {}),
        ...(plan.quality.browserShutdown ? { browserShutdown: plan.quality.browserShutdown } : {}),
      });
      timing.qualityMs = elapsed(phaseStartedAt);
      if (!quality.passed) blockers.push(...quality.gates.filter((gate) => !gate.passed).map((gate) => `${gate.id}: ${gate.detail}`));
    }
  }
  timing.totalMs = elapsed(startedAt);
  const report: ComponentLibraryBuildReport = {
    schemaVersion: "1.0",
    kind: "component-library-build-report",
    status: blockers.length === 0 ? "succeeded" : "failed",
    outputRoot: absoluteOutputRoot,
    plan: planValidation,
    materialization,
    smoke,
    ...(validation ? { validation } : {}),
    ...(quality ? { quality } : {}),
    blockers,
    timing,
  };
  const reportPath = options.reportPath ?? resolve(absoluteOutputRoot, ".ui-dismantler", "build-report.json");
  await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}
