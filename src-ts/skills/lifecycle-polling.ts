import type { ResponsibilityGraphDelta, ResponsibilityNode } from "../core/responsibility/graph.js";
import { defineSkill, type DismantlingSkill } from "../core/skills/contract.js";
import {
  analyzeLifecyclePollingResponsibilities,
  linkLifecyclePollingResponsibilities,
  type LifecyclePollingResponsibilityGraph,
} from "../planning/lifecycle-polling-responsibility.js";
import type { ApiFixtureResponsibilityGraph } from "../planning/api-fixture-responsibility.js";
import type { RouterSfcResponsibilityGraph } from "../planning/router-sfc-responsibility.js";
import type { SfcVisualResponsibilityGraph } from "../planning/sfc-visual-responsibility.js";
import type { JsonValue } from "../types.js";

export interface LifecyclePollingSkillInput {
  readonly graph: SfcVisualResponsibilityGraph;
  readonly api?: ApiFixtureResponsibilityGraph;
  readonly router?: RouterSfcResponsibilityGraph;
}

export type LifecyclePollingAnalyzer = (graph: SfcVisualResponsibilityGraph) => LifecyclePollingResponsibilityGraph;

function timerNodeId(timerId: string): string {
  return `lifecycle-polling:${timerId}`;
}

export function projectLifecyclePollingDelta(graph: LifecyclePollingResponsibilityGraph): ResponsibilityGraphDelta {
  const nodes: ResponsibilityNode[] = graph.components.flatMap((component) => component.timers.map((timer): ResponsibilityNode => ({
    id: timerNodeId(timer.id),
    kind: "lifecycle-timer",
    owner: { file: component.componentFile, symbol: component.componentName },
    attributes: {
      componentId: component.componentId,
      timerKind: timer.kind,
      handle: timer.handle ?? null,
      controls: [...timer.controls],
      callback: timer.callback,
      callbackCalls: [...timer.callbackCalls],
      intervalMs: timer.intervalMs,
      startHooks: [...timer.startHooks],
      cleanupHooks: [...timer.cleanupHooks],
      terminalStopProven: timer.terminalStopProven,
      apiResponsibilities: timer.apiResponsibilities.map((link) => ({ id: link.responsibilityId, method: link.method, path: link.path, confidence: link.confidence })),
      routeTransitions: timer.routeTransitions.map((transition) => ({ method: transition.method, targetPattern: transition.targetPattern, targetName: transition.targetName, resolution: transition.resolution, matchedRoutePath: transition.matchedRoutePath ?? null })),
    } satisfies Record<string, JsonValue>,
    evidence: [{ source: component.componentFile, detail: `${timer.kind} ${timer.callback} interval=${timer.intervalMs ?? "dynamic"}`, confidence: timer.confidence }],
    confidence: timer.confidence,
    reviewRequired: timer.reviewReasons.length > 0 || component.reviewReasons.length > 0,
  })));
  const edges = graph.components.flatMap((component) => component.timers.map((timer) => ({
    from: `component:${component.componentId}`,
    to: timerNodeId(timer.id),
    relation: "owns-lifecycle-timer",
    evidence: [{ source: component.componentFile, detail: `${component.componentName} owns ${timer.kind}`, confidence: timer.confidence }],
    reviewRequired: timer.reviewReasons.length > 0 || component.reviewReasons.length > 0,
  })));
  return {
    schemaVersion: "1.0",
    skillId: "lifecycle-polling",
    sourceGraphKind: graph.kind,
    nodes,
    edges,
    unresolved: [
      ...graph.unresolved.map((item) => ({ owner: `component:${item.componentId}`, source: item.componentFile, reason: item.reason })),
      ...graph.reviewReasons.map((item) => ({ owner: `component:${item.componentId}`, source: item.componentFile, reason: item.reason })),
    ],
    reviewRequired: graph.reviewRequired,
  };
}

export function createLifecyclePollingSkill(analyzer: LifecyclePollingAnalyzer = analyzeLifecyclePollingResponsibilities): DismantlingSkill<LifecyclePollingSkillInput, LifecyclePollingResponsibilityGraph> {
  return defineSkill({
    manifest: {
      id: "lifecycle-polling",
      version: "1.0.0",
      contractVersion: "1.0",
      kind: "analysis",
      summary: "Extract lifecycle-owned timers, polling callbacks, terminal stops, and cleanup responsibilities from reviewed Vue SFC ownership.",
      stages: ["analyze"],
      consumes: ["sfc-visual-responsibility-graph"],
      optionalConsumes: ["api-fixture-responsibility-graph", "router-sfc-responsibility-graph"],
      produces: ["lifecycle-polling-responsibility-graph"],
      requires: ["source-structure", "component-ownership", "state-responsibility"],
      optionalDependencies: ["api-responsibility", "spa-router"],
      qualityGates: ["timer-creation-evidence", "lifecycle-cleanup-ownership", "unresolved-lifecycle-review"],
      sideEffects: ["filesystem"],
    },
    async execute(input) {
      const graph = analyzer(input.graph);
      return linkLifecyclePollingResponsibilities(graph, { ...(input.api ? { api: input.api } : {}), ...(input.router ? { router: input.router } : {}) });
    },
    projectResponsibilityGraph: projectLifecyclePollingDelta,
  });
}

export const lifecyclePollingSkill = createLifecyclePollingSkill();
