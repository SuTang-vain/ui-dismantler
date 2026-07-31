import { createHash } from "node:crypto";

export const COMPONENT_LIBRARY_BUILD_PLAN_SCHEMA_VERSION = "1.0" as const;

export type ComponentLibraryFileRole =
  | "runtime"
  | "style"
  | "package-metadata"
  | "documentation"
  | "example"
  | "fixture"
  | "evidence";

export interface ComponentLibraryFileProvenance {
  readonly kind: "component-plan" | "primitive-dom" | "visual-target" | "source-style" | "reviewed-file" | "generated-metadata";
  readonly reference: string;
}

export interface ComponentLibraryBuildFile {
  readonly path: string;
  readonly role: ComponentLibraryFileRole;
  readonly content: string;
  readonly contentHash: string;
  readonly publish: boolean;
  readonly reviewed: boolean;
  readonly provenance: readonly ComponentLibraryFileProvenance[];
}

export interface ComponentLibraryRuntimeSmokeContract {
  readonly runtimePath: string;
  readonly globalName: string;
  readonly mountMethod: string;
  readonly hostSelector: string;
  readonly options: unknown;
  readonly cleanupRequired: boolean;
}

export interface ComponentLibraryQualityContract {
  readonly originalHtmlPath: string;
  readonly manifestPath?: string;
  readonly scenarioPath?: string;
  readonly spaRouterConfigPath?: string;
  readonly visual: boolean;
  readonly visualArtifactsDir?: string;
}

export interface ComponentLibraryBuildPlan {
  readonly schemaVersion: typeof COMPONENT_LIBRARY_BUILD_PLAN_SCHEMA_VERSION;
  readonly kind: "component-library-build-plan";
  readonly identity: {
    readonly sourceRoot: string;
    readonly sourceHash: string;
    readonly configurationHash: string;
  };
  readonly library: {
    readonly name: string;
    readonly packageName: string;
  };
  readonly files: readonly ComponentLibraryBuildFile[];
  readonly smoke: ComponentLibraryRuntimeSmokeContract;
  readonly quality?: ComponentLibraryQualityContract;
  readonly unresolved: readonly string[];
  readonly reviewRequired: boolean;
}

export interface ComponentLibraryBuildFileInput {
  readonly path: string;
  readonly role: ComponentLibraryFileRole;
  readonly sourcePath?: string;
  readonly content?: string;
  readonly publish: boolean;
  readonly reviewed: boolean;
  readonly provenance: readonly ComponentLibraryFileProvenance[];
}

export interface ComponentLibraryBuildPlanInput {
  readonly schemaVersion: typeof COMPONENT_LIBRARY_BUILD_PLAN_SCHEMA_VERSION;
  readonly sourceRoot: string;
  readonly sourceHash?: string;
  readonly library: ComponentLibraryBuildPlan["library"];
  readonly files: readonly ComponentLibraryBuildFileInput[];
  readonly smoke: ComponentLibraryRuntimeSmokeContract;
  readonly quality?: ComponentLibraryQualityContract;
  readonly unresolved?: readonly string[];
}

export interface ComponentLibraryBuildPlanValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ComponentLibraryBuildPlanValidationReport {
  readonly valid: boolean;
  readonly ready: boolean;
  readonly issues: readonly ComponentLibraryBuildPlanValidationIssue[];
  readonly blockers: readonly ComponentLibraryBuildPlanValidationIssue[];
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeRelativePath(path: string): boolean {
  return Boolean(path)
    && !path.startsWith("/")
    && !path.startsWith("\\")
    && !/^[A-Za-z]:[\\/]/.test(path)
    && !path.split(/[\\/]+/).includes("..")
    && !path.includes("\0");
}

export function validateComponentLibraryBuildPlan(plan: ComponentLibraryBuildPlan): ComponentLibraryBuildPlanValidationReport {
  const issues: ComponentLibraryBuildPlanValidationIssue[] = [];
  const blockers: ComponentLibraryBuildPlanValidationIssue[] = [];
  const add = (path: string, message: string): void => { issues.push({ path, message }); };
  const block = (path: string, message: string): void => { blockers.push({ path, message }); };
  if (plan.schemaVersion !== COMPONENT_LIBRARY_BUILD_PLAN_SCHEMA_VERSION) add("schemaVersion", `must be ${COMPONENT_LIBRARY_BUILD_PLAN_SCHEMA_VERSION}`);
  if (plan.kind !== "component-library-build-plan") add("kind", "must be component-library-build-plan");
  if (!plan.identity.sourceRoot.trim()) add("identity.sourceRoot", "must not be empty");
  if (!/^[a-f0-9]{64}$/.test(plan.identity.sourceHash)) add("identity.sourceHash", "must be a SHA-256 hex digest");
  if (!/^[a-f0-9]{64}$/.test(plan.identity.configurationHash)) add("identity.configurationHash", "must be a SHA-256 hex digest");
  if (!plan.library.name.trim()) add("library.name", "must not be empty");
  if (!plan.library.packageName.trim()) add("library.packageName", "must not be empty");
  const seen = new Set<string>();
  for (const [index, file] of plan.files.entries()) {
    const path = `files[${index}]`;
    if (!safeRelativePath(file.path)) add(`${path}.path`, "must be a safe relative path");
    if (seen.has(file.path)) add(`${path}.path`, `duplicates ${file.path}`);
    seen.add(file.path);
    if (file.contentHash !== sha256(file.content)) add(`${path}.contentHash`, "does not match content");
    if (file.provenance.length === 0) add(`${path}.provenance`, "must contain at least one evidence reference");
    if (file.role === "fixture" && file.publish) add(`${path}.publish`, "fixture files cannot be publishable");
    if (["runtime", "style", "package-metadata", "documentation"].includes(file.role) && !file.reviewed) block(`${path}.reviewed`, "publishable library files must be reviewed");
  }
  for (const requiredRole of ["runtime", "style", "package-metadata", "documentation"] as const) {
    if (!plan.files.some((file) => file.role === requiredRole)) block("files", `missing required ${requiredRole} file`);
  }
  if (!safeRelativePath(plan.smoke.runtimePath)) add("smoke.runtimePath", "must be a safe relative path");
  if (!plan.files.some((file) => file.path === plan.smoke.runtimePath && file.role === "runtime")) block("smoke.runtimePath", "must reference a planned runtime file");
  if (!plan.smoke.globalName.trim()) add("smoke.globalName", "must not be empty");
  if (!plan.smoke.mountMethod.trim()) add("smoke.mountMethod", "must not be empty");
  if (!plan.smoke.hostSelector.trim()) add("smoke.hostSelector", "must not be empty");
  for (const unresolved of plan.unresolved) block("unresolved", unresolved);
  if (plan.reviewRequired && plan.unresolved.length === 0 && !plan.files.some((file) => !file.reviewed)) block("reviewRequired", "plan declares reviewRequired without an unresolved or unreviewed source");
  const computedReviewRequired = plan.unresolved.length > 0 || plan.files.some((file) => !file.reviewed) || blockers.length > 0;
  if (plan.reviewRequired !== computedReviewRequired) add("reviewRequired", `must equal derived review state ${computedReviewRequired}`);
  return { valid: issues.length === 0, ready: issues.length === 0 && blockers.length === 0 && !plan.reviewRequired, issues, blockers };
}

export function assertComponentLibraryBuildPlan(plan: ComponentLibraryBuildPlan): void {
  const report = validateComponentLibraryBuildPlan(plan);
  if (!report.valid) throw new Error(`Invalid Component Library Build Plan: ${report.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
}
