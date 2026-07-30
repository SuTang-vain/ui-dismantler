import type { SkillArtifactReference } from "../artifacts/contract.js";
import type { ReviewedBindingRegistry } from "../artifacts/registry.js";
import type { ResponsibilityGraphDelta } from "../responsibility/graph.js";
import type { SkillExecutionEvidence } from "../skills/evidence.js";
import { SkillExecutionError } from "../skills/evidence.js";
import { SkillExecutionContext } from "../skills/execution-context.js";
import type { SkillRegistry } from "../skills/registry.js";
import {
  ProfileExecutionPlanner,
  type ProfileExecutionInputStatus,
  type ProfileExecutionPlan,
  type ProfileExecutionStep,
  type ProfileInputProvider,
} from "./execution-plan.js";
import type { TaskProfileRegistry } from "./registry.js";

export interface ProfileExecutionInputProvider extends ProfileInputProvider {
  readonly inputPath: string;
  readonly value: unknown;
}

export interface ProfileExecutorOptions {
  readonly enabledOptionalSkills?: readonly string[];
  readonly inputProviders?: readonly ProfileExecutionInputProvider[];
  readonly context?: SkillExecutionContext;
}

export type ProfileExecutionStatus = "succeeded" | "failed" | "blocked";
export type ProfileExecutionStepStatus = "succeeded" | "failed" | "blocked";

export interface ProfileExecutionStepReport {
  readonly index: number;
  readonly skillId: string;
  readonly status: ProfileExecutionStepStatus;
  readonly inputs: readonly ProfileExecutionInputStatus[];
  readonly output?: unknown;
  readonly evidence?: SkillExecutionEvidence;
  readonly artifacts: readonly SkillArtifactReference[];
  readonly graphDelta: ResponsibilityGraphDelta | null;
  readonly blockedBy: readonly string[];
  readonly error?: string;
}

export interface ProfileExecutionReport {
  readonly schemaVersion: "1.0";
  readonly profileId: string;
  readonly status: ProfileExecutionStatus;
  readonly plan: ProfileExecutionPlan;
  readonly steps: readonly ProfileExecutionStepReport[];
  readonly artifacts: readonly SkillArtifactReference[];
  readonly responsibilityDeltas: readonly ResponsibilityGraphDelta[];
  readonly blockers: readonly string[];
}

function setInputPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) throw new Error("Profile input provider path cannot be empty");
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (existing === undefined) current[segment] = {};
    else if (existing === null || typeof existing !== "object" || Array.isArray(existing)) {
      throw new Error(`Profile input provider cannot traverse non-object path: ${path}`);
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[segments.at(-1)!] = value;
}

function providerMap(providers: readonly ProfileExecutionInputProvider[]): Map<string, ProfileExecutionInputProvider> {
  const result = new Map<string, ProfileExecutionInputProvider>();
  for (const provider of providers) {
    if (result.has(provider.contract)) throw new Error(`duplicate Profile input provider: ${provider.contract}`);
    if (!provider.inputPath.trim()) throw new Error(`Profile input provider ${provider.contract} must declare an input path`);
    result.set(provider.contract, provider);
  }
  return result;
}

function blockedReasons(step: ProfileExecutionStep): string[] {
  return [
    ...step.blockedDependencies.map((dependency) => `dependency:${dependency}`),
    ...step.inputs
      .filter((input) => input.required && input.source === "missing")
      .map((input) => `missing-input:${input.contract}`),
    ...step.inputs
      .filter((input) => input.required && input.source === "unreviewed")
      .map((input) => `unreviewed-input:${input.contract}`),
  ];
}

function blockedStep(step: ProfileExecutionStep, reasons: readonly string[]): ProfileExecutionStepReport {
  return {
    index: step.index,
    skillId: step.skillId,
    status: "blocked",
    inputs: step.inputs,
    artifacts: [],
    graphDelta: null,
    blockedBy: [...reasons],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ProfileExecutor {
  private readonly skills: SkillRegistry;
  private readonly planner: ProfileExecutionPlanner;
  private readonly bindings: ReviewedBindingRegistry;

  constructor(skills: SkillRegistry, profiles: TaskProfileRegistry, bindings: ReviewedBindingRegistry) {
    this.skills = skills;
    this.planner = new ProfileExecutionPlanner(profiles, bindings);
    this.bindings = bindings;
  }

  async execute(profileId: string, options: ProfileExecutorOptions = {}): Promise<ProfileExecutionReport> {
    const providers = options.inputProviders ?? [];
    const providersByContract = providerMap(providers);
    const context = options.context ?? new SkillExecutionContext(this.skills);
    const initialArtifacts = context.outputs.list().length;
    const initialDeltas = context.responsibilities.list().length;
    const plan = this.planner.plan(profileId, {
      enabledOptionalSkills: options.enabledOptionalSkills,
      inputProviders: providers,
      existingArtifactContracts: context.outputs.list().map((artifact) => artifact.contract),
    });

    if (!plan.ready) {
      return {
        schemaVersion: "1.0",
        profileId,
        status: "blocked",
        plan,
        steps: plan.steps.map((step) => blockedStep(step, step.ready ? ["profile-plan-review"] : blockedReasons(step))),
        artifacts: [],
        responsibilityDeltas: [],
        blockers: plan.blockers,
      };
    }

    const reports: ProfileExecutionStepReport[] = [];
    let failedSkillId: string | null = null;

    for (const step of plan.steps) {
      if (failedSkillId) {
        reports.push(blockedStep(step, [`failed-skill:${failedSkillId}`]));
        continue;
      }

      const baseInput: Record<string, unknown> = {};
      for (const input of step.inputs) {
        if (input.source !== "provider") continue;
        const provider = providersByContract.get(input.contract);
        if (!provider) throw new Error(`planned Profile provider is unavailable at execution: ${input.contract}`);
        setInputPath(baseInput, provider.inputPath, provider.value);
      }

      try {
        const result = await context.executeBound<Record<string, unknown>, unknown>(step.skillId, baseInput, this.bindings.list());
        reports.push({
          index: step.index,
          skillId: step.skillId,
          status: "succeeded",
          inputs: step.inputs,
          output: result.output,
          evidence: result.evidence,
          artifacts: result.artifacts,
          graphDelta: result.graphDelta,
          blockedBy: [],
        });
      } catch (error) {
        failedSkillId = step.skillId;
        reports.push({
          index: step.index,
          skillId: step.skillId,
          status: "failed",
          inputs: step.inputs,
          ...(error instanceof SkillExecutionError ? { evidence: error.evidence } : {}),
          artifacts: [],
          graphDelta: null,
          blockedBy: [],
          error: errorMessage(error),
        });
      }
    }

    const artifacts = context.outputs.list().slice(initialArtifacts);
    const responsibilityDeltas = context.responsibilities.list().slice(initialDeltas);
    return {
      schemaVersion: "1.0",
      profileId,
      status: failedSkillId ? "failed" : "succeeded",
      plan,
      steps: reports,
      artifacts,
      responsibilityDeltas,
      blockers: failedSkillId ? [`Profile execution failed at ${failedSkillId}`] : [],
    };
  }
}
