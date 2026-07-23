import type { Interaction, InteractionEquivalenceGroup, Manifest, Scenario, ScenarioAssertion, ScenarioDocument, UIStateTransition } from "../types.js";

export function interactionFingerprint(interaction: Interaction): string {
  return interaction.fingerprint || `${interaction.event}|${interaction.trigger}|${interaction.target ?? interaction.action}`;
}

function targetFor(interaction: Interaction): string { return interaction.trigger || "body"; }

function assertionForTransition(transition: UIStateTransition): ScenarioAssertion | null {
  if (!transition.target || transition.target.startsWith("@") || transition.confidence < 0.85) return null;
  if (transition.kind === "class") {
    if (transition.operation === "add" && transition.name) return { target: transition.target, classIncludes: [transition.name] };
    if (transition.operation === "remove" && transition.name) return { target: transition.target, classExcludes: [transition.name] };
    if (transition.operation === "replace" && typeof transition.value === "string") return { target: transition.target, classIncludes: [transition.value], ...(transition.name ? { classExcludes: [transition.name] } : {}) };
  }
  if (transition.kind === "attribute" && transition.name) {
    if (transition.operation === "remove") return { target: transition.target, attributes: { [transition.name]: null } };
    if (transition.operation === "set" && transition.value !== undefined) return { target: transition.target, attributes: { [transition.name]: String(transition.value ?? "") } };
  }
  if (transition.kind === "property") {
    if (transition.name === "hidden" && typeof transition.value === "boolean") return { target: transition.target, visible: !transition.value };
    if (transition.name === "value" && typeof transition.value === "string") return { target: transition.target, value: transition.value };
    if (transition.name === "open" && typeof transition.value === "boolean") return { target: transition.target, attributes: { open: transition.value ? "" : null } };
  }
  if (transition.kind === "focus" && transition.operation === "focus") return { target: transition.target, focused: true };
  if (transition.kind === "style" && transition.name === "display" && typeof transition.value === "string") return { target: transition.target, visible: transition.value !== "none" };
  return null;
}

function repeatedTriggerShape(trigger: string): string | null {
  const shape = trigger
    .replace(/:nth-child\(\s*\d+\s*\)/gi, ":nth-child(*)")
    .replace(/:nth-of-type\(\s*\d+\s*\)/gi, ":nth-of-type(*)");
  return shape === trigger ? null : shape;
}

function transitionSignature(transition: UIStateTransition): string {
  return [transition.target, transition.kind, transition.operation, transition.name ?? "", transition.value === undefined ? "" : JSON.stringify(transition.value)].join("|");
}

export function interactionEquivalenceSignature(interaction: Interaction): string | null {
  const triggerShape = repeatedTriggerShape(interaction.trigger);
  if (!triggerShape || (interaction.dataDependencies?.length ?? 0) > 0) return null;
  const mutationTargets = [...(interaction.mutationTargets ?? [])].sort();
  const transitions = [...(interaction.stateTransitions ?? [])].map(transitionSignature).sort();
  return JSON.stringify({ event: interaction.event, source: interaction.source, action: interaction.action, target: interaction.target ?? "", triggerShape, mutationTargets, transitions });
}

export function groupEquivalentInteractions(interactions: Interaction[]): Array<{ representative: Interaction; members: Interaction[]; group?: InteractionEquivalenceGroup }> {
  const buckets = new Map<string, Interaction[]>();
  const ungrouped: Interaction[] = [];
  for (const interaction of interactions) {
    const signature = interactionEquivalenceSignature(interaction);
    if (!signature) { ungrouped.push(interaction); continue; }
    const bucket = buckets.get(signature) ?? [];
    bucket.push(interaction);
    buckets.set(signature, bucket);
  }
  const result: Array<{ representative: Interaction; members: Interaction[]; group?: InteractionEquivalenceGroup }> = ungrouped.map((interaction) => ({ representative: interaction, members: [interaction] }));
  let groupIndex = 0;
  for (const [signature, members] of buckets) {
    if (members.length < 2) { result.push({ representative: members[0], members }); continue; }
    groupIndex += 1;
    const representative = members[0];
    const triggerShape = repeatedTriggerShape(representative.trigger) as string;
    result.push({
      representative,
      members,
      group: {
        id: `interaction-equivalence-${groupIndex}`,
        signature,
        event: representative.event,
        triggerShape,
        representativeFingerprint: interactionFingerprint(representative),
        memberFingerprints: members.map(interactionFingerprint),
        reason: `相同事件、处理动作、状态转换和 mutation targets，且仅重复实例位置不同：${triggerShape}`,
      },
    });
  }
  return result.sort((left, right) => interactions.indexOf(left.representative) - interactions.indexOf(right.representative));
}

function candidateFor(interaction: Interaction, index: number, group?: InteractionEquivalenceGroup): Scenario {
  const pointerGesture = interaction.event.startsWith("pointer") || interaction.event.startsWith("touch");
  const action = pointerGesture ? "unsupported-pointer" : interaction.event === "input" || interaction.event === "change" ? "input" : ["keydown", "keyup"].includes(interaction.event) ? "key" : "click";
  const step = action === "input"
    ? { action: "input" as const, target: targetFor(interaction), value: "test" }
    : action === "key"
      ? { action: "key" as const, target: targetFor(interaction), key: "Enter" }
      : action === "click"
        ? { action: "click" as const, target: targetFor(interaction) }
        : null;
  const derived = (interaction.stateTransitions ?? []).map(assertionForTransition).filter((item): item is ScenarioAssertion => Boolean(item));
  const assertions = derived.length ? derived.slice(0, 6) : [{ target: targetFor(interaction), visible: true }];
  const notes = derived.length
    ? ["已从 AST 状态转换生成 assertions；仍需人工确认初始状态、动态 selector 与跨组件前置步骤", "确认后移除 candidate 标记再纳入覆盖率门禁"]
    : ["人工确认 selector 是否命中预期控件", "补充证明状态真实发生的 assertions", "确认后移除 candidate 标记再纳入覆盖率门禁"];
  return {
    id: `candidate-${interaction.event}-${index + 1}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
    label: `Candidate: ${action} (${interaction.trigger})`, candidate: true,
    equivalenceGroupId: group?.id,
    covers: group?.memberFingerprints ?? [interactionFingerprint(interaction)],
    notes: pointerGesture
      ? ["pointer 手势需要坐标、位移和阈值，禁止降级为 click；人工补充 pointer action 支持或 coverage waiver"]
      : group
        ? [`严格交互等价组：${group.memberFingerprints.length} 个重复实例共享事件、处理动作和可观察状态转换`, "审核代表实例后可覆盖组内 fingerprints；若实例存在内容语义差异，应拆回独立场景", ...notes]
        : notes,
    steps: step ? [step] : [], assertions,
  };
}

export function generateScenarios(manifest: Manifest): ScenarioDocument {
  if (!Array.isArray(manifest.interactions)) throw new TypeError("manifest.interactions 必须是数组");
  const grouped = groupEquivalentInteractions(manifest.interactions);
  return {
    schemaVersion: "1.0",
    generatedFrom: manifest.meta.source,
    candidatePolicy: "candidate scenarios are excluded from coverage until reviewed; strict repeated-instance equivalence groups require representative review",
    equivalenceGroups: grouped.flatMap((item) => item.group ? [item.group] : []),
    scenarios: grouped.map((item, index) => candidateFor(item.representative, index, item.group)),
  };
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
  if (value.equivalenceGroups !== undefined) {
    if (!Array.isArray(value.equivalenceGroups)) throw new TypeError("equivalenceGroups 必须是数组");
    const groupIds = new Set<string>();
    for (const [index, group] of value.equivalenceGroups.entries()) {
      if (!group || typeof group.id !== "string" || !group.id.trim()) throw new TypeError(`equivalenceGroups[${index}].id 必须是非空字符串`);
      if (groupIds.has(group.id)) throw new TypeError(`equivalenceGroups id 重复: ${group.id}`);
      groupIds.add(group.id);
      if (!Array.isArray(group.memberFingerprints) || group.memberFingerprints.length < 2 || !group.memberFingerprints.every((item) => typeof item === "string" && item.length > 0)) throw new TypeError(`equivalenceGroups[${index}].memberFingerprints 至少包含两个 fingerprint`);
      if (!group.memberFingerprints.includes(group.representativeFingerprint)) throw new TypeError(`equivalenceGroups[${index}] representativeFingerprint 必须属于 memberFingerprints`);
    }
  }
  for (const scenario of value.scenarios) {
    if (!scenario || typeof scenario.id !== "string" || !scenario.id.trim()) throw new TypeError("每个 scenario 必须有非空 id");
    if (seen.has(scenario.id)) throw new TypeError(`场景 id 重复: ${scenario.id}`);
    seen.add(scenario.id);
    if ("critical" in scenario && typeof scenario.critical !== "boolean") throw new TypeError(`场景 ${scenario.id} critical 必须是 boolean`);
    if (scenario.equivalenceGroupId !== undefined && (typeof scenario.equivalenceGroupId !== "string" || !scenario.equivalenceGroupId.trim())) throw new TypeError(`场景 ${scenario.id} equivalenceGroupId 必须是非空字符串`);
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
  const expandEquivalent = (input: Iterable<string>): Set<string> => {
    const expanded = new Set(input);
    for (const group of scenarios.equivalenceGroups ?? []) {
      if (group.memberFingerprints.some((fingerprint) => expanded.has(fingerprint))) {
        for (const fingerprint of group.memberFingerprints) if (declared.has(fingerprint)) expanded.add(fingerprint);
      }
    }
    return expanded;
  };
  const scenarioFingerprints = expandEquivalent(scenarios.scenarios.filter((scenario) => !scenario.candidate).flatMap((scenario) => scenario.covers ?? []));
  const verifiedEquivalentFingerprints = expandEquivalent(verifiedFingerprints);
  const declaredCovered = eligible.filter((item) => scenarioFingerprints.has(item));
  const verifiedCovered = declaredCovered.filter((item) => verifiedEquivalentFingerprints.has(item));
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
