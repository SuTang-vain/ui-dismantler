import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, readlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { DEFAULT_THRESHOLDS, runQualityGate, type QualityGateReport } from "../../workflow/pipeline.js";
import { validateLibrary } from "../../validation/library.js";
import type { QualityViewport, ValidationReport } from "../../types.js";
import { sha256 } from "./contract.js";
import type { ComponentLibraryBuildPhaseStatus, ComponentLibraryBuildStatus } from "./pipeline.js";
import { assessComponentLibrarySourceReadiness, type ComponentLibrarySourceReadinessReport } from "./source-readiness.js";

export interface ComponentLibraryAcceptanceOptions {
  readonly manifestPath?: string;
  readonly scenarioPath?: string;
  readonly spaRouterConfigPath?: string;
  readonly resourceProfile?: "dom" | "canvas";
  readonly visualArtifactsDir?: string;
  readonly viewports?: readonly QualityViewport[];
  readonly browserMode?: "legacy" | "shared-browser";
  readonly browserConcurrency?: number;
  readonly browserResourceCache?: "off" | "run-local";
  readonly browserStability?: "fixed" | "adaptive";
  readonly browserShutdown?: "graceful" | "fast-kill";
  readonly reportPath?: string;
}

export interface ComponentLibraryAcceptanceReceipt {
  readonly schemaVersion: "1.0";
  readonly kind: "component-library-acceptance-receipt";
  readonly status: ComponentLibraryBuildStatus;
  readonly accepted: boolean;
  readonly identity: {
    readonly sourceHash: string | null;
    readonly libraryHash: string | null;
    readonly configurationHash: string;
    readonly qualityContractHash: string;
    readonly qualityResultHash: string | null;
  };
  readonly phases: {
    readonly sourceReadiness: ComponentLibraryBuildPhaseStatus;
    readonly validation: ComponentLibraryBuildPhaseStatus;
    readonly quality: ComponentLibraryBuildPhaseStatus;
  };
  readonly reasons: readonly string[];
}

export interface ComponentLibraryAcceptanceReport {
  readonly schemaVersion: "1.0";
  readonly kind: "component-library-acceptance-report";
  readonly status: ComponentLibraryBuildStatus;
  readonly sourcePath: string;
  readonly libraryRoot: string;
  readonly sourceReadiness?: ComponentLibrarySourceReadinessReport;
  readonly validation?: ValidationReport;
  readonly quality?: QualityGateReport;
  readonly receipt: ComponentLibraryAcceptanceReceipt;
  readonly blockers: readonly string[];
  readonly timing: {
    readonly identityMs: number;
    readonly sourceReadinessMs: number;
    readonly validationMs: number;
    readonly qualityMs: number;
    readonly totalMs: number;
  };
}

const EXCLUDED_IDENTITY_ROOTS = new Set([".git", ".ui-dismantler", "node_modules"]);

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}

async function optionalFileHash(path: string | undefined): Promise<string | null> {
  if (!path) return null;
  return createHash("sha256").update(await readFile(resolve(path))).digest("hex");
}

async function sourceHash(path: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await readFile(resolve(path))).digest("hex");
  } catch {
    return null;
  }
}

async function libraryHash(root: string): Promise<string | null> {
  const absoluteRoot = resolve(root);
  try {
    const entries: string[] = [];
    const visit = async (directory: string): Promise<void> => {
      const children = await readdir(directory, { withFileTypes: true });
      children.sort((left, right) => left.name.localeCompare(right.name));
      for (const child of children) {
        const absolutePath = resolve(directory, child.name);
        const relativePath = relative(absoluteRoot, absolutePath).split(sep).join("/");
        const rootName = relativePath.split("/", 1)[0];
        if (EXCLUDED_IDENTITY_ROOTS.has(rootName)) continue;
        if (child.isDirectory()) {
          entries.push(`directory:${relativePath}`);
          await visit(absolutePath);
        } else if (child.isSymbolicLink()) {
          entries.push(`symlink:${relativePath}:${await readlink(absolutePath)}`);
        } else if (child.isFile()) {
          const digest = createHash("sha256").update(await readFile(absolutePath)).digest("hex");
          entries.push(`file:${relativePath}:${digest}`);
        } else {
          const stats = await lstat(absolutePath);
          entries.push(`other:${relativePath}:${stats.mode}`);
        }
      }
    };
    await visit(absoluteRoot);
    return sha256(entries.join("\n"));
  } catch {
    return null;
  }
}

async function acceptanceIdentity(
  sourcePath: string,
  libraryRoot: string,
  options: ComponentLibraryAcceptanceOptions,
): Promise<Omit<ComponentLibraryAcceptanceReceipt["identity"], "qualityResultHash">> {
  const [resolvedSourceHash, resolvedLibraryHash, manifestHash, scenarioHash, spaRouterHash] = await Promise.all([
    sourceHash(sourcePath),
    libraryHash(libraryRoot),
    optionalFileHash(options.manifestPath),
    optionalFileHash(options.scenarioPath),
    optionalFileHash(options.spaRouterConfigPath),
  ]);
  const qualityContract = {
    thresholds: DEFAULT_THRESHOLDS,
    resourceProfile: options.resourceProfile ?? "dom",
    manifestHash,
    scenarioHash,
    spaRouterHash,
    visual: true,
    viewports: options.viewports?.map((viewport) => ({ ...viewport })) ?? null,
    browserMode: options.browserMode ?? "legacy",
    browserConcurrency: options.browserConcurrency ?? 1,
    browserResourceCache: options.browserResourceCache ?? "off",
    browserStability: options.browserStability ?? "fixed",
    browserShutdown: options.browserShutdown ?? "graceful",
  };
  return {
    sourceHash: resolvedSourceHash,
    libraryHash: resolvedLibraryHash,
    configurationHash: sha256(canonical({ command: "component-accept", ...qualityContract })),
    qualityContractHash: sha256(canonical(qualityContract)),
  };
}

async function fallbackAcceptanceIdentity(
  sourcePath: string,
  libraryRoot: string,
  options: ComponentLibraryAcceptanceOptions,
): Promise<Omit<ComponentLibraryAcceptanceReceipt["identity"], "qualityResultHash">> {
  const unresolvedContract = {
    command: "component-accept",
    unresolved: true,
    resourceProfile: options.resourceProfile ?? "dom",
    manifestPath: options.manifestPath ? resolve(options.manifestPath) : null,
    scenarioPath: options.scenarioPath ? resolve(options.scenarioPath) : null,
    spaRouterConfigPath: options.spaRouterConfigPath ? resolve(options.spaRouterConfigPath) : null,
    viewports: options.viewports?.map((viewport) => ({ ...viewport })) ?? null,
    browserMode: options.browserMode ?? "legacy",
    browserConcurrency: options.browserConcurrency ?? 1,
    browserResourceCache: options.browserResourceCache ?? "off",
    browserStability: options.browserStability ?? "fixed",
    browserShutdown: options.browserShutdown ?? "graceful",
  };
  return {
    sourceHash: await sourceHash(sourcePath),
    libraryHash: await libraryHash(libraryRoot),
    configurationHash: sha256(canonical(unresolvedContract)),
    qualityContractHash: sha256(canonical({ ...unresolvedContract, command: undefined })),
  };
}

function qualityResultHash(quality: QualityGateReport | undefined): string | null {
  if (!quality) return null;
  return sha256(canonical({
    passed: quality.passed,
    scores: quality.scores,
    gates: quality.gates.map((gate) => ({ id: gate.id, passed: gate.passed, detail: gate.detail })),
    validation: quality.validation.results.map((result) => ({ id: result.id, passed: result.passed, detail: result.detail })),
  }));
}

function sourceIssues(report: ComponentLibrarySourceReadinessReport): string[] {
  return report.issues
    .filter((issue) => issue.severity !== "warning")
    .map((issue) => `source-readiness:${issue.id}: ${issue.detail}${issue.reference ? ` (${issue.reference})` : ""}`);
}

function validationIssues(report: ValidationReport): string[] {
  return report.results.filter((result) => !result.passed).map((result) => `${result.id}: ${result.detail}`);
}

function qualityIssues(report: QualityGateReport): string[] {
  return report.gates.filter((gate) => !gate.passed).map((gate) => `${gate.id}: ${gate.detail}`);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function persistAcceptanceReport(
  report: ComponentLibraryAcceptanceReport,
  options: ComponentLibraryAcceptanceOptions,
): Promise<void> {
  const internalReportPath = resolve(report.libraryRoot, ".ui-dismantler", "quality-report.json");
  if (report.receipt.identity.libraryHash !== null) {
    await writeJson(internalReportPath, report);
    await writeJson(resolve(report.libraryRoot, ".ui-dismantler", "acceptance-receipt.json"), report.receipt);
  }
  if (options.reportPath && resolve(options.reportPath) !== internalReportPath) {
    await writeJson(resolve(options.reportPath), report);
  }
}

export async function acceptComponentLibrary(
  originalHtmlPath: string,
  libraryRoot: string,
  options: ComponentLibraryAcceptanceOptions = {},
): Promise<ComponentLibraryAcceptanceReport> {
  const startedAt = performance.now();
  const elapsed = (phaseStartedAt: number): number => Number((performance.now() - phaseStartedAt).toFixed(3));
  const sourcePath = resolve(originalHtmlPath);
  const absoluteLibraryRoot = resolve(libraryRoot);
  const timing = { identityMs: 0, sourceReadinessMs: 0, validationMs: 0, qualityMs: 0, totalMs: 0 };
  let phases: ComponentLibraryAcceptanceReceipt["phases"] = {
    sourceReadiness: "not-run",
    validation: "not-run",
    quality: "not-run",
  };
  const blockers: string[] = [];
  let phaseStartedAt = performance.now();
  let baseIdentity: Omit<ComponentLibraryAcceptanceReceipt["identity"], "qualityResultHash">;
  try {
    baseIdentity = await acceptanceIdentity(sourcePath, absoluteLibraryRoot, options);
  } catch (error) {
    baseIdentity = await fallbackAcceptanceIdentity(sourcePath, absoluteLibraryRoot, options);
    timing.identityMs = elapsed(phaseStartedAt);
    timing.totalMs = elapsed(startedAt);
    const reasons = [`identity: ${error instanceof Error ? error.message : String(error)}`];
    const receipt: ComponentLibraryAcceptanceReceipt = {
      schemaVersion: "1.0",
      kind: "component-library-acceptance-receipt",
      status: "execution-failed",
      accepted: false,
      identity: { ...baseIdentity, qualityResultHash: null },
      phases: { sourceReadiness: "not-run", validation: "not-run", quality: "not-run" },
      reasons,
    };
    const report: ComponentLibraryAcceptanceReport = {
      schemaVersion: "1.0",
      kind: "component-library-acceptance-report",
      status: "execution-failed",
      sourcePath,
      libraryRoot: absoluteLibraryRoot,
      receipt,
      blockers: reasons,
      timing,
    };
    await persistAcceptanceReport(report, options);
    return report;
  }
  timing.identityMs = elapsed(phaseStartedAt);
  let sourceReadiness: ComponentLibrarySourceReadinessReport | undefined;
  let validation: ValidationReport | undefined;
  let quality: QualityGateReport | undefined;
  let status: ComponentLibraryBuildStatus = "execution-failed";
  let activePhase: keyof ComponentLibraryAcceptanceReceipt["phases"] = "sourceReadiness";

  try {
    activePhase = "sourceReadiness";
    phaseStartedAt = performance.now();
    sourceReadiness = await assessComponentLibrarySourceReadiness({
      originalHtmlPath: sourcePath,
      resourceProfile: options.resourceProfile,
      manifestPath: options.manifestPath,
      scenarioPath: options.scenarioPath,
      spaRouterConfigPath: options.spaRouterConfigPath,
      visual: true,
      visualArtifactsDir: options.visualArtifactsDir,
      viewports: options.viewports,
      browserMode: options.browserMode,
      browserConcurrency: options.browserConcurrency,
      browserResourceCache: options.browserResourceCache,
      browserStability: options.browserStability,
      browserShutdown: options.browserShutdown,
    });
    timing.sourceReadinessMs = elapsed(phaseStartedAt);
    phases = { ...phases, sourceReadiness: sourceReadiness.status === "blocked" ? "blocked" : sourceReadiness.status === "review-required" ? "review-required" : "passed" };
    blockers.push(...sourceIssues(sourceReadiness));

    if (sourceReadiness.status === "blocked") {
      status = "blocked";
    } else {
      activePhase = "validation";
      phaseStartedAt = performance.now();
      validation = validateLibrary(absoluteLibraryRoot);
      timing.validationMs = elapsed(phaseStartedAt);
      phases = { ...phases, validation: validation.ok ? "passed" : "failed" };
      if (!validation.ok) {
        blockers.push(...validationIssues(validation));
        status = "quality-failed";
      } else {
        activePhase = "quality";
        phaseStartedAt = performance.now();
        quality = await runQualityGate({
          htmlPath: sourcePath,
          libDir: absoluteLibraryRoot,
          manifestPath: options.manifestPath,
          scenarioPath: options.scenarioPath,
          spaRouterConfigPath: options.spaRouterConfigPath,
          visual: true,
          visualArtifactsDir: options.visualArtifactsDir,
          ...(options.viewports ? { viewports: options.viewports.map((viewport) => ({ ...viewport })) } : {}),
          ...(options.browserMode ? { browserMode: options.browserMode } : {}),
          ...(options.browserConcurrency !== undefined ? { browserConcurrency: options.browserConcurrency } : {}),
          ...(options.browserResourceCache ? { browserResourceCache: options.browserResourceCache } : {}),
          ...(options.browserStability ? { browserStability: options.browserStability } : {}),
          ...(options.browserShutdown ? { browserShutdown: options.browserShutdown } : {}),
        });
        timing.qualityMs = elapsed(phaseStartedAt);
        phases = { ...phases, quality: quality.passed ? "passed" : "failed" };
        if (!quality.passed) {
          blockers.push(...qualityIssues(quality));
          status = "quality-failed";
        } else if (sourceReadiness.status === "review-required") {
          status = "review-required";
        } else {
          status = "accepted";
        }
      }
    }
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
    phases = { ...phases, [activePhase]: "failed" };
    status = "execution-failed";
  }

  timing.totalMs = elapsed(startedAt);
  const receipt: ComponentLibraryAcceptanceReceipt = {
    schemaVersion: "1.0",
    kind: "component-library-acceptance-receipt",
    status,
    accepted: status === "accepted",
    identity: { ...baseIdentity, qualityResultHash: qualityResultHash(quality) },
    phases,
    reasons: blockers,
  };
  const report: ComponentLibraryAcceptanceReport = {
    schemaVersion: "1.0",
    kind: "component-library-acceptance-report",
    status,
    sourcePath,
    libraryRoot: absoluteLibraryRoot,
    ...(sourceReadiness ? { sourceReadiness } : {}),
    ...(validation ? { validation } : {}),
    ...(quality ? { quality } : {}),
    receipt,
    blockers,
    timing,
  };
  await persistAcceptanceReport(report, options);
  return report;
}
