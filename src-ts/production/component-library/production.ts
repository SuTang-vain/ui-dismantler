import type { DataSurfaceManifest } from "../../skills/data-surface-manifest/contract.js";
import type { PrimitiveDomCompilationGraph } from "../../skills/primitive-dom.js";
import type { SfcStateResponsibility } from "../../planning/sfc-state-responsibility.js";
import {
  enrichComponentLibraryBuildPlan,
  primitiveDomCompilationToBuildPlan,
  type PrimitiveDomProjectionOptions,
} from "./adapters.js";
import { runComponentLibraryBuild, type ComponentLibraryBuildReport } from "./pipeline.js";
import type { ComponentLibraryBuildPlan } from "./contract.js";
import type { ReviewedComponentStyleArtifact } from "./style-artifact.js";
import type { ComponentLibraryStateEvidenceMap } from "./state-artifact.js";
import { resolveReviewedComponentDataSurfaceArtifact, type ReviewedComponentDataSurfaceArtifact } from "./data-surface-artifact.js";

export interface ReviewedComponentLibraryProductionInput {
  readonly primitiveGraph: PrimitiveDomCompilationGraph;
  readonly projection: PrimitiveDomProjectionOptions;
  readonly state?: SfcStateResponsibility;
  readonly stateMap?: ComponentLibraryStateEvidenceMap;
  readonly dataSurface?: DataSurfaceManifest;
  readonly dataSurfaceArtifact?: ReviewedComponentDataSurfaceArtifact;
  readonly runtimeOptions?: unknown;
  readonly styleArtifact?: ReviewedComponentStyleArtifact;
}

export interface ReviewedComponentLibraryProductionResult {
  readonly schemaVersion: "1.0";
  readonly kind: "reviewed-component-library-production-result";
  readonly plan: ComponentLibraryBuildPlan;
  readonly build: ComponentLibraryBuildReport;
}

export async function runReviewedComponentLibraryProduction(
  input: ReviewedComponentLibraryProductionInput,
  outputRoot: string,
  options: { readonly overwrite?: boolean; readonly reportPath?: string } = {},
): Promise<ReviewedComponentLibraryProductionResult> {
  if (input.state && input.stateMap) throw new Error("Reviewed component production accepts either state or stateMap, not both");
  if (input.dataSurface && input.dataSurfaceArtifact) throw new Error("Reviewed component production accepts either dataSurface or dataSurfaceArtifact, not both");
  const dataSurfaceResolution = input.dataSurfaceArtifact
    ? resolveReviewedComponentDataSurfaceArtifact(input.primitiveGraph, input.dataSurfaceArtifact)
    : undefined;
  const projectedPlan = await primitiveDomCompilationToBuildPlan(input.primitiveGraph, { ...input.projection, ...(input.styleArtifact ? { styleArtifact: input.styleArtifact } : {}) });
  const basePlan = dataSurfaceResolution?.reviewReasons.length
    ? { ...projectedPlan, unresolved: [...projectedPlan.unresolved, ...dataSurfaceResolution.reviewReasons], reviewRequired: true }
    : projectedPlan;
  const plan = enrichComponentLibraryBuildPlan(basePlan, {
    primitiveGraph: input.primitiveGraph,
    ...(input.state ? { state: input.state } : {}),
    ...(input.stateMap ? { stateMap: input.stateMap } : {}),
    ...(dataSurfaceResolution?.manifest ? { dataSurface: dataSurfaceResolution.manifest, dataSurfaceArtifact: input.dataSurfaceArtifact } : input.dataSurface ? { dataSurface: input.dataSurface } : {}),
    ...(input.runtimeOptions !== undefined ? { runtimeOptions: input.runtimeOptions } : {}),
  });
  const build = await runComponentLibraryBuild(plan, outputRoot, options);
  return { schemaVersion: "1.0", kind: "reviewed-component-library-production-result", plan, build };
}
