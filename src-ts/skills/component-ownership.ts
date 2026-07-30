import type { ResponsibilityGraphDelta, ResponsibilityNode } from "../core/responsibility/graph.js";
import { defineSkill, type DismantlingSkill } from "../core/skills/contract.js";
import {
  analyzeSfcVisualResponsibilities,
  type SfcVisualResponsibilityGraph,
} from "../planning/sfc-visual-responsibility.js";
import type { JsonValue } from "../types.js";

export interface ComponentOwnershipSkillInput {
  sourceRoot: string;
}

export type ComponentOwnershipAnalyzer = (sourceRoot: string) => SfcVisualResponsibilityGraph;

function componentNodeId(componentId: string): string {
  return `component:${componentId}`;
}

export function projectComponentOwnershipDelta(graph: SfcVisualResponsibilityGraph): ResponsibilityGraphDelta {
  const nodes: ResponsibilityNode[] = graph.components.map((component) => {
    const attributes: Record<string, JsonValue> = {
      componentName: component.componentName,
      visualRegions: component.visualRegions,
      childComponents: component.childComponents,
      lifecycle: component.lifecycle,
      chartResponsibilityIds: component.chartResponsibilityIds,
      styleSheets: component.styles.length,
      eventBindings: component.bindings.events.length,
      modelBindings: component.bindings.models.length,
      conditionalBindings: component.bindings.conditions.length,
      repeatedBindings: component.bindings.loops.length,
    };
    return {
      id: componentNodeId(component.id),
      kind: "component-owner",
      owner: { file: component.file, symbol: component.componentName },
      attributes,
      evidence: [{ source: component.file, detail: `SFC component ownership: ${component.componentName}`, confidence: component.confidence }],
      confidence: component.confidence,
      reviewRequired: component.reviewReasons.length > 0,
    };
  });
  const componentsByName = new Map<string, typeof graph.components>();
  for (const component of graph.components) componentsByName.set(component.componentName, [...(componentsByName.get(component.componentName) ?? []), component]);
  const ambiguousChildren: Array<{ owner: string; reason: string; source: string }> = [];
  const edges = graph.components.flatMap((component) => component.childComponents.flatMap((childName) => {
    const candidates = componentsByName.get(childName) ?? [];
    if (candidates.length > 1) {
      ambiguousChildren.push({ owner: componentNodeId(component.id), reason: `child component ownership is ambiguous for ${childName}`, source: component.file });
      return [];
    }
    const child = candidates[0];
    return child ? [{
      from: componentNodeId(component.id),
      to: componentNodeId(child.id),
      relation: "owns-child-component",
      evidence: [{ source: component.file, detail: `${component.componentName} imports ${childName}`, confidence: "high" as const }],
      reviewRequired: false,
    }] : [];
  }));
  const unresolved = [
    ...graph.blockers.map((reason) => ({ reason, source: graph.sourceRoot })),
    ...graph.reviewReasons.map((reason) => ({ reason, source: graph.sourceRoot })),
    ...graph.components.flatMap((component) => component.reviewReasons.map((reason) => ({ owner: componentNodeId(component.id), reason, source: component.file }))),
    ...ambiguousChildren,
  ];
  return {
    schemaVersion: "1.0",
    skillId: "component-ownership",
    sourceGraphKind: graph.kind,
    nodes,
    edges,
    unresolved,
    reviewRequired: graph.reviewRequired || unresolved.length > 0,
  };
}

export function createComponentOwnershipSkill(analyzer: ComponentOwnershipAnalyzer = analyzeSfcVisualResponsibilities): DismantlingSkill<ComponentOwnershipSkillInput, SfcVisualResponsibilityGraph> {
  return defineSkill({
    manifest: {
      id: "component-ownership",
      version: "1.0.0",
      contractVersion: "1.0",
      kind: "analysis",
      summary: "Compatibility wrapper for Vue SFC component, template, style, state, data-cardinality, and visual ownership analysis.",
      stages: ["analyze"],
      consumes: ["project-source-root"],
      produces: ["sfc-visual-responsibility-graph"],
      requires: ["source-structure"],
      optionalDependencies: [],
      qualityGates: ["component-owner-evidence", "unresolved-component-review"],
      sideEffects: ["filesystem"],
    },
    async execute(input) {
      return analyzer(input.sourceRoot);
    },
    projectResponsibilityGraph: projectComponentOwnershipDelta,
  });
}

export const componentOwnershipSkill = createComponentOwnershipSkill();
