import type { JsonValue } from "../../types.js";
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
  readonly kind: "component-plan" | "primitive-dom" | "visual-target" | "source-style" | "reviewed-file" | "generated-metadata" | "state-responsibility" | "data-surface-manifest";
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

export interface ComponentLibraryInteractionBinding {
  readonly id: string;
  readonly ownerId?: string;
  readonly sourceNodeId?: string;
  readonly event: string;
  readonly expression: string;
  readonly target: string;
  readonly reviewed: boolean;
  readonly materialized: boolean;
  readonly executionEvidence?: { readonly status: "verified" | "blocked"; readonly transitionKind?: string; readonly mutationTarget?: string; readonly transitionValue?: JsonValue; readonly blockers: readonly string[] };
  readonly provenance: readonly ComponentLibraryFileProvenance[];
}

export interface ComponentLibraryDataBinding {
  readonly id: string;
  readonly ownerId: string;
  readonly sourceKind: "reviewed-api-fixture" | "module-static-binding" | "component-prop" | "runtime-binding" | "state-initial";
  readonly targetBinding: string;
  readonly fields: readonly string[];
  readonly shape: { readonly kind: string; readonly itemKind: string; readonly cardinality: number | null };
  readonly reviewed: boolean;
  readonly materialized: boolean;
  readonly runtimeInput?: "data" | "adapter";
  readonly adapterKey?: string;
  readonly externalOnly: true;
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
  readonly interactions: readonly ComponentLibraryInteractionBinding[];
  readonly dataBindings: readonly ComponentLibraryDataBinding[];
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
  readonly interactions?: readonly ComponentLibraryInteractionBinding[];
  readonly dataBindings?: readonly ComponentLibraryDataBinding[];
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
  for (const [index, binding] of plan.interactions.entries()) {
    if (!binding.id.trim() || !binding.event.trim() || !binding.expression.trim() || !binding.target.trim()) add(`interactions[${index}]`, "id, event, expression, and target are required");
    if (binding.ownerId !== undefined && !binding.ownerId.trim()) add(`interactions[${index}].ownerId`, "must not be empty when present");
    if (!binding.materialized) block(`interactions[${index}]`, "interaction binding is metadata-only and requires a reviewed executor");
    if (!binding.reviewed) block(`interactions[${index}]`, "interaction binding is not reviewed");
    if (binding.provenance.length === 0) add(`interactions[${index}].provenance`, "must contain evidence");
  }
  for (const [index, binding] of plan.dataBindings.entries()) {
    if (!binding.id.trim() || !binding.ownerId.trim() || !binding.targetBinding.trim()) add(`dataBindings[${index}]`, "id, ownerId, and targetBinding are required");
    if (!binding.externalOnly) add(`dataBindings[${index}].externalOnly`, "must remain true");
    if (binding.runtimeInput === "adapter" && !binding.adapterKey?.trim()) add(`dataBindings[${index}].adapterKey`, "adapter runtime input requires a non-empty key");
    if (binding.sourceKind === "reviewed-api-fixture" && binding.materialized && binding.runtimeInput !== "adapter") add(`dataBindings[${index}].runtimeInput`, "reviewed API bindings must materialize through an external adapter");
    if (binding.sourceKind === "component-prop" && binding.materialized && binding.runtimeInput !== "data") add(`dataBindings[${index}].runtimeInput`, "component props must materialize through caller data");
    if (!binding.materialized) block(`dataBindings[${index}]`, "data binding is not materialized by the current runtime");
    if (!binding.reviewed) block(`dataBindings[${index}]`, "data binding is not reviewed");
    if (binding.provenance.length === 0) add(`dataBindings[${index}].provenance`, "must contain evidence");
  }
  for (const unresolved of plan.unresolved) block("unresolved", unresolved);
  if (plan.reviewRequired && plan.unresolved.length === 0 && !plan.files.some((file) => !file.reviewed)) block("reviewRequired", "plan declares reviewRequired without an unresolved or unreviewed source");
  const computedReviewRequired = plan.unresolved.length > 0 || plan.files.some((file) => !file.reviewed) || plan.interactions.some((binding) => !binding.reviewed || !binding.materialized) || plan.dataBindings.some((binding) => !binding.reviewed || !binding.materialized) || blockers.length > 0;
  if (plan.reviewRequired !== computedReviewRequired) add("reviewRequired", `must equal derived review state ${computedReviewRequired}`);
  return { valid: issues.length === 0, ready: issues.length === 0 && blockers.length === 0 && !plan.reviewRequired, issues, blockers };
}

export function assertComponentLibraryBuildPlan(plan: ComponentLibraryBuildPlan): void {
  const report = validateComponentLibraryBuildPlan(plan);
  if (!report.valid) throw new Error(`Invalid Component Library Build Plan: ${report.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
}
