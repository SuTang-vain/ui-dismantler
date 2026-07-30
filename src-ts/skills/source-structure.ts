import { analyzeHtml } from "../analysis/analyzer.js";
import { defineSkill, type DismantlingSkill } from "../core/skills/contract.js";
import type { Manifest } from "../types.js";

export type SourceStructureOptions = Parameters<typeof analyzeHtml>[1];

export interface SourceStructureSkillInput {
  htmlPath: string;
  options?: SourceStructureOptions;
}

export type SourceStructureAnalyzer = (htmlPath: string, options?: SourceStructureOptions) => Manifest;

export function createSourceStructureSkill(analyzer: SourceStructureAnalyzer = analyzeHtml): DismantlingSkill<SourceStructureSkillInput, Manifest> {
  return defineSkill({
    manifest: {
      id: "source-structure",
      version: "1.0.0",
      contractVersion: "1.0",
      kind: "analysis",
      summary: "Compatibility wrapper for the existing deterministic HTML source manifest analyzer.",
      stages: ["analyze"],
      consumes: ["html-path"],
      optionalConsumes: ["source-analysis-options"],
      produces: ["source-manifest@1.0"],
      requires: [],
      optionalDependencies: [],
      qualityGates: [],
      sideEffects: ["filesystem"],
    },
    async execute(input) {
      return analyzer(input.htmlPath, input.options);
    },
  });
}

export const sourceStructureSkill = createSourceStructureSkill();
