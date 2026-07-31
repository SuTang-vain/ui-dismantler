import { defineSkill, type DismantlingSkill } from "../core/skills/contract.js";
import {
  compilePrimitiveDom,
  type PrimitiveDomCompilation,
} from "../planning/primitive-dom-compiler.js";
import type { SfcVisualComponentResponsibility, SfcVisualResponsibilityGraph } from "../planning/sfc-visual-responsibility.js";

export interface PrimitiveDomSkillInput {
  /** Consume the complete reviewed graph so graph-level blockers cannot be dropped by a partial binding. */
  readonly graph: SfcVisualResponsibilityGraph;
}

export interface PrimitiveDomComponentCompilation {
  readonly componentId: string;
  readonly componentName: string;
  readonly componentFile: string;
  readonly compilation: PrimitiveDomCompilation;
  readonly reviewRequired: boolean;
}

export interface PrimitiveDomCompilationGraph {
  readonly schemaVersion: "1.0";
  readonly kind: "primitive-dom-compilation-graph";
  readonly components: readonly PrimitiveDomComponentCompilation[];
  readonly metrics: {
    readonly components: number;
    readonly sourceNodes: number;
    readonly compiledNodes: number;
    readonly primitiveNodes: number;
    readonly inlineStyleRules: number;
    readonly responsiveRules: number;
    readonly interactionBindings: number;
    readonly unsupportedPrimitiveNodes: number;
  };
  readonly reviewReasons: readonly string[];
  readonly reviewRequired: boolean;
}

export type PrimitiveDomCompiler = (
  structure: SfcVisualComponentResponsibility["templateStructure"],
  scope: string,
) => PrimitiveDomCompilation;

export function compilePrimitiveDomResponsibilities(
  components: readonly SfcVisualComponentResponsibility[],
  compiler: PrimitiveDomCompiler = compilePrimitiveDom,
  upstreamReviewReasons: readonly string[] = [],
  upstreamReviewRequired = false,
): PrimitiveDomCompilationGraph {
  const compilations = components.map((component): PrimitiveDomComponentCompilation => {
    const compilation = compiler(component.templateStructure, component.id);
    return {
      componentId: component.id,
      componentName: component.componentName,
      componentFile: component.file,
      compilation,
      reviewRequired: component.reviewReasons.length > 0 || compilation.reviewReasons.length > 0,
    };
  });
  const reviewReasons = [
    ...upstreamReviewReasons.map((reason) => `component-ownership: ${reason}`),
    ...compilations.flatMap((component) => [
      ...component.compilation.reviewReasons.map((reason) => `${component.componentName}: ${reason}`),
      ...(component.reviewRequired && component.compilation.reviewReasons.length === 0 ? [`${component.componentName}: source component ownership requires review`] : []),
    ]),
  ];
  const metrics = {
    components: compilations.length,
    sourceNodes: compilations.reduce((total, item) => total + item.compilation.metrics.sourceNodes, 0),
    compiledNodes: compilations.reduce((total, item) => total + item.compilation.metrics.compiledNodes, 0),
    primitiveNodes: compilations.reduce((total, item) => total + item.compilation.metrics.primitiveNodes, 0),
    inlineStyleRules: compilations.reduce((total, item) => total + item.compilation.metrics.inlineStyleRules, 0),
    responsiveRules: compilations.reduce((total, item) => total + item.compilation.metrics.responsiveRules, 0),
    interactionBindings: compilations.reduce((total, item) => total + item.compilation.metrics.interactionBindings, 0),
    unsupportedPrimitiveNodes: compilations.reduce((total, item) => total + item.compilation.metrics.unsupportedPrimitiveNodes, 0),
  };
  return {
    schemaVersion: "1.0",
    kind: "primitive-dom-compilation-graph",
    components: compilations,
    metrics,
    reviewReasons,
    reviewRequired: upstreamReviewRequired || compilations.some((component) => component.reviewRequired),
  };
}

export function createPrimitiveDomSkill(
  compiler: PrimitiveDomCompiler = compilePrimitiveDom,
): DismantlingSkill<PrimitiveDomSkillInput, PrimitiveDomCompilationGraph> {
  return defineSkill({
    manifest: {
      id: "primitive-dom",
      version: "1.0.0",
      contractVersion: "1.0",
      kind: "generation",
      summary: "Compile reviewed SFC template structures into provenance-preserving primitive DOM, style, and interaction bindings without inventing unresolved UI ownership.",
      stages: ["generate"],
      consumes: ["sfc-visual-responsibility-graph"],
      optionalConsumes: [],
      produces: ["primitive-dom-compilation"],
      requires: ["component-ownership"],
      optionalDependencies: ["state-responsibility", "data-cardinality"],
      qualityGates: ["primitive-source-provenance", "unsupported-primitive-review", "conditional-state-review"],
      sideEffects: ["none"],
    },
    async execute(input) {
      return compilePrimitiveDomResponsibilities(input.graph.components, compiler, input.graph.reviewReasons, input.graph.reviewRequired);
    },
  });
}

export const primitiveDomSkill = createPrimitiveDomSkill();
