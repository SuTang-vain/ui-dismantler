import type { DataSurface, DataSurfaceManifest } from "./contract.js";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const FORBIDDEN_DATA_PACK_KEYS = ["entities", "aliases", "relations", "stages", "contents", "adapters"] as const;

export interface DataSurfaceManifestValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface DataSurfaceManifestValidationReport {
  readonly valid: boolean;
  readonly issues: readonly DataSurfaceManifestValidationIssue[];
}

function issue(issues: DataSurfaceManifestValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function validateSurface(value: unknown, index: number, issues: DataSurfaceManifestValidationIssue[]): void {
  const path = `surfaces[${index}]`;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    issue(issues, path, "surface must be an object");
    return;
  }
  const surface = value as DataSurface;
  if (!surface.id?.trim()) issue(issues, `${path}.id`, "surface id must not be empty");
  if (!surface.source || typeof surface.source !== "object") {
    issue(issues, `${path}.source`, "source is required");
    return;
  }
  if (surface.source.primary === "reviewed-api-fixture" && !surface.source.api) issue(issues, `${path}.source.api`, "reviewed API surface must declare API source");
  if (surface.source.primary === "module-static-binding" && !surface.source.static) issue(issues, `${path}.source.static`, "static surface must declare static source");
  if (surface.source.primary !== "reviewed-api-fixture" && surface.source.primary !== "module-static-binding") issue(issues, `${path}.source.primary`, "source primary is invalid");
  if (surface.source.api && surface.source.api.reviewed !== true) issue(issues, `${path}.source.api.reviewed`, "API source must be reviewed");
  if (surface.source.static && "value" in (surface.source.static as unknown as Record<string, unknown>)) issue(issues, `${path}.source.static.value`, "raw static values are forbidden in a Data Surface Manifest");
  if (!surface.shape || typeof surface.shape !== "object") issue(issues, `${path}.shape`, "shape is required");
  else if (surface.shape.cardinality !== null && (!Number.isInteger(surface.shape.cardinality) || surface.shape.cardinality < 0)) issue(issues, `${path}.shape.cardinality`, "cardinality must be null or a non-negative integer");
  if (!Array.isArray(surface.fields)) issue(issues, `${path}.fields`, "fields must be an array");
  else {
    const fieldPaths = surface.fields.map((field) => field.path);
    if (new Set(fieldPaths).size !== fieldPaths.length) issue(issues, `${path}.fields`, "field paths must be unique");
  }
  if (!Array.isArray(surface.references)) issue(issues, `${path}.references`, "references must be an array");
  else if (surface.references.some((reference) => !reference.target?.trim())) issue(issues, `${path}.references`, "reference target must not be empty");
  if (surface.injection?.reviewed && (surface.unresolved?.length ?? 0) > 0) issue(issues, `${path}.injection.reviewed`, "injection cannot be reviewed while the surface has unresolved evidence");
}

export function validateDataSurfaceManifest(value: unknown): DataSurfaceManifestValidationReport {
  const issues: DataSurfaceManifestValidationIssue[] = [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { valid: false, issues: [{ path: "$", message: "manifest must be an object" }] };
  const manifest = value as Partial<DataSurfaceManifest> & Record<string, unknown>;
  for (const key of FORBIDDEN_DATA_PACK_KEYS) if (key in manifest) issue(issues, key, `Data Pack field ${key} is not allowed in a Data Surface Manifest`);
  if (manifest.schemaVersion !== "1.0") issue(issues, "schemaVersion", "schemaVersion must be 1.0");
  if (manifest.kind !== "data-surface-manifest") issue(issues, "kind", "kind must be data-surface-manifest");
  if (!manifest.identity || typeof manifest.identity !== "object") issue(issues, "identity", "identity is required");
  else {
    const identity = manifest.identity as DataSurfaceManifest["identity"];
    if (identity.contractVersion !== "1.0") issue(issues, "identity.contractVersion", "identity contractVersion must be 1.0");
    if (!identity.sourceRoot?.trim()) issue(issues, "identity.sourceRoot", "identity sourceRoot must not be empty");
    if (!HASH_PATTERN.test(identity.sourceHash ?? "")) issue(issues, "identity.sourceHash", "sourceHash must be a SHA-256 hex digest");
    if (!HASH_PATTERN.test(identity.fixtureHash ?? "")) issue(issues, "identity.fixtureHash", "fixtureHash must be a SHA-256 hex digest");
    if (!HASH_PATTERN.test(identity.configurationHash ?? "")) issue(issues, "identity.configurationHash", "configurationHash must be a SHA-256 hex digest");
    if (identity.sourceHashKind !== "responsibility-graph" && identity.sourceHashKind !== "source-content") issue(issues, "identity.sourceHashKind", "sourceHashKind is invalid");
    if (identity.fixtureHashKind !== "responsibility-graph" && identity.fixtureHashKind !== "fixture-content") issue(issues, "identity.fixtureHashKind", "fixtureHashKind is invalid");
    if (identity.configurationHashKind !== "responsibility-graph" && identity.configurationHashKind !== "configuration-content") issue(issues, "identity.configurationHashKind", "configurationHashKind is invalid");
    if (identity.sourceRoot === "<external-source>") issue(issues, "identity.sourceRoot", "placeholder sourceRoot is not valid for a deliverable Manifest");
    if (!identity.skillVersions || Object.keys(identity.skillVersions).length === 0) issue(issues, "identity.skillVersions", "skillVersions must not be empty");
    if (identity.generatedAt !== undefined && !Number.isFinite(Date.parse(identity.generatedAt))) issue(issues, "identity.generatedAt", "generatedAt must be an ISO date string");
  }
  if (!manifest.library || typeof manifest.library !== "object") issue(issues, "library", "library is required");
  else if (manifest.identity && manifest.library.sourceRoot !== (manifest.identity as DataSurfaceManifest["identity"]).sourceRoot) issue(issues, "library.sourceRoot", "library.sourceRoot must match identity.sourceRoot");
  if (!Array.isArray(manifest.surfaces)) issue(issues, "surfaces", "surfaces must be an array");
  else {
    const ids = manifest.surfaces.map((surface) => surface.id);
    if (new Set(ids).size !== ids.length) issue(issues, "surfaces", "surface ids must be unique");
    manifest.surfaces.forEach((surface, index) => validateSurface(surface, index, issues));
  }
  if (!Array.isArray(manifest.unresolved)) issue(issues, "unresolved", "unresolved must be an array");
  if (!manifest.metrics || typeof manifest.metrics !== "object") issue(issues, "metrics", "metrics is required");
  else if (Array.isArray(manifest.surfaces) && Array.isArray(manifest.unresolved)) {
    const surfaces = manifest.surfaces;
    const validSurfaces = surfaces.filter((surface): surface is DataSurface => surface !== null && typeof surface === "object" && !Array.isArray(surface));
    const metrics = manifest.metrics;
    const expected = {
      surfaces: surfaces.length,
      apiSurfaces: validSurfaces.filter((surface) => surface.source?.primary === "reviewed-api-fixture").length,
      staticSurfaces: validSurfaces.filter((surface) => surface.source?.primary === "module-static-binding").length,
      reviewedFixtures: validSurfaces.filter((surface) => surface.source?.api?.reviewed === true).length,
      fields: validSurfaces.reduce((total, surface) => total + (Array.isArray(surface.fields) ? surface.fields.length : 0), 0),
      references: validSurfaces.reduce((total, surface) => total + (Array.isArray(surface.references) ? surface.references.length : 0), 0),
      unresolved: manifest.unresolved.length + validSurfaces.reduce((total, surface) => total + (Array.isArray(surface.unresolved) ? surface.unresolved.length : 0), 0),
    };
    for (const [key, value] of Object.entries(expected)) if ((metrics as Record<string, unknown>)[key] !== value) issue(issues, `metrics.${key}`, `metric must equal ${value}`);
    const expectedReview = manifest.unresolved.length > 0 || validSurfaces.some((surface) => surface.reviewRequired === true);
    if (manifest.reviewRequired !== expectedReview) issue(issues, "reviewRequired", `reviewRequired must equal ${expectedReview}`);
  }
  return { valid: issues.length === 0, issues };
}

export function assertDataSurfaceManifest(value: unknown): asserts value is DataSurfaceManifest {
  const report = validateDataSurfaceManifest(value);
  if (!report.valid) throw new Error(`invalid Data Surface Manifest: ${report.issues.map((item) => `${item.path} ${item.message}`).join("; ")}`);
}
