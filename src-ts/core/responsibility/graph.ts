import type { JsonValue } from "../../types.js";

export const RESPONSIBILITY_GRAPH_DELTA_VERSION = "1.0" as const;

export interface ResponsibilityOwner {
  readonly file: string;
  readonly symbol?: string;
}

export interface ResponsibilityEvidence {
  readonly source: string;
  readonly detail: string;
  readonly confidence?: "high" | "medium" | "low";
}

export interface ResponsibilityNode {
  readonly id: string;
  readonly kind: string;
  readonly owner?: ResponsibilityOwner;
  readonly attributes: Readonly<Record<string, JsonValue>>;
  readonly evidence: readonly ResponsibilityEvidence[];
  readonly confidence?: "high" | "medium" | "low";
  readonly reviewRequired: boolean;
}

export interface ResponsibilityEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
  readonly evidence: readonly ResponsibilityEvidence[];
  readonly reviewRequired: boolean;
}

export interface ResponsibilityGraphUnresolved {
  readonly owner?: string;
  readonly reason: string;
  readonly source?: string;
}

export interface ResponsibilityGraphDelta {
  readonly schemaVersion: typeof RESPONSIBILITY_GRAPH_DELTA_VERSION;
  readonly skillId: string;
  readonly sourceGraphKind: string;
  readonly nodes: readonly ResponsibilityNode[];
  readonly edges: readonly ResponsibilityEdge[];
  readonly unresolved: readonly ResponsibilityGraphUnresolved[];
  readonly reviewRequired: boolean;
}
