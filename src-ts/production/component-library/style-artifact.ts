import { sha256, type ComponentLibraryFileProvenance } from "./contract.js";
import type { PrimitiveDomCompilationGraph } from "../../skills/primitive-dom.js";
import type { SfcVisualResponsibilityGraph } from "../../planning/sfc-visual-responsibility.js";
import { materializeCompiledCssForSelector } from "../../planning/scoped-style-materializer.js";

export interface ReviewedComponentStyleEntry {
  readonly id: string;
  readonly scope: "owner" | "global";
  readonly ownerId?: string;
  readonly sourceFile: string;
  readonly compiledCss: string;
  readonly reviewed: boolean;
  readonly evidence: readonly string[];
}

export interface ReviewedComponentStyleArtifact {
  readonly schemaVersion: "1.0";
  readonly kind: "reviewed-component-style-artifact";
  readonly primitiveGraphHash: string;
  readonly entries: readonly ReviewedComponentStyleEntry[];
  readonly unresolved?: readonly string[];
  readonly reviewRequired: boolean;
}

export interface ReviewedComponentStyleMaterialization {
  readonly css: string;
  readonly provenance: readonly ComponentLibraryFileProvenance[];
  readonly reviewReasons: readonly string[];
  readonly metrics: {
    readonly entries: number;
    readonly materialized: number;
    readonly failed: number;
    readonly rules: number;
    readonly selectors: number;
    readonly keyframes: number;
  };
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function primitiveGraphHash(graph: PrimitiveDomCompilationGraph): string {
  return sha256(JSON.stringify(graph));
}

export function createComponentStyleArtifactCandidate(
  graph: SfcVisualResponsibilityGraph,
  primitiveGraph: PrimitiveDomCompilationGraph,
): ReviewedComponentStyleArtifact {
  const entries: ReviewedComponentStyleEntry[] = [];
  const unresolved: string[] = [];
  const sourceById = new Map(graph.components.map((component) => [component.id, component]));
  for (const owner of primitiveGraph.components) {
    const component = sourceById.get(owner.componentId);
    if (!component) { unresolved.push(`Primitive owner ${owner.componentId} has no SFC visual responsibility`); continue; }
    if (component.file !== owner.componentFile || component.componentName !== owner.componentName) {
      unresolved.push(`Primitive owner identity differs from SFC responsibility: ${owner.componentId}`);
      continue;
    }
    for (const sheet of component.styles) {
      const id = `style:${owner.componentId}:${sheet.index}`;
      if (!sheet.compiledCss || sheet.compileStatus === "failed") {
        unresolved.push(`${id} is unavailable: ${sheet.failureReason ?? sheet.compileStatus}`);
        continue;
      }
      entries.push({
        id,
        scope: "owner",
        ownerId: owner.componentId,
        sourceFile: `${component.file}?style=${sheet.index}`,
        compiledCss: sheet.compiledCss,
        reviewed: false,
        evidence: [`SFC style responsibility index=${sheet.index} language=${sheet.language} scoped=${sheet.scoped} compileStatus=${sheet.compileStatus}`],
      });
    }
  }
  for (const sheet of graph.globalStyles ?? []) {
    const id = `style:global:${sheet.sourceFile}:${sheet.index}`;
    if (!sheet.compiledCss || sheet.compileStatus === "failed") {
      unresolved.push(`${id} is unavailable: ${sheet.failureReason ?? sheet.compileStatus}`);
      continue;
    }
    entries.push({
      id,
      scope: "global",
      sourceFile: `${sheet.sourceFile}?style=${sheet.index}`,
      compiledCss: sheet.compiledCss,
      reviewed: false,
      evidence: [`global SFC style responsibility importedBy=${sheet.importedBy} language=${sheet.language} compileStatus=${sheet.compileStatus}`],
    });
  }
  return {
    schemaVersion: "1.0",
    kind: "reviewed-component-style-artifact",
    primitiveGraphHash: primitiveGraphHash(primitiveGraph),
    entries,
    unresolved,
    reviewRequired: true,
  };
}

export function materializeReviewedComponentStyles(
  graph: PrimitiveDomCompilationGraph,
  artifact: ReviewedComponentStyleArtifact,
): ReviewedComponentStyleMaterialization {
  const reviewReasons: string[] = [...(artifact.unresolved ?? []).map((reason) => `style artifact unresolved: ${reason}`)];
  const ownerIds = new Set(graph.components.map((component) => component.componentId));
  const seen = new Set<string>();
  if (artifact.schemaVersion !== "1.0" || artifact.kind !== "reviewed-component-style-artifact") reviewReasons.push("style artifact contract is invalid");
  if (artifact.primitiveGraphHash !== primitiveGraphHash(graph)) reviewReasons.push("style artifact primitiveGraphHash does not match the reviewed Primitive DOM graph");
  const materialized: Array<{ entry: ReviewedComponentStyleEntry; css: string; rules: number; selectors: number; keyframes: number }> = [];
  for (const entry of artifact.entries ?? []) {
    if (!entry?.id?.trim()) { reviewReasons.push("style artifact entry id must not be empty"); continue; }
    if (seen.has(entry.id)) { reviewReasons.push(`style artifact entry id is duplicated: ${entry.id}`); continue; }
    seen.add(entry.id);
    if (!entry.reviewed) reviewReasons.push(`style artifact entry requires review: ${entry.id}`);
    if (!entry.sourceFile?.trim()) reviewReasons.push(`style artifact entry sourceFile is missing: ${entry.id}`);
    if (!Array.isArray(entry.evidence) || entry.evidence.length === 0 || entry.evidence.some((item) => !item.trim())) reviewReasons.push(`style artifact entry evidence is missing: ${entry.id}`);
    if (!entry.compiledCss?.trim()) { reviewReasons.push(`style artifact entry CSS is empty: ${entry.id}`); continue; }
    if (/<\/?style\b/i.test(entry.compiledCss)) { reviewReasons.push(`style artifact entry must contain CSS only: ${entry.id}`); continue; }
    if (entry.scope === "owner" && (!entry.ownerId || !ownerIds.has(entry.ownerId))) { reviewReasons.push(`style artifact owner is not present in Primitive DOM graph: ${entry.id}`); continue; }
    if (entry.scope === "global" && entry.ownerId !== undefined) { reviewReasons.push(`global style artifact entry must not declare ownerId: ${entry.id}`); continue; }
    const ownerSelector = entry.scope === "owner" ? `[data-component-id="${escapeAttributeValue(entry.ownerId!)}"]` : ":root";
    const result = materializeCompiledCssForSelector(entry.compiledCss, ownerSelector, entry.scope === "owner");
    if (!result.materialized) { reviewReasons.push(`style artifact CSS failed to materialize: ${entry.id}: ${result.error ?? "unknown error"}`); continue; }
    materialized.push({ entry, css: result.css, rules: result.ruleCount, selectors: result.selectorCount, keyframes: result.keyframeRuleCount });
  }
  const derivedReviewRequired = reviewReasons.length > 0 || materialized.length !== (artifact.entries?.length ?? 0);
  if (artifact.reviewRequired !== derivedReviewRequired) reviewReasons.push(`style artifact reviewRequired must equal derived state ${derivedReviewRequired}`);
  return {
    css: materialized.map((item) => `/* ${item.entry.id} <- ${item.entry.sourceFile} */\n${item.css}`).join("\n"),
    provenance: materialized.map((item) => ({ kind: "source-style" as const, reference: `style-artifact:${item.entry.id}:${item.entry.sourceFile}` })),
    reviewReasons,
    metrics: {
      entries: artifact.entries?.length ?? 0,
      materialized: materialized.length,
      failed: Math.max(0, (artifact.entries?.length ?? 0) - materialized.length),
      rules: materialized.reduce((sum, item) => sum + item.rules, 0),
      selectors: materialized.reduce((sum, item) => sum + item.selectors, 0),
      keyframes: materialized.reduce((sum, item) => sum + item.keyframes, 0),
    },
  };
}
