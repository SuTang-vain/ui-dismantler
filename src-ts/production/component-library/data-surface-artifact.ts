import type { DataSurface, DataSurfaceManifest } from "../../skills/data-surface-manifest/contract.js";
import { validateDataSurfaceManifest } from "../../skills/data-surface-manifest/validator.js";
import type { PrimitiveDomCompilationGraph } from "../../skills/primitive-dom.js";
import { primitiveGraphHash } from "./style-artifact.js";

export interface ReviewedComponentDataSurfaceArtifact {
  readonly schemaVersion: "1.0";
  readonly kind: "reviewed-component-data-surface-artifact";
  readonly primitiveGraphHash: string;
  readonly manifest: DataSurfaceManifest;
  readonly reviewed: boolean;
  readonly evidence: readonly string[];
  readonly unresolved?: readonly string[];
  readonly reviewRequired: boolean;
}

export interface ReviewedComponentDataSurfaceResolution {
  readonly manifest?: DataSurfaceManifest;
  readonly reviewReasons: readonly string[];
  readonly metrics: {
    readonly surfaces: number;
    readonly owners: number;
    readonly matchedOwners: number;
    readonly invalidOwners: number;
  };
}

function manifestSurfaces(manifest: unknown): readonly DataSurface[] {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) return [];
  const surfaces = (manifest as Partial<DataSurfaceManifest>).surfaces;
  return Array.isArray(surfaces) ? surfaces : [];
}

function ownershipReviewReasons(
  graph: PrimitiveDomCompilationGraph,
  manifest: unknown,
): { reasons: string[]; matchedOwners: number; invalidOwners: number } {
  const reasons: string[] = [];
  const owners = new Map(graph.components.map((component) => [component.componentId, component]));
  let matchedOwners = 0;
  let invalidOwners = 0;
  const surfaces = manifestSurfaces(manifest);
  for (const surface of surfaces) {
    const owner = owners.get(surface.owner?.componentId ?? "");
    if (!owner) {
      invalidOwners += 1;
      reasons.push(`data surface owner is not present in Primitive DOM graph: ${surface.id}`);
      continue;
    }
    if (owner.componentName !== surface.owner.componentName || owner.componentFile !== surface.owner.componentFile) {
      invalidOwners += 1;
      reasons.push(`data surface owner identity differs from Primitive DOM graph: ${surface.id}`);
      continue;
    }
    matchedOwners += 1;
    for (const consumer of surface.consumers ?? []) {
      const consumerOwner = owners.get(consumer.componentId);
      if (!consumerOwner) {
        invalidOwners += 1;
        reasons.push(`data surface consumer is not present in Primitive DOM graph: ${surface.id}:${consumer.componentId}`);
      } else if (consumerOwner.componentName !== consumer.componentName || consumerOwner.componentFile !== consumer.componentFile) {
        invalidOwners += 1;
        reasons.push(`data surface consumer identity differs from Primitive DOM graph: ${surface.id}:${consumer.componentId}`);
      }
    }
  }
  return { reasons, matchedOwners, invalidOwners };
}

export function createComponentDataSurfaceArtifactCandidate(
  manifest: DataSurfaceManifest,
  graph: PrimitiveDomCompilationGraph,
): ReviewedComponentDataSurfaceArtifact {
  const validation = validateDataSurfaceManifest(manifest);
  const ownership = ownershipReviewReasons(graph, manifest);
  const unresolved = [
    ...validation.issues.map((issue) => `manifest ${issue.path}: ${issue.message}`),
    ...(manifest?.reviewRequired ? ["Data Surface Manifest requires review"] : []),
    ...(manifest?.unresolved ?? []).map((item) => `manifest unresolved: ${item.reason}`),
    ...manifestSurfaces(manifest).flatMap((surface) => surface.reviewRequired ? [`surface requires review: ${surface.id}`] : []),
    ...ownership.reasons,
  ];
  return {
    schemaVersion: "1.0",
    kind: "reviewed-component-data-surface-artifact",
    primitiveGraphHash: primitiveGraphHash(graph),
    manifest,
    reviewed: false,
    evidence: [
      `Data Surface Manifest sourceHash=${manifest?.identity?.sourceHash ?? "missing"}`,
      `Primitive DOM owners=${graph.components.length} matchedSurfaces=${ownership.matchedOwners}`,
    ],
    unresolved: [...new Set(unresolved)],
    reviewRequired: true,
  };
}

export function resolveReviewedComponentDataSurfaceArtifact(
  graph: PrimitiveDomCompilationGraph,
  artifact: ReviewedComponentDataSurfaceArtifact,
): ReviewedComponentDataSurfaceResolution {
  const reviewReasons: string[] = [...(artifact.unresolved ?? []).map((reason) => `data surface artifact unresolved: ${reason}`)];
  if (artifact.schemaVersion !== "1.0" || artifact.kind !== "reviewed-component-data-surface-artifact") reviewReasons.push("data surface artifact contract is invalid");
  if (artifact.primitiveGraphHash !== primitiveGraphHash(graph)) reviewReasons.push("data surface artifact primitiveGraphHash does not match the reviewed Primitive DOM graph");
  if (!artifact.reviewed) reviewReasons.push("data surface artifact requires review");
  if (!Array.isArray(artifact.evidence) || artifact.evidence.length === 0 || artifact.evidence.some((item) => !item.trim())) reviewReasons.push("data surface artifact evidence is missing");

  const validation = validateDataSurfaceManifest(artifact.manifest);
  reviewReasons.push(...validation.issues.map((issue) => `data surface manifest ${issue.path}: ${issue.message}`));
  if (artifact.manifest?.reviewRequired) reviewReasons.push("data surface manifest requires review");
  reviewReasons.push(...(artifact.manifest?.unresolved ?? []).map((item) => `data surface manifest unresolved: ${item.reason}`));
  reviewReasons.push(...manifestSurfaces(artifact.manifest).flatMap((surface) => surface.reviewRequired ? [`data surface requires review: ${surface.id}`] : []));
  const ownership = ownershipReviewReasons(graph, artifact.manifest);
  reviewReasons.push(...ownership.reasons);

  const uniqueReasons = [...new Set(reviewReasons)];
  const derivedReviewRequired = uniqueReasons.length > 0;
  if (artifact.reviewRequired !== derivedReviewRequired) uniqueReasons.push(`data surface artifact reviewRequired must equal derived state ${derivedReviewRequired}`);
  return {
    ...(uniqueReasons.length === 0 ? { manifest: artifact.manifest } : {}),
    reviewReasons: uniqueReasons,
    metrics: {
      surfaces: manifestSurfaces(artifact.manifest).length,
      owners: graph.components.length,
      matchedOwners: ownership.matchedOwners,
      invalidOwners: ownership.invalidOwners,
    },
  };
}
