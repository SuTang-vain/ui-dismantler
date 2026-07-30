import type { ResponsibilityGraphDelta } from "../responsibility/graph.js";
import { ResponsibilityGraphStore } from "../responsibility/store.js";
import type { SkillExecutionEvidence } from "./contract.js";
import type { SkillRegistry } from "./registry.js";

export interface SkillArtifactReference<Value = unknown> {
  readonly id: string;
  readonly contract: string;
  readonly producerSkillId: string;
  readonly producerSkillVersion: string;
  readonly value: Value;
}

export interface SkillInputBinding {
  readonly inputPath: string;
  readonly artifactContract: string;
  readonly outputPath?: string;
}

export interface SkillContextExecutionResult<Output> {
  readonly output: Output;
  readonly evidence: SkillExecutionEvidence;
  readonly artifacts: readonly SkillArtifactReference<Output>[];
  readonly graphDelta: ResponsibilityGraphDelta | null;
}

function valueAtPath(value: unknown, path: string | undefined): unknown {
  if (!path) return value;
  let current = value;
  for (const segment of path.split(".").filter(Boolean)) {
    if (current === null || typeof current !== "object" || !(segment in current)) {
      throw new Error(`artifact output path not found: ${path}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function setAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) throw new Error("input binding path cannot be empty");
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (existing === undefined) current[segment] = {};
    else if (existing === null || typeof existing !== "object" || Array.isArray(existing)) {
      throw new Error(`input binding cannot traverse non-object path: ${path}`);
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[segments.at(-1)!] = value;
}

export class SkillOutputStore {
  private readonly latestByContract = new Map<string, SkillArtifactReference>();
  private readonly allArtifacts: SkillArtifactReference[] = [];
  private sequence = 0;

  publish<Output>(skillId: string, skillVersion: string, contracts: readonly string[], output: Output): SkillArtifactReference<Output>[] {
    return contracts.map((contract) => {
      this.sequence += 1;
      const reference: SkillArtifactReference<Output> = {
        id: `${skillId}:${contract}:${this.sequence}`,
        contract,
        producerSkillId: skillId,
        producerSkillVersion: skillVersion,
        value: output,
      };
      this.latestByContract.set(contract, reference);
      this.allArtifacts.push(reference);
      return reference;
    });
  }

  has(contract: string): boolean {
    return this.latestByContract.has(contract);
  }

  get<Value = unknown>(contract: string): SkillArtifactReference<Value> {
    const artifact = this.latestByContract.get(contract);
    if (!artifact) throw new Error(`missing Skill artifact contract: ${contract}`);
    return artifact as SkillArtifactReference<Value>;
  }

  list(): SkillArtifactReference[] {
    return [...this.allArtifacts];
  }
}

export class SkillExecutionContext {
  readonly outputs: SkillOutputStore;
  readonly responsibilities: ResponsibilityGraphStore;
  private readonly registry: SkillRegistry;

  constructor(registry: SkillRegistry, outputs: SkillOutputStore = new SkillOutputStore(), responsibilities: ResponsibilityGraphStore = new ResponsibilityGraphStore()) {
    this.registry = registry;
    this.outputs = outputs;
    this.responsibilities = responsibilities;
  }

  bindInput<Input extends object>(baseInput: Input, bindings: readonly SkillInputBinding[]): Input {
    const bound = structuredClone(baseInput) as Input & Record<string, unknown>;
    for (const binding of bindings) {
      const artifact = this.outputs.get(binding.artifactContract);
      setAtPath(bound, binding.inputPath, valueAtPath(artifact.value, binding.outputPath));
    }
    return bound;
  }

  async execute<Input, Output>(skillId: string, input: Input): Promise<SkillContextExecutionResult<Output>> {
    const manifest = this.registry.get(skillId);
    const result = await this.registry.executeWithEvidence<Input, Output>(skillId, input);
    const artifacts = this.outputs.publish(skillId, manifest.version, manifest.produces, result.output);
    const graphDelta = this.registry.projectResponsibilityGraph(skillId, result.output);
    if (graphDelta) this.responsibilities.publish(graphDelta);
    return { ...result, artifacts, graphDelta };
  }

  async executeBound<Input extends object, Output>(skillId: string, baseInput: Input, bindings: readonly SkillInputBinding[]): Promise<SkillContextExecutionResult<Output>> {
    return await this.execute<Input, Output>(skillId, this.bindInput(baseInput, bindings));
  }
}
