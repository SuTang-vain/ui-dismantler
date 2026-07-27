import type { StaticExpressionValue } from "./static-expression.js";
import { collectArrayCardinalities, extractTopLevelStaticBindings } from "./static-expression.js";

export interface DataCardinalityEvidence {
  path: string;
  count: number;
  source: "module-static-binding" | "slice-limit" | "template-repeat";
}

export interface DataCardinalityResponsibility {
  staticBindings: Record<string, StaticExpressionValue>;
  cardinalities: DataCardinalityEvidence[];
  sliceLimits: number[];
  templateRepeats: string[];
  unresolvedReferences: string[];
}

export function analyzeDataCardinality(script: string, templateRepeats: string[]): DataCardinalityResponsibility {
  const staticBindings = extractTopLevelStaticBindings(script);
  const cardinalities: DataCardinalityEvidence[] = Object.entries(staticBindings).flatMap(([name, value]) =>
    collectArrayCardinalities(value, name).map((item) => ({ ...item, source: "module-static-binding" as const })),
  );
  const sliceLimits = [...script.matchAll(/\.slice\s*\(\s*0\s*,\s*(\d+)\s*\)/g)].map((match) => Number(match[1]));
  cardinalities.push(...sliceLimits.map((count, index) => ({ path: `slice[${index}]`, count, source: "slice-limit" as const })));
  cardinalities.push(...templateRepeats.map((repeat, index) => ({ path: `templateRepeat[${index}]:${repeat}`, count: -1, source: "template-repeat" as const })));
  const unresolvedReferences = templateRepeats
    .map((repeat) => repeat.match(/\s+in\s+([A-Za-z_$][\w$]*)/)?.[1] ?? "")
    .filter((name) => name && !(name in staticBindings));
  return { staticBindings, cardinalities, sliceLimits, templateRepeats, unresolvedReferences: [...new Set(unresolvedReferences)].sort() };
}
