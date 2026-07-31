import type { StaticExpressionValue } from "./static-expression.js";
import { collectArrayCardinalities, extractTopLevelStaticBindings } from "./static-expression.js";


const TEMPLATE_LANGUAGE_GLOBALS = new Set([
  "Array", "Boolean", "Date", "JSON", "Math", "Map", "Number", "Object", "Promise", "RegExp", "Set", "String",
  "$attrs", "$data", "$event", "$props", "$refs", "$slots", "$root", "$parent", "$el",
]);

function templateRepeatRoots(templateRepeats: readonly string[]): string[] {
  return [...new Set(templateRepeats.map((repeat) => repeat.match(/\bin\s+([A-Za-z_$][\w$]*)/)?.[1] ?? "").filter(Boolean))];
}

function templateLoopLocals(templateRepeats: readonly string[]): Set<string> {
  const locals = new Set<string>();
  for (const repeat of templateRepeats) {
    const left = repeat.split(/\bin\s+/, 1)[0] ?? "";
    for (const identifier of left.matchAll(/[A-Za-z_$][\w$]*/g)) locals.add(identifier[0]);
  }
  return locals;
}

function componentPropBindings(script: string): string[] {
  const bindings = new Set<string>();
  for (const match of script.matchAll(/defineProps\s*<([\s\S]*?)>\s*\(/g)) {
    for (const property of match[1].matchAll(/(?:^|[,{;])\s*([A-Za-z_$][\w$]*)\s*\??\s*:/g)) bindings.add(property[1]);
  }
  for (const match of script.matchAll(/defineProps\s*\(\s*\{([\s\S]*?)\}\s*\)/g)) {
    for (const property of match[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)) bindings.add(property[1]);
  }
  for (const match of script.matchAll(/const\s*\{([^}]+)\}\s*=\s*defineProps/g)) {
    for (const property of match[1].split(",")) {
      const name = property.trim().split(/\s*:\s*/).at(-1)?.trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) bindings.add(name);
    }
  }
  return [...bindings].sort();
}

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
  /** Component props referenced by repeat expressions; these are component interfaces, not static business data. */
  propBindings: string[];
  /** Imported/computed/store-backed repeat sources that require runtime binding review. */
  runtimeBindings: string[];
  unresolvedReferences: string[];
}

function importedBindings(script: string): Set<string> {
  const bindings = new Set<string>();
  for (const match of script.matchAll(/\bimport\s+([^;\n]+?)\s+from\s+["'][^"']+["']/g)) {
    const clause = match[1].trim();
    const named = clause.match(/\{([^}]+)\}/)?.[1] ?? "";
    for (const item of named.split(",")) {
      const local = item.trim().split(/\s+as\s+/).at(-1)?.trim();
      if (local && /^[A-Za-z_$][\w$]*$/.test(local)) bindings.add(local);
    }
    const defaultName = clause.split(",")[0]?.trim();
    if (defaultName && /^[A-Za-z_$][\w$]*$/.test(defaultName)) bindings.add(defaultName);
  }
  return bindings;
}

function declaredBindings(script: string): Set<string> {
  const bindings = new Set<string>();
  for (const match of script.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) bindings.add(match[1]);
  for (const match of script.matchAll(/\b(?:const|let|var)\s*\{([^}]+)\}\s*=/g)) {
    for (const item of match[1].split(",")) {
      const local = item.trim().split(/\s*:\s*/).at(-1)?.replace(/=.*/, "").trim();
      if (local && /^[A-Za-z_$][\w$]*$/.test(local)) bindings.add(local);
    }
  }
  return bindings;
}

export function analyzeDataCardinality(script: string, templateRepeats: string[]): DataCardinalityResponsibility {
  const staticBindings = extractTopLevelStaticBindings(script);
  const cardinalities: DataCardinalityEvidence[] = Object.entries(staticBindings).flatMap(([name, value]) =>
    collectArrayCardinalities(value, name).map((item) => ({ ...item, source: "module-static-binding" as const })),
  );
  const sliceLimits = [...script.matchAll(/\.slice\s*\(\s*0\s*,\s*(\d+)\s*\)/g)].map((match) => Number(match[1]));
  cardinalities.push(...sliceLimits.map((count, index) => ({ path: `slice[${index}]`, count, source: "slice-limit" as const })));
  cardinalities.push(...templateRepeats.map((repeat, index) => ({ path: `templateRepeat[${index}]:${repeat}`, count: -1, source: "template-repeat" as const })));
  const locals = templateLoopLocals(templateRepeats);
  const roots = templateRepeatRoots(templateRepeats);
  const declaredProps = componentPropBindings(script);
  const propBindings = roots.filter((name) => declaredProps.includes(name)).sort();
  const unresolvedReferences = roots
    .filter((name) => !(name in staticBindings) && !locals.has(name) && !TEMPLATE_LANGUAGE_GLOBALS.has(name) && !propBindings.includes(name));
  const imported = importedBindings(script);
  const declared = declaredBindings(script);
  const runtimeBindings = unresolvedReferences.filter((name) => imported.has(name) || declared.has(name)).sort();
  return { staticBindings, cardinalities, sliceLimits, templateRepeats, propBindings, runtimeBindings, unresolvedReferences: unresolvedReferences.filter((name) => !runtimeBindings.includes(name)).sort() };
}
