import type { ResponsibilityGraphDelta } from "../core/responsibility/graph.js";
import { defineSkill, type DismantlingSkill } from "../core/skills/contract.js";
import type { DataCardinalityResponsibility } from "../planning/data-cardinality.js";
import type { SfcVisualComponentResponsibility } from "../planning/sfc-visual-responsibility.js";

export interface DataCardinalitySkillInput {
  readonly components: readonly SfcVisualComponentResponsibility[];
}

export interface ComponentDataCardinalityResponsibility {
  readonly componentId: string;
  readonly componentName: string;
  readonly componentFile: string;
  readonly responsibility: DataCardinalityResponsibility;
  readonly reviewRequired: boolean;
}

export interface DataCardinalityResponsibilityGraph {
  readonly schemaVersion: "1.0";
  readonly kind: "data-cardinality-responsibility-graph";
  readonly components: readonly ComponentDataCardinalityResponsibility[];
  readonly metrics: {
    readonly components: number;
    readonly staticBindings: number;
    readonly cardinalityEvidence: number;
    readonly templateRepeats: number;
    readonly unresolvedReferences: number;
  };
  readonly reviewRequired: boolean;
}

export type DataCardinalityExtractor = (
  components: readonly SfcVisualComponentResponsibility[],
) => DataCardinalityResponsibilityGraph;

export function extractDataCardinalityResponsibilities(
  components: readonly SfcVisualComponentResponsibility[],
): DataCardinalityResponsibilityGraph {
  const responsibilities = components.map((component): ComponentDataCardinalityResponsibility => ({
    componentId: component.id,
    componentName: component.componentName,
    componentFile: component.file,
    responsibility: component.dataCardinality,
    reviewRequired: component.dataCardinality.unresolvedReferences.length > 0 || component.dataCardinality.cardinalities.some((item) => item.count < 0),
  }));
  return {
    schemaVersion: "1.0",
    kind: "data-cardinality-responsibility-graph",
    components: responsibilities,
    metrics: {
      components: responsibilities.length,
      staticBindings: responsibilities.reduce((total, component) => total + Object.keys(component.responsibility.staticBindings).length, 0),
      cardinalityEvidence: responsibilities.reduce((total, component) => total + component.responsibility.cardinalities.length, 0),
      templateRepeats: responsibilities.reduce((total, component) => total + component.responsibility.templateRepeats.length, 0),
      unresolvedReferences: responsibilities.reduce((total, component) => total + component.responsibility.unresolvedReferences.length, 0),
    },
    reviewRequired: responsibilities.some((component) => component.reviewRequired),
  };
}

export function projectDataCardinalityDelta(graph: DataCardinalityResponsibilityGraph): ResponsibilityGraphDelta {
  const nodes = graph.components.flatMap((component) => component.responsibility.cardinalities.map((cardinality, index) => ({
    id: `data-cardinality:${component.componentId}:${index}`,
    kind: "data-cardinality",
    owner: { file: component.componentFile, symbol: component.componentName },
    attributes: {
      path: cardinality.path,
      count: cardinality.count,
      source: cardinality.source,
    },
    evidence: [{
      source: component.componentFile,
      detail: `${cardinality.path} has cardinality ${cardinality.count}`,
      confidence: cardinality.count >= 0 ? "high" as const : "low" as const,
    }],
    confidence: cardinality.count >= 0 ? "high" as const : "low" as const,
    reviewRequired: cardinality.count < 0,
  })));
  const edges = graph.components.flatMap((component) => component.responsibility.cardinalities.map((_, index) => ({
    from: `component:${component.componentId}`,
    to: `data-cardinality:${component.componentId}:${index}`,
    relation: "has-data-cardinality",
    evidence: [{ source: component.componentFile, detail: `${component.componentName} owns cardinality evidence`, confidence: "high" as const }],
    reviewRequired: component.reviewRequired,
  })));
  const unresolved = graph.components.flatMap((component) => component.responsibility.unresolvedReferences.map((reference) => ({
    owner: `component:${component.componentId}`,
    source: component.componentFile,
    reason: `unresolved repeated data reference: ${reference}`,
  })));
  return {
    schemaVersion: "1.0",
    skillId: "data-cardinality",
    sourceGraphKind: graph.kind,
    nodes,
    edges,
    unresolved,
    reviewRequired: graph.reviewRequired || nodes.some((node) => node.reviewRequired),
  };
}

export function createDataCardinalitySkill(
  extractor: DataCardinalityExtractor = extractDataCardinalityResponsibilities,
): DismantlingSkill<DataCardinalitySkillInput, DataCardinalityResponsibilityGraph> {
  return defineSkill({
    manifest: {
      id: "data-cardinality",
      version: "1.0.0",
      contractVersion: "1.0",
      kind: "analysis",
      summary: "Extract component-owned static collection, slice-limit, and repeated-region cardinality evidence from the reviewed SFC responsibility graph.",
      stages: ["analyze"],
      consumes: ["sfc-visual-responsibility-graph"],
      optionalConsumes: [],
      produces: ["data-cardinality-responsibility-graph"],
      requires: ["component-ownership"],
      optionalDependencies: ["state-responsibility"],
      qualityGates: ["cardinality-structural-evidence", "unresolved-cardinality-review"],
      sideEffects: ["none"],
    },
    async execute(input) {
      return extractor(input.components);
    },
    projectResponsibilityGraph: projectDataCardinalityDelta,
  });
}

export const dataCardinalitySkill = createDataCardinalitySkill();
