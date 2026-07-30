import { performance } from "node:perf_hooks";
import type { ResponsibilityGraphDelta } from "../responsibility/graph.js";
import {
  SKILL_CONTRACT_VERSION,
  type DismantlingSkill,
  type SkillManifest,
} from "./contract.js";
import {
  SKILL_EXECUTION_EVIDENCE_VERSION,
  SkillExecutionError,
  type SkillExecutionEvidence,
  type SkillExecutionResult,
} from "./evidence.js";

interface RegisteredSkill {
  manifest: SkillManifest;
  execute(input: unknown): Promise<unknown>;
  projectResponsibilityGraph?: (output: unknown) => ResponsibilityGraphDelta;
}

function assertIdentifier(value: string, label: string): void {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`${label} must use lowercase kebab-case: ${value}`);
  }
}

function assertManifest(manifest: SkillManifest): void {
  assertIdentifier(manifest.id, "skill id");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    throw new Error(`skill ${manifest.id} must declare a semantic version: ${manifest.version}`);
  }
  if (manifest.contractVersion !== SKILL_CONTRACT_VERSION) {
    throw new Error(`skill ${manifest.id} requires unsupported contract ${manifest.contractVersion}`);
  }
  for (const dependency of [...manifest.requires, ...manifest.optionalDependencies]) {
    assertIdentifier(dependency, `dependency of ${manifest.id}`);
    if (dependency === manifest.id) throw new Error(`skill ${manifest.id} cannot depend on itself`);
  }
  if (!manifest.summary.trim()) throw new Error(`skill ${manifest.id} must declare a summary`);
  if (manifest.stages.length === 0) throw new Error(`skill ${manifest.id} must declare at least one stage`);
  const uniqueFields: Array<[string, readonly string[]]> = [
    ["stages", manifest.stages],
    ["consumes", manifest.consumes],
    ["optional consumes", manifest.optionalConsumes],
    ["produces", manifest.produces],
    ["required dependencies", manifest.requires],
    ["optional dependencies", manifest.optionalDependencies],
    ["quality gates", manifest.qualityGates],
    ["side effects", manifest.sideEffects],
  ];
  for (const [label, values] of uniqueFields) {
    if (new Set(values).size !== values.length) throw new Error(`skill ${manifest.id} declares duplicate ${label}`);
  }
  const requiredConsumes = new Set(manifest.consumes);
  const consumeOverlap = manifest.optionalConsumes.find((contract) => requiredConsumes.has(contract));
  if (consumeOverlap) throw new Error(`skill ${manifest.id} declares ${consumeOverlap} as both required and optional input`);
  const required = new Set(manifest.requires);
  const overlap = manifest.optionalDependencies.find((dependency) => required.has(dependency));
  if (overlap) throw new Error(`skill ${manifest.id} declares ${overlap} as both required and optional`);
  if (manifest.sideEffects.includes("none") && manifest.sideEffects.length !== 1) {
    throw new Error(`skill ${manifest.id} cannot combine the none side effect with active side effects`);
  }
}

function roundedDuration(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(3));
}

export class SkillRegistry {
  private readonly skills = new Map<string, RegisteredSkill>();

  register<Input, Output>(skill: DismantlingSkill<Input, Output>): this {
    assertManifest(skill.manifest);
    if (this.skills.has(skill.manifest.id)) throw new Error(`skill already registered: ${skill.manifest.id}`);
    this.skills.set(skill.manifest.id, {
      manifest: skill.manifest,
      execute: (input: unknown) => skill.execute(input as Input),
      ...(skill.projectResponsibilityGraph ? { projectResponsibilityGraph: (output: unknown) => skill.projectResponsibilityGraph!(output as Output) } : {}),
    });
    return this;
  }

  has(id: string): boolean {
    return this.skills.has(id);
  }

  get(id: string): SkillManifest {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`unknown skill: ${id}`);
    return skill.manifest;
  }

  list(): SkillManifest[] {
    return [...this.skills.values()].map((skill) => skill.manifest).sort((left, right) => left.id.localeCompare(right.id));
  }

  resolve(requestedIds: readonly string[]): SkillManifest[] {
    const ordered: SkillManifest[] = [];
    const resolved = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string): void => {
      if (resolved.has(id)) return;
      const skill = this.skills.get(id);
      if (!skill) throw new Error(`unknown skill: ${id}`);
      if (visiting.has(id)) throw new Error(`skill dependency cycle detected at ${id}`);
      visiting.add(id);
      for (const dependency of skill.manifest.requires) {
        if (!this.skills.has(dependency)) throw new Error(`skill ${id} requires unregistered skill: ${dependency}`);
        visit(dependency);
      }
      visiting.delete(id);
      resolved.add(id);
      ordered.push(skill.manifest);
    };

    for (const id of requestedIds) visit(id);
    return ordered;
  }

  async execute<Input, Output>(id: string, input: Input): Promise<Output> {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`unknown skill: ${id}`);
    return await skill.execute(input) as Output;
  }

  projectResponsibilityGraph<Output>(id: string, output: Output): ResponsibilityGraphDelta | null {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`unknown skill: ${id}`);
    return skill.projectResponsibilityGraph ? skill.projectResponsibilityGraph(output) : null;
  }

  async executeWithEvidence<Input, Output>(id: string, input: Input): Promise<SkillExecutionResult<Output>> {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`unknown skill: ${id}`);
    const startedAt = performance.now();
    const startedAtIso = new Date().toISOString();
    const dependencyIds = this.resolve([id]).map((manifest) => manifest.id).filter((dependency) => dependency !== id);
    const evidence = (status: "succeeded" | "failed", error?: string): SkillExecutionEvidence => ({
      schemaVersion: SKILL_EXECUTION_EVIDENCE_VERSION,
      skillId: skill.manifest.id,
      skillVersion: skill.manifest.version,
      contractVersion: skill.manifest.contractVersion,
      status,
      startedAt: startedAtIso,
      durationMs: roundedDuration(startedAt),
      stages: skill.manifest.stages,
      consumes: skill.manifest.consumes,
      optionalConsumes: skill.manifest.optionalConsumes,
      produces: skill.manifest.produces,
      resolvedDependencies: dependencyIds,
      qualityGates: skill.manifest.qualityGates,
      sideEffects: skill.manifest.sideEffects,
      ...(error ? { error } : {}),
    });
    try {
      const output = await skill.execute(input) as Output;
      return { output, evidence: evidence("succeeded") };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SkillExecutionError(`skill ${id} failed: ${message}`, evidence("failed", message), { cause: error });
    }
  }
}
