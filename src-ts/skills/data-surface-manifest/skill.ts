import { defineSkill, type DismantlingSkill } from "../../core/skills/contract.js";
import { buildDataSurfaceManifest, type DataSurfaceManifestInput } from "./builder.js";
import type { DataSurfaceManifest } from "./contract.js";
import { projectDataSurfaceManifestDelta } from "./projector.js";

export type DataSurfaceManifestBuilder = (input: DataSurfaceManifestInput) => DataSurfaceManifest;

export function createDataSurfaceManifestSkill(
  builder: DataSurfaceManifestBuilder = buildDataSurfaceManifest,
): DismantlingSkill<DataSurfaceManifestInput, DataSurfaceManifest> {
  return defineSkill({
    manifest: {
      id: "data-surface-manifest",
      version: "1.0.0",
      contractVersion: "1.0",
      kind: "analysis",
      summary: "Describe reviewed component data sources, shapes, fields, consumers, injection boundaries, references, and unresolved evidence without generating a Data Pack.",
      stages: ["analyze"],
      consumes: ["sfc-visual-responsibility-graph", "data-cardinality-responsibility-graph", "api-fixture-responsibility-graph"],
      optionalConsumes: [],
      produces: ["data-surface-manifest"],
      requires: ["component-ownership", "data-cardinality", "api-responsibility"],
      optionalDependencies: ["state-responsibility", "transport-proxy"],
      qualityGates: ["reviewed-data-source-evidence", "data-shape-evidence", "manifest-consumer-separation", "unresolved-data-surface-review"],
      sideEffects: ["none"],
    },
    async execute(input) {
      return builder(input);
    },
    projectResponsibilityGraph: projectDataSurfaceManifestDelta,
  });
}

export const dataSurfaceManifestSkill = createDataSurfaceManifestSkill();
