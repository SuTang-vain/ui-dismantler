import { defineSkill, type DismantlingSkill } from "../core/skills/contract.js";
import {
  analyzeSpaAuthGuardResponsibilities,
  type SpaAuthGuardResponsibilityAnalysis,
} from "../planning/spa-auth-guard-responsibility.js";

export interface AuthGuardSkillInput {
  sourceRoot: string;
}

export type AuthGuardAnalyzer = (sourceRoot: string) => SpaAuthGuardResponsibilityAnalysis;

export function createAuthGuardSkill(analyzer: AuthGuardAnalyzer = analyzeSpaAuthGuardResponsibilities): DismantlingSkill<AuthGuardSkillInput, SpaAuthGuardResponsibilityAnalysis> {
  return defineSkill({
    manifest: {
      id: "auth-guard",
      version: "1.0.0",
      contractVersion: "1.0",
      kind: "analysis",
      summary: "Compatibility wrapper for storage, login, dynamic-route, and navigation-guard responsibility analysis.",
      stages: ["analyze"],
      consumes: ["spa-source-root"],
      optionalConsumes: [],
      produces: ["spa-auth-guard-responsibility"],
      requires: ["source-structure", "state-responsibility"],
      optionalDependencies: ["spa-router"],
      qualityGates: ["fresh-authentication-required", "cross-run-persistence-disabled", "unresolved-auth-review"],
      sideEffects: ["filesystem"],
    },
    async execute(input) {
      return analyzer(input.sourceRoot);
    },
  });
}

export const authGuardSkill = createAuthGuardSkill();
