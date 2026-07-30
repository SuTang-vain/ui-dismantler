import type { SkillInputBinding } from "./contract.js";
import type { SkillOutputStore } from "./store.js";

function valueAtPath(value: unknown, path: string | undefined): unknown {
  if (!path) return value;
  let current = value;
  for (const segment of path.split(".").filter(Boolean)) {
    if (current === null || typeof current !== "object" || !(segment in current)) throw new Error(`artifact output path not found: ${path}`);
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
    else if (existing === null || typeof existing !== "object" || Array.isArray(existing)) throw new Error(`input binding cannot traverse non-object path: ${path}`);
    current = current[segment] as Record<string, unknown>;
  }
  current[segments.at(-1)!] = value;
}

export function bindSkillInput<Input extends object>(skillId: string, baseInput: Input, bindings: readonly SkillInputBinding[], outputs: SkillOutputStore): Input {
  const bound = structuredClone(baseInput) as Input & Record<string, unknown>;
  for (const binding of bindings.filter((item) => item.consumerSkillId === skillId)) {
    const artifact = outputs.get(binding.artifactContract);
    setAtPath(bound, binding.inputPath, valueAtPath(artifact.value, binding.outputPath));
  }
  return bound;
}
