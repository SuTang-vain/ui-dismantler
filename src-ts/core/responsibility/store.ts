import type {
  ResponsibilityEdge,
  ResponsibilityGraphDelta,
  ResponsibilityGraphUnresolved,
  ResponsibilityNode,
} from "./graph.js";

export interface ResponsibilityGraphSnapshot {
  readonly schemaVersion: "1.0";
  readonly deltas: readonly ResponsibilityGraphDelta[];
  readonly nodes: readonly ResponsibilityNode[];
  readonly edges: readonly ResponsibilityEdge[];
  readonly unresolved: readonly ResponsibilityGraphUnresolved[];
  readonly reviewRequired: boolean;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export class ResponsibilityGraphStore {
  private readonly deltas: ResponsibilityGraphDelta[] = [];

  publish(delta: ResponsibilityGraphDelta): void {
    this.deltas.push(delta);
  }

  list(): ResponsibilityGraphDelta[] {
    return [...this.deltas];
  }

  snapshot(): ResponsibilityGraphSnapshot {
    const nodes = new Map<string, ResponsibilityNode>();
    for (const delta of this.deltas) for (const node of delta.nodes) {
      const existing = nodes.get(node.id);
      if (existing && stableJson(existing) !== stableJson(node)) {
        throw new Error(`conflicting responsibility node: ${node.id}`);
      }
      nodes.set(node.id, node);
    }
    const edges = this.deltas.flatMap((delta) => delta.edges);
    const unresolved = this.deltas.flatMap((delta) => delta.unresolved);
    return {
      schemaVersion: "1.0",
      deltas: [...this.deltas],
      nodes: [...nodes.values()],
      edges,
      unresolved,
      reviewRequired: this.deltas.some((delta) => delta.reviewRequired) || unresolved.length > 0,
    };
  }
}
