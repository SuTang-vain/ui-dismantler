import type { Interaction, Manifest, Scenario, ScenarioDocument } from "../types.js";

export function interactionFingerprint(interaction: Interaction): string {
  return interaction.fingerprint || `${interaction.event}|${interaction.trigger}|${interaction.target ?? interaction.action}`;
}

function targetFor(interaction: Interaction): string { return interaction.trigger || "body"; }

function candidateFor(interaction: Interaction, index: number): Scenario {
  const action = interaction.event === "input" || interaction.event === "change" ? "input" : interaction.event === "keydown" ? "key" : "click";
  const step = action === "input"
    ? { action: "input" as const, target: targetFor(interaction), value: "test" }
    : action === "key"
      ? { action: "key" as const, target: targetFor(interaction), key: "Enter" }
      : { action: "click" as const, target: targetFor(interaction) };
  return {
    id: `candidate-${interaction.event}-${index + 1}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
    label: `Candidate: ${action} (${interaction.trigger})`, candidate: true,
    covers: [interactionFingerprint(interaction)],
    notes: ["人工确认 selector 是否命中预期控件", "补充证明状态真实发生的 assertions", "确认后移除 candidate 标记再纳入覆盖率门禁"],
    steps: [step], assertions: [{ target: targetFor(interaction), visible: true }],
  };
}

export function generateScenarios(manifest: Manifest): ScenarioDocument {
  if (!Array.isArray(manifest.interactions)) throw new TypeError("manifest.interactions 必须是数组");
  return { schemaVersion: "1.0", generatedFrom: manifest.meta.source, candidatePolicy: "candidate scenarios are excluded from coverage until reviewed", scenarios: manifest.interactions.map(candidateFor) };
}

function isTarget(value: unknown, required: boolean): boolean {
  if (value == null) return !required;
  if (typeof value === "string") return value.length > 0;
  if (!value || typeof value !== "object") return false;
  const target = value as Record<string, unknown>;
  return [target.reference, target.library, target.default].some((selector) => typeof selector === "string" && selector.length > 0);
}

export function loadScenarios(document: unknown): ScenarioDocument {
  if (!document || typeof document !== "object") throw new TypeError("scenario document 必须是 object");
  const value = document as Partial<ScenarioDocument>;
  if (value.schemaVersion !== "1.0" || !Array.isArray(value.scenarios) || value.scenarios.length === 0) throw new TypeError("场景文件必须是 schemaVersion=1.0 且包含非空 scenarios 数组");
  const seen = new Set<string>();
  const actions = new Set(["click", "input", "key", "wait"]);
  if (value.coverageWaivers !== undefined) {
    if (!Array.isArray(value.coverageWaivers)) throw new TypeError("coverageWaivers 必须是数组");
    const waiverFingerprints = new Set<string>();
    for (const [index, waiver] of value.coverageWaivers.entries()) {
      if (!waiver || typeof waiver.fingerprint !== "string" || !waiver.fingerprint.trim()) throw new TypeError(`coverageWaivers[${index}].fingerprint 必须是非空字符串`);
      if (typeof waiver.reason !== "string" || !waiver.reason.trim()) throw new TypeError(`coverageWaivers[${index}].reason 必须是非空字符串`);
      if (waiverFingerprints.has(waiver.fingerprint)) throw new TypeError(`coverageWaivers fingerprint 重复: ${waiver.fingerprint}`);
      waiverFingerprints.add(waiver.fingerprint);
    }
  }
  for (const scenario of value.scenarios) {
    if (!scenario || typeof scenario.id !== "string" || !scenario.id.trim()) throw new TypeError("每个 scenario 必须有非空 id");
    if (seen.has(scenario.id)) throw new TypeError(`场景 id 重复: ${scenario.id}`);
    seen.add(scenario.id);
    if ("critical" in scenario && typeof scenario.critical !== "boolean") throw new TypeError(`场景 ${scenario.id} critical 必须是 boolean`);
    if (scenario.viewport) for (const key of ["width", "height"] as const) if (!Number.isInteger(scenario.viewport[key]) || scenario.viewport[key] <= 0) throw new TypeError(`场景 ${scenario.id} viewport.${key} 必须为正整数`);
    if (!Array.isArray(scenario.steps)) throw new TypeError(`场景 ${scenario.id} steps 必须是数组`);
    scenario.steps.forEach((step, index) => {
      if (!step || !actions.has(step.action)) throw new TypeError(`场景 ${scenario.id} steps[${index}] action 不支持`);
      if (["click", "input"].includes(step.action) && !isTarget(step.target, true)) throw new TypeError(`场景 ${scenario.id} steps[${index}] target 无效`);
      if (step.action === "key" && (typeof step.key !== "string" || !step.key)) throw new TypeError(`场景 ${scenario.id} steps[${index}].key 必须是非空字符串`);
      if (step.action === "input" && typeof step.value !== "string") throw new TypeError(`场景 ${scenario.id} steps[${index}].value 必须是字符串`);
      if (step.action === "wait" && (!Number.isInteger(step.ms) || (step.ms ?? -1) < 0 || (step.ms ?? 5001) > 5000)) throw new TypeError(`场景 ${scenario.id} steps[${index}].ms 必须位于 0..5000`);
    });
    if (!Array.isArray(scenario.assertions) || !scenario.assertions.length) throw new TypeError(`场景 ${scenario.id} assertions 必须是非空数组`);
    scenario.assertions.forEach((assertion, index) => {
      if (!assertion || !isTarget(assertion.target, true)) throw new TypeError(`场景 ${scenario.id} assertions[${index}] target 无效`);
      const checks = ["visible", "text", "textContains", "value", "focused", "classIncludes", "classExcludes", "attributes"] as const;
      if (!checks.some((key) => key in assertion)) throw new TypeError(`场景 ${scenario.id} assertions[${index}] 至少需要一个检查项`);
      if ("visible" in assertion && typeof assertion.visible !== "boolean") throw new TypeError(`场景 ${scenario.id} assertions[${index}].visible 必须是 boolean`);
      if ("focused" in assertion && typeof assertion.focused !== "boolean") throw new TypeError(`场景 ${scenario.id} assertions[${index}].focused 必须是 boolean`);
      for (const key of ["text", "textContains", "value"] as const) if (key in assertion && typeof assertion[key] !== "string") throw new TypeError(`场景 ${scenario.id} assertions[${index}].${key} 必须是字符串`);
      for (const key of ["classIncludes", "classExcludes"] as const) if (key in assertion && (!Array.isArray(assertion[key]) || !assertion[key]?.every((item) => typeof item === "string" || isTarget(item, true)))) throw new TypeError(`场景 ${scenario.id} assertions[${index}].${key} 必须是字符串或按 role 分支的 selector 数组`);
    });
  }
  return value as ScenarioDocument;
}

export function computeCoverage(interactions: Interaction[], scenarios: ScenarioDocument, verifiedFingerprints = new Set<string>()) {
  const declared = new Set(interactions.map(interactionFingerprint));
  const waiverReasons = new Map((scenarios.coverageWaivers ?? []).map((waiver) => [waiver.fingerprint, waiver.reason]));
  const waived = [...declared].filter((item) => waiverReasons.has(item));
  const eligible = [...declared].filter((item) => !waiverReasons.has(item));
  const scenarioFingerprints = new Set(scenarios.scenarios.filter((scenario) => !scenario.candidate).flatMap((scenario) => scenario.covers ?? []));
  const declaredCovered = eligible.filter((item) => scenarioFingerprints.has(item));
  const verifiedCovered = declaredCovered.filter((item) => verifiedFingerprints.has(item));
  return {
    totalInteractions: declared.size,
    eligibleInteractions: eligible.length,
    waivedInteractions: waived.length,
    declaredCovered: declaredCovered.length,
    verifiedCovered: verifiedCovered.length,
    declaredRate: eligible.length ? declaredCovered.length / eligible.length : 1,
    verifiedRate: eligible.length ? verifiedCovered.length / eligible.length : 1,
    missing: eligible.filter((item) => !scenarioFingerprints.has(item)),
    waivers: waived.map((fingerprint) => ({ fingerprint, reason: waiverReasons.get(fingerprint) as string })),
  };
}
