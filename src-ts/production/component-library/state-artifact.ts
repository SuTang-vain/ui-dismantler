import type { SfcStateResponsibility } from "../../planning/sfc-state-responsibility.js";
import type { SfcVisualResponsibilityGraph } from "../../planning/sfc-visual-responsibility.js";
import type { PrimitiveDomCompilationGraph } from "../../skills/primitive-dom.js";

export interface ComponentLibraryStateEvidenceEntry {
  readonly ownerId: string;
  readonly responsibility: SfcStateResponsibility;
  readonly reviewed: boolean;
  readonly evidence: readonly string[];
}

export interface ComponentLibraryStateEvidenceMap {
  readonly schemaVersion: "1.0";
  readonly kind: "component-state-evidence-map";
  readonly entries: readonly ComponentLibraryStateEvidenceEntry[];
  readonly unresolved?: readonly string[];
  readonly reviewRequired: boolean;
}

export function createComponentStateEvidenceMapCandidate(
  graph: SfcVisualResponsibilityGraph,
  primitiveGraph: PrimitiveDomCompilationGraph,
): ComponentLibraryStateEvidenceMap {
  const sourceById = new Map(graph.components.map((component) => [component.id, component]));
  const entries: ComponentLibraryStateEvidenceEntry[] = [];
  const unresolved: string[] = [];
  for (const owner of primitiveGraph.components) {
    const component = sourceById.get(owner.componentId);
    if (!component) { unresolved.push(`Primitive owner ${owner.componentId} has no SFC state responsibility`); continue; }
    if (component.file !== owner.componentFile || component.componentName !== owner.componentName) {
      unresolved.push(`Primitive owner identity differs from SFC state responsibility: ${owner.componentId}`);
      continue;
    }
    entries.push({
      ownerId: owner.componentId,
      responsibility: component.stateResponsibility,
      reviewed: false,
      evidence: [`SFC state responsibility owner=${component.id} file=${component.file} parsed=${component.stateResponsibility.parsed} parseMode=${component.stateResponsibility.parseMode}`],
    });
  }
  return { schemaVersion: "1.0", kind: "component-state-evidence-map", entries, unresolved, reviewRequired: true };
}
