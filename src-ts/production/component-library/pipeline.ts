import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runQualityGate, type QualityGateReport } from "../../workflow/pipeline.js";
import { validateLibrary } from "../../validation/library.js";
import type { ValidationReport } from "../../types.js";
import { sha256, validateComponentLibraryBuildPlan, type ComponentLibraryBuildPlan } from "./contract.js";
import { materializeComponentLibrary, type ComponentLibraryMaterializationReport } from "./materializer.js";
import { runComponentLibraryRuntimeSmoke, type ComponentLibraryRuntimeSmokeReport } from "./smoke.js";
import { assessComponentLibrarySourceReadiness, type ComponentLibrarySourceReadinessReport } from "./source-readiness.js";

export type ComponentLibraryBuildStatus = "accepted" | "review-required" | "quality-failed" | "execution-failed" | "blocked";
export type ComponentLibraryBuildPhaseStatus = "not-required" | "not-run" | "passed" | "review-required" | "failed" | "blocked";

export interface ComponentLibraryProductionReceipt {
  readonly schemaVersion: "1.0";
  readonly kind: "component-library-production-receipt";
  readonly status: ComponentLibraryBuildStatus;
  readonly accepted: boolean;
  readonly identity: {
    readonly sourceHash: string;
    readonly configurationHash: string;
    readonly planHash: string;
    readonly outputHash: string;
    readonly qualityContractHash: string | null;
  };
  readonly phases: {
    readonly plan: ComponentLibraryBuildPhaseStatus;
    readonly sourceReadiness: ComponentLibraryBuildPhaseStatus;
    readonly materialization: ComponentLibraryBuildPhaseStatus;
    readonly smoke: ComponentLibraryBuildPhaseStatus;
    readonly validation: ComponentLibraryBuildPhaseStatus;
    readonly quality: ComponentLibraryBuildPhaseStatus;
  };
  readonly reasons: readonly string[];
}

export interface ComponentLibraryBuildReport {
  readonly schemaVersion: "1.0";
  readonly kind: "component-library-build-report";
  readonly status: ComponentLibraryBuildStatus;
  readonly outputRoot: string;
  readonly plan: ReturnType<typeof validateComponentLibraryBuildPlan>;
  readonly sourceReadiness?: ComponentLibrarySourceReadinessReport;
  readonly materialization?: ComponentLibraryMaterializationReport;
  readonly smoke?: ComponentLibraryRuntimeSmokeReport;
  readonly validation?: ValidationReport;
  readonly quality?: QualityGateReport;
  readonly receipt: ComponentLibraryProductionReceipt;
  readonly blockers: readonly string[];
  readonly timing: {
    readonly sourceReadinessMs: number;
    readonly materializeMs: number;
    readonly smokeMs: number;
    readonly validateMs: number;
    readonly qualityMs: number;
    readonly totalMs: number;
  };
}

function identity(plan: ComponentLibraryBuildPlan): ComponentLibraryProductionReceipt["identity"] {
  const planProjection = {
    ...plan,
    files: plan.files.map(({ content, ...file }) => file),
  };
  return {
    sourceHash: plan.identity.sourceHash,
    configurationHash: plan.identity.configurationHash,
    planHash: sha256(JSON.stringify(planProjection)),
    outputHash: sha256(plan.files.map((file) => `${file.path}:${file.contentHash}:${file.publish}`).sort().join("\n")),
    qualityContractHash: plan.quality ? sha256(JSON.stringify(plan.quality)) : null,
  };
}

function receipt(
  plan: ComponentLibraryBuildPlan,
  status: ComponentLibraryBuildStatus,
  phases: ComponentLibraryProductionReceipt["phases"],
  reasons: readonly string[],
): ComponentLibraryProductionReceipt {
  return {
    schemaVersion: "1.0",
    kind: "component-library-production-receipt",
    status,
    accepted: status === "accepted",
    identity: identity(plan),
    phases,
    reasons,
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function persistReport(
  report: ComponentLibraryBuildReport,
  outputRoot: string,
  options: { reportPath?: string },
  materialized: boolean,
): Promise<void> {
  const outputReportPath = resolve(outputRoot, ".ui-dismantler", "build-report.json");
  if (materialized) {
    await writeJson(outputReportPath, report);
    await writeJson(resolve(outputRoot, ".ui-dismantler", "production-receipt.json"), report.receipt);
  }
  if (options.reportPath && resolve(options.reportPath) !== outputReportPath) await writeJson(resolve(options.reportPath), report);
}

function issueMessages(report: ComponentLibrarySourceReadinessReport): string[] {
  return report.issues.filter((issue) => issue.severity !== "warning").map((issue) => `source-readiness:${issue.id}: ${issue.detail}${issue.reference ? ` (${issue.reference})` : ""}`);
}

export async function runComponentLibraryBuild(
  plan: ComponentLibraryBuildPlan,
  outputRoot: string,
  options: { overwrite?: boolean; reportPath?: string } = {},
): Promise<ComponentLibraryBuildReport> {
  const startedAt = performance.now();
  const elapsed = (phaseStartedAt: number): number => Number((performance.now() - phaseStartedAt).toFixed(3));
  const timing = { sourceReadinessMs: 0, materializeMs: 0, smokeMs: 0, validateMs: 0, qualityMs: 0, totalMs: 0 };
  const absoluteOutputRoot = resolve(outputRoot);
  const planValidation = validateComponentLibraryBuildPlan(plan);
  const initialPhases: ComponentLibraryProductionReceipt["phases"] = {
    plan: planValidation.ready ? "passed" : "blocked",
    sourceReadiness: plan.quality ? "not-run" : "not-required",
    materialization: "not-run",
    smoke: "not-run",
    validation: "not-run",
    quality: plan.quality ? "not-run" : "review-required",
  };
  if (!planValidation.ready) {
    const blockers = [
      ...planValidation.issues.map((issue) => `${issue.path}: ${issue.message}`),
      ...planValidation.blockers.map((issue) => `${issue.path}: ${issue.message}`),
      ...(plan.reviewRequired && planValidation.blockers.length === 0 ? ["component-library-build-plan requires review"] : []),
    ];
    const report: ComponentLibraryBuildReport = {
      schemaVersion: "1.0",
      kind: "component-library-build-report",
      status: "blocked",
      outputRoot: absoluteOutputRoot,
      plan: planValidation,
      receipt: receipt(plan, "blocked", initialPhases, blockers),
      blockers,
      timing: { ...timing, totalMs: elapsed(startedAt) },
    };
    await persistReport(report, absoluteOutputRoot, options, false);
    return report;
  }

  let sourceReadiness: ComponentLibrarySourceReadinessReport | undefined;
  let phases = { ...initialPhases };
  if (plan.quality) {
    const phaseStartedAt = performance.now();
    sourceReadiness = await assessComponentLibrarySourceReadiness(plan.quality);
    timing.sourceReadinessMs = elapsed(phaseStartedAt);
    phases = { ...phases, sourceReadiness: sourceReadiness.status === "ready" ? "passed" : sourceReadiness.status };
    if (sourceReadiness.status === "blocked") {
      const blockers = issueMessages(sourceReadiness);
      const report: ComponentLibraryBuildReport = {
        schemaVersion: "1.0",
        kind: "component-library-build-report",
        status: "blocked",
        outputRoot: absoluteOutputRoot,
        plan: planValidation,
        sourceReadiness,
        receipt: receipt(plan, "blocked", phases, blockers),
        blockers,
        timing: { ...timing, totalMs: elapsed(startedAt) },
      };
      await persistReport(report, absoluteOutputRoot, options, false);
      return report;
    }
  }

  let materialization: ComponentLibraryMaterializationReport | undefined;
  let smoke: ComponentLibraryRuntimeSmokeReport | undefined;
  let validation: ValidationReport | undefined;
  let quality: QualityGateReport | undefined;
  let activePhase: "materialization" | "smoke" | "validation" | "quality" = "materialization";
  const blockers: string[] = [];
  try {
    let phaseStartedAt = performance.now();
    activePhase = "materialization";
    materialization = await materializeComponentLibrary(plan, absoluteOutputRoot, { overwrite: options.overwrite });
    timing.materializeMs = elapsed(phaseStartedAt);
    phases = { ...phases, materialization: "passed" };

    phaseStartedAt = performance.now();
    activePhase = "smoke";
    smoke = await runComponentLibraryRuntimeSmoke(plan, absoluteOutputRoot);
    timing.smokeMs = elapsed(phaseStartedAt);
    phases = { ...phases, smoke: smoke.passed ? "passed" : "failed" };
    if (!smoke.passed) {
      blockers.push(...smoke.runtimeErrors, ...smoke.consoleErrors, ...smoke.missingLocalResources.map((resource) => `missing local resource: ${resource}`));
    } else {
      phaseStartedAt = performance.now();
      activePhase = "validation";
      validation = validateLibrary(absoluteOutputRoot);
      timing.validateMs = elapsed(phaseStartedAt);
      phases = { ...phases, validation: validation.ok ? "passed" : "failed" };
      if (!validation.ok) {
        blockers.push(...validation.results.filter((result) => !result.passed).map((result) => `${result.id}: ${result.detail}`));
      } else if (plan.quality) {
        phaseStartedAt = performance.now();
        activePhase = "quality";
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
        phases = { ...phases, quality: quality.passed ? "passed" : "failed" };
        if (!quality.passed) blockers.push(...quality.gates.filter((gate) => !gate.passed).map((gate) => `${gate.id}: ${gate.detail}`));
      }
    }
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
    phases = { ...phases, [activePhase]: "failed" };
    timing.totalMs = elapsed(startedAt);
    const report: ComponentLibraryBuildReport = {
      schemaVersion: "1.0",
      kind: "component-library-build-report",
      status: "execution-failed",
      outputRoot: absoluteOutputRoot,
      plan: planValidation,
      ...(sourceReadiness ? { sourceReadiness } : {}),
      ...(materialization ? { materialization } : {}),
      ...(smoke ? { smoke } : {}),
      ...(validation ? { validation } : {}),
      ...(quality ? { quality } : {}),
      receipt: receipt(plan, "execution-failed", phases, blockers),
      blockers,
      timing,
    };
    await persistReport(report, absoluteOutputRoot, options, Boolean(materialization));
    return report;
  }

  let status: ComponentLibraryBuildStatus;
  if (smoke && !smoke.passed) status = "execution-failed";
  else if ((validation && !validation.ok) || (quality && !quality.passed)) status = "quality-failed";
  else if (!plan.quality || !plan.quality.visual || sourceReadiness?.status === "review-required") status = "review-required";
  else status = "accepted";
  if (!plan.quality) blockers.push("reviewed quality contract was not provided; materialization is not accepted for release");
  else if (!plan.quality.visual) blockers.push("reviewed browser visual Gold+ execution is disabled; semantic quality alone is not accepted for release");
  if (sourceReadiness?.status === "review-required") blockers.push(...issueMessages(sourceReadiness));
  timing.totalMs = elapsed(startedAt);
  const report: ComponentLibraryBuildReport = {
    schemaVersion: "1.0",
    kind: "component-library-build-report",
    status,
    outputRoot: absoluteOutputRoot,
    plan: planValidation,
    ...(sourceReadiness ? { sourceReadiness } : {}),
    ...(materialization ? { materialization } : {}),
    ...(smoke ? { smoke } : {}),
    ...(validation ? { validation } : {}),
    ...(quality ? { quality } : {}),
    receipt: receipt(plan, status, phases, blockers),
    blockers,
    timing,
  };
  await persistReport(report, absoluteOutputRoot, options, Boolean(materialization));
  return report;
}
