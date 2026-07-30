import type { ResponsibilityGraphDelta } from "../../core/responsibility/graph.js";
import type { DataSurfaceManifest } from "./contract.js";

export function projectDataSurfaceManifestDelta(manifest: DataSurfaceManifest): ResponsibilityGraphDelta {
  const nodes = manifest.surfaces.map((surface) => ({
    id: `data-surface:${surface.id}`,
    kind: "data-surface",
    owner: { file: surface.owner.componentFile, symbol: surface.owner.componentName },
    attributes: {
      source: surface.source.primary,
      shape: surface.shape.kind,
      itemKind: surface.shape.itemKind,
      cardinality: surface.shape.cardinality,
      fields: surface.fields.map((field) => field.path),
      injectionKind: surface.injection.kind,
      injectionTarget: surface.injection.target,
    },
    evidence: surface.evidence,
    confidence: surface.reviewRequired ? "medium" as const : "high" as const,
    reviewRequired: surface.reviewRequired,
  }));
  const ownerEdges = manifest.surfaces.map((surface) => ({
    from: `component:${surface.owner.componentId}`,
    to: `data-surface:${surface.id}`,
    relation: "owns-data-surface",
    evidence: surface.evidence,
    reviewRequired: surface.reviewRequired,
  }));
  const apiEdges = manifest.surfaces.flatMap((surface) => surface.source.api ? [{
    from: `api-responsibility:${surface.source.api.responsibilityId}`,
    to: `data-surface:${surface.id}`,
    relation: "materializes-data-surface",
    evidence: surface.evidence,
    reviewRequired: surface.reviewRequired,
  }] : []);
  const unresolved = [
    ...manifest.unresolved,
    ...manifest.surfaces.flatMap((surface) => surface.unresolved.map((reason) => ({ owner: `data-surface:${surface.id}`, source: surface.owner.componentFile, reason }))),
  ];
  return {
    schemaVersion: "1.0",
    skillId: "data-surface-manifest",
    sourceGraphKind: manifest.kind,
    nodes,
    edges: [...ownerEdges, ...apiEdges],
    unresolved,
    reviewRequired: manifest.reviewRequired,
  };
}
