import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AnalyzedView, Interaction, Manifest, UIStateTransition } from "../types.js";

export type InteractionModel = "static" | "click-driven" | "scroll-driven" | "time-driven" | "hover-driven" | "combined";
export type PlanningSeverity = "error" | "warning";

export interface ComponentPlan {
  id: string;
  componentName: string;
  targetFile: string;
  sourceSelector: string;
  sourceSelectors: string[];
  responsibility: string;
  parentId: string | null;
  dependencies: string[];
  interactionModel: InteractionModel;
  interactionFingerprints: string[];
  mutationTargets: string[];
  stateTransitions: UIStateTransition[];
  dataDependencies: string[];
  dataContracts: string[];
  designTokens: string[];
  responsiveQueries: string[];
  acceptance: { text: string[]; states: string[]; viewports: string[] };
  complexity: { estimatedLines: number; score: number; reasons: string[]; budget: number; overBudget: boolean };
}

export interface PlanningIssue {
  severity: PlanningSeverity;
  code: string;
  componentId?: string;
  detail: string;
}

export interface ComponentPlanningReport {
  schemaVersion: "1.0";
  generatedFrom: string;
  generatedAt: string;
  lineBudget: number;
  components: ComponentPlan[];
  issues: PlanningIssue[];
  summary: { components: number; overBudget: number; errors: number; warnings: number; interactions: number; ownedInteractions: number; unownedInteractions: number; ready: boolean };
}

export interface ComponentPlanningOptions { lineBudget?: number }

const DEFAULT_LINE_BUDGET = 150;

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 64) || "component";
}

function pascal(value: string): string {
  const words = value.normalize("NFKD").replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  const name = words.map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join("");
  return /^[A-Za-z_$]/.test(name) ? name : `View${name || "Component"}`;
}

function normalizedTargetSelector(target?: string): string | null {
  if (!target) return null;
  if (/^[#.\[>:]/.test(target)) return target;
  return `#${target}`;
}

function selectorBase(selector: string): string {
  return selector.replace(/:(?:not|is|where|has)\([^)]*\)/g, "").trim();
}

function selectorMatchScore(selector: string | null, viewSelector: string, localSelectors: Set<string>, exact: number, local: number): number {
  if (!selector) return 0;
  if (selector === viewSelector) return exact;
  if (localSelectors.has(selector)) return local;
  const base = selectorBase(selector);
  if (base && [...localSelectors].some((candidate) => selectorBase(candidate) === base)) return Math.max(1, local - 8);
  return 0;
}

function interactionAffinity(interaction: Interaction, view: AnalyzedView): number {
  if (interaction.trigger === "event-listener") return -1;
  const triggers = Array.isArray(view.details.interactionSelectors) ? view.details.interactionSelectors.filter((item): item is string => typeof item === "string") : [];
  const repeated = Array.isArray(view.details.repeatedSelectors) ? view.details.repeatedSelectors.filter((item): item is string => typeof item === "string") : [];
  const selectors = new Set([view.selector, ...triggers, ...repeated]);
  const triggerScore = selectorMatchScore(interaction.trigger, view.selector, selectors, 140, 115);
  const targetScore = selectorMatchScore(normalizedTargetSelector(interaction.target), view.selector, selectors, 105, 70);
  const mutationScores = (interaction.mutationTargets ?? []).map((target) => selectorMatchScore(target, view.selector, selectors, 50, 30));
  const mutationScore = mutationScores.length ? Math.max(...mutationScores) : 0;
  // Handler ownership follows the trigger first; target/mutation evidence only breaks ties when no trigger boundary exists.
  let score = triggerScore > 0 ? triggerScore * 1000 : targetScore * 10 + mutationScore;
  if (score === 0) {
    const dynamicClass = interaction.trigger.match(/^(?:[A-Za-z][\w-]*)?\.([A-Za-z0-9_-]+)/)?.[1];
    const semanticText = `${view.selector} ${view.type} ${view.semanticType} ${JSON.stringify(view.details)}`.toLowerCase();
    if (dynamicClass && semanticText.includes(dynamicClass.toLowerCase())) score += 18;
    else if (interaction.source === "script-assignment" && interaction.mutationTargets?.length && ["graph", "quiz", "carousel-3d"].includes(view.type)) {
      const mutationText = interaction.mutationTargets.join(" ").toLowerCase();
      const typeHints = view.type === "graph" ? /graph|node|center/ : view.type === "quiz" ? /qz|quiz|opt/ : /carousel|slide/;
      if (typeHints.test(`${interaction.trigger} ${mutationText}`.toLowerCase())) score += 12;
    }
  }
  const anchor = view.selector.match(/(?:#|\.)[A-Za-z0-9_-]+/)?.[0];
  if (anchor && score === 0 && (interaction.trigger.includes(anchor) || normalizedTargetSelector(interaction.target)?.includes(anchor))) score += 15;
  if (score > 0 && ["scroll", "scrollend"].includes(interaction.event) && view.type === "scroll-surface") score += 200_000;
  if (score > 0 && (interaction.event.startsWith("pointer") || interaction.event.startsWith("touch") || ["mousedown", "mouseup", "mousemove"].includes(interaction.event)) && view.type === "gesture-surface") score += 200_000;
  return score;
}

function inferInteractionModel(interactions: Interaction[], view: AnalyzedView): InteractionModel {
  if (!interactions.length) return "static";
  const evidence = `${view.type} ${view.semanticType} ${JSON.stringify(view.details)}`.toLowerCase();
  const actions = interactions.map((item) => `${item.event} ${item.action}`).join(" ").toLowerCase();
  const models = new Set<InteractionModel>();
  if (interactions.some((item) => ["click", "change", "input", "keydown"].includes(item.event))) models.add("click-driven");
  if (/scroll|intersectionobserver/.test(actions + evidence)) models.add("scroll-driven");
  if (/setinterval|settimeout|animation|autoplay|carousel/.test(actions + evidence)) models.add("time-driven");
  if (/hover|mouseenter|mouseleave/.test(actions + evidence)) models.add("hover-driven");
  if (models.size > 1) return "combined";
  return [...models][0] ?? "static";
}

function responsibility(view: AnalyzedView): string {
  const label = typeof view.details.text === "string" ? view.details.text.trim() : "";
  return label ? `复现 ${view.type} 视图：${label.slice(0, 100)}` : `复现 ${view.type} 视图的结构、样式与状态`;
}

function acceptanceStates(model: InteractionModel, interactions: Interaction[]): string[] {
  if (model === "static") return ["初始渲染与源页面一致"];
  const states = interactions.flatMap((interaction) => {
    const transitions = interaction.stateTransitions ?? [];
    if (!transitions.length) return [`${interaction.event}: ${interaction.trigger}${interaction.target ? ` → ${interaction.target}` : ""}`];
    return transitions.map((transition) => `${interaction.event}: ${interaction.trigger} → ${transition.target} ${transition.kind}.${transition.operation}${transition.name ? `(${transition.name}${transition.value !== undefined ? `=${String(transition.value)}` : ""})` : ""}`);
  });
  return [...new Set(states)].slice(0, 12);
}

function estimatedComplexity(view: AnalyzedView, interactions: Interaction[], manifest: Manifest, localDataCount = 0): ComponentPlan["complexity"] {
  const localDetails = Object.fromEntries(Object.entries(view.details).filter(([key]) => !["interactionSelectors", "repeatedSelectors"].includes(key)));
  const detailsLength = JSON.stringify(localDetails).length;
  const interactionKinds = new Set(interactions.map((item) => {
    const gestureEvent = item.event.startsWith("pointer") || item.event.startsWith("touch") || ["mousedown", "mouseup", "mousemove"].includes(item.event);
    if (view.type === "gesture-surface" && gestureEvent) return `gesture-lifecycle|${item.trigger}`;
    if (view.type === "scroll-surface" && ["scroll", "scrollend"].includes(item.event)) return `scroll-lifecycle|${item.trigger}`;
    return `${item.event}|${item.action}|${Boolean(item.target)}`;
  })).size;
  const interactionWeight = interactionKinds * 18;
  const dataWeight = Math.min(localDataCount, 8) * 8;
  const tokenWeight = Math.min(manifest.theme.tokens.length, 20);
  const responsiveWeight = Math.min(manifest.responsive.length, 8) * 3;
  const viewWeight = ["graph", "carousel-3d", "cause-chain"].includes(view.type) ? 80 : 45;
  const estimatedLines = Math.max(40, Math.round(viewWeight + detailsLength / 24 + interactionWeight + dataWeight + tokenWeight + responsiveWeight));
  const reasons = [`${interactions.length} 个关联交互（${interactionKinds} 类实现行为）`, `${localDataCount} 个局部数据依赖`, `${manifest.responsive.length} 个响应式查询（复杂度计入前 8 个）`];
  if (["graph", "carousel-3d", "cause-chain"].includes(view.type)) reasons.push(`${view.type} 属于高复杂度视图`);
  return { estimatedLines, score: Number((estimatedLines / DEFAULT_LINE_BUDGET).toFixed(2)), reasons, budget: DEFAULT_LINE_BUDGET, overBudget: false };
}

function fallbackView(manifest: Manifest): AnalyzedView {
  return { id: "page-shell-1", type: "page-shell", structuralType: "content-region", semanticType: "page-shell", confidence: 0.5, evidence: [{ signal: "planning-fallback" }], selector: "body", details: { text: manifest.meta.title || manifest.meta.caseName } };
}

function candidateViews(view: AnalyzedView): AnalyzedView[] {
  return view.componentCandidates ?? [];
}

function expandPlanningViews(views: AnalyzedView[]): AnalyzedView[] {
  const result: AnalyzedView[] = [];
  const selectors = new Set<string>();
  const append = (view: AnalyzedView) => { if (!selectors.has(view.selector)) { selectors.add(view.selector); result.push(view); } };
  const appendTree = (view: AnalyzedView) => {
    append(view);
    for (const candidate of candidateViews(view)) appendTree(candidate);
  };
  for (const view of views) appendTree(view);
  return result;
}

function viewDepth(view: AnalyzedView, views: AnalyzedView[]): number {
  let depth = 0;
  let parentSelector = typeof view.details.parentSelector === "string" ? view.details.parentSelector : "";
  const visited = new Set<string>();
  while (parentSelector && !visited.has(parentSelector)) {
    visited.add(parentSelector);
    const parent = views.find((candidate) => candidate.selector === parentSelector);
    if (!parent) break;
    depth += 1;
    parentSelector = typeof parent.details.parentSelector === "string" ? parent.details.parentSelector : "";
  }
  return depth;
}

export function planComponents(manifest: Manifest, options: ComponentPlanningOptions = {}): ComponentPlanningReport {
  const lineBudget = options.lineBudget ?? DEFAULT_LINE_BUDGET;
  if (!Number.isFinite(lineBudget) || lineBudget < 40) throw new Error("lineBudget 必须是不小于 40 的数字");
  const baseViews = manifest.structure.views.length ? manifest.structure.views : [fallbackView(manifest)];
  const views = expandPlanningViews(baseViews);
  const ids = views.map((view, index) => slug(view.id || `${view.type}-${index + 1}`));
  const depths = views.map((view) => viewDepth(view, views));
  const interactionOwner = new Map<string, number>();
  for (const interaction of manifest.interactions) {
    const owner = views.map((view, index) => ({ index, depth: depths[index], score: interactionAffinity(interaction, view) }))
      .filter((item) => item.score > 0).sort((a, b) => {
        const boundaryFirst = interaction.event.startsWith("pointer") || interaction.event.startsWith("touch")
          || ["scroll", "scrollend", "mousedown", "mouseup", "mousemove", "error"].includes(interaction.event);
        if (boundaryFirst && a.score >= 100_000 && b.score >= 100_000) return b.depth - a.depth || b.score - a.score || a.index - b.index;
        return b.score - a.score || b.depth - a.depth || a.index - b.index;
      })[0]?.index ?? -1;
    if (owner >= 0) interactionOwner.set(interaction.fingerprint, owner);
    else if (views.length === 1) interactionOwner.set(interaction.fingerprint, 0);
  }
  const nameCounts = new Map<string, number>();
  const components = views.map((view, index): ComponentPlan => {
    const interactions = manifest.interactions.filter((item) => interactionOwner.get(item.fingerprint) === index);
    const semanticTypes = ["content-section", "repeated-item", "interactive-slot", "interactive-panel", "component-shell", "app-shell", "content-panel", "story-panel", "relationship-panel", "quiz-panel", "dialog", "graph-filters", "relationship-canvas", "relationship-detail", "quiz-question", "quiz-result", "story-origins", "story-source", "definition-hero", "definition-details", "identity-gallery", "gesture-surface", "works-explorer", "cast-explorer", "graph-surface", "event-controls", "graph-node-control", "cast-card-control", "story-control", "scroll-surface"];
    const preferredName = semanticTypes.includes(view.type) ? view.semanticType : view.type;
    const baseName = pascal(preferredName);
    const occurrence = (nameCounts.get(baseName) ?? 0) + 1;
    nameCounts.set(baseName, occurrence);
    const componentName = occurrence === 1 ? baseName : `${baseName}${occurrence}`;
    const interactionModel = inferInteractionModel(interactions, view);
    const mutationTargets = [...new Set(interactions.flatMap((item) => item.mutationTargets ?? []))];
    const stateTransitions = interactions.flatMap((item) => item.stateTransitions ?? []).filter((item, transitionIndex, items) => items.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === transitionIndex);
    const dataDependencies = [...new Set(interactions.flatMap((item) => item.dataDependencies ?? []))];
    const localContracts = manifest.data.contracts.filter((contract) => dataDependencies.includes(contract.name));
    const complexity = estimatedComplexity(view, interactions, manifest, localContracts.length || dataDependencies.length);
    complexity.budget = lineBudget;
    complexity.score = Number((complexity.estimatedLines / lineBudget).toFixed(2));
    complexity.overBudget = complexity.estimatedLines > lineBudget;
    const parentSelector = typeof view.details.parentSelector === "string" ? view.details.parentSelector : "";
    const parentIndex = parentSelector ? views.findIndex((candidate) => candidate.selector === parentSelector) : -1;
    const parentId = parentIndex >= 0 ? ids[parentIndex] : null;
    return {
      id: ids[index], componentName, targetFile: `src/components/${componentName}.ts`, sourceSelector: view.selector,
      sourceSelectors: Array.isArray(view.details.repeatedSelectors) ? view.details.repeatedSelectors.filter((item): item is string => typeof item === "string") : [view.selector],
      responsibility: responsibility(view), parentId, dependencies: parentId ? [parentId] : [], interactionModel,
      interactionFingerprints: interactions.map((item) => item.fingerprint), mutationTargets, stateTransitions, dataDependencies, dataContracts: localContracts.map((item) => item.name),
      designTokens: manifest.theme.tokens.slice(0, 24).map((item) => item.original), responsiveQueries: manifest.responsive.map((item) => item.query),
      acceptance: { text: typeof view.details.text === "string" && view.details.text.trim() ? [view.details.text.trim().slice(0, 200)] : [], states: acceptanceStates(interactionModel, interactions), viewports: ["desktop", "tablet", "mobile", "tiny"] }, complexity,
    };
  });
  const issues = validateComponentPlans(components);
  const ownedInteractions = new Set(components.flatMap((component) => component.interactionFingerprints));
  const unowned = manifest.interactions.filter((interaction) => interaction.source !== "event-listener" && !ownedInteractions.has(interaction.fingerprint));
  if (unowned.length) issues.push({ severity: "error", code: "unowned-interactions", detail: `${unowned.length} 个 DOM 交互未分配到组件边界：${unowned.slice(0, 4).map((item) => item.fingerprint).join("；")}` });
  return { schemaVersion: "1.0", generatedFrom: manifest.meta.source, generatedAt: new Date().toISOString(), lineBudget, components, issues, summary: { components: components.length, overBudget: components.filter((item) => item.complexity.overBudget).length, errors: issues.filter((item) => item.severity === "error").length, warnings: issues.filter((item) => item.severity === "warning").length, interactions: manifest.interactions.length, ownedInteractions: ownedInteractions.size, unownedInteractions: unowned.length, ready: !issues.some((item) => item.severity === "error") } };
}

export function validateComponentPlans(components: ComponentPlan[]): PlanningIssue[] {
  const issues: PlanningIssue[] = [];
  const names = new Set<string>(); const files = new Set<string>();
  for (const component of components) {
    if (names.has(component.componentName)) issues.push({ severity: "error", code: "duplicate-name", componentId: component.id, detail: `组件名重复：${component.componentName}` });
    if (files.has(component.targetFile)) issues.push({ severity: "error", code: "duplicate-target", componentId: component.id, detail: `目标文件重复：${component.targetFile}` });
    names.add(component.componentName); files.add(component.targetFile);
    if (!component.sourceSelector.trim()) issues.push({ severity: "error", code: "missing-selector", componentId: component.id, detail: "缺少源页面选择器" });
    if (!component.sourceSelectors.length || component.sourceSelectors.some((selector) => !selector.trim())) issues.push({ severity: "error", code: "missing-selector-instances", componentId: component.id, detail: "缺少可审计的源实例选择器" });
    if (!component.responsibility.trim()) issues.push({ severity: "error", code: "missing-responsibility", componentId: component.id, detail: "缺少组件职责" });
    if (!component.acceptance.viewports.length) issues.push({ severity: "error", code: "missing-viewports", componentId: component.id, detail: "缺少多视口验收矩阵" });
    if (!component.acceptance.states.length) issues.push({ severity: "error", code: "missing-states", componentId: component.id, detail: "缺少状态验收条件" });
    if (component.interactionModel !== "static" && !component.interactionFingerprints.length) issues.push({ severity: "error", code: "missing-interaction-evidence", componentId: component.id, detail: `${component.interactionModel} 缺少交互证据` });
    if (component.complexity.overBudget) issues.push({ severity: "error", code: "complexity-budget", componentId: component.id, detail: `预计 ${component.complexity.estimatedLines} 行，超过 ${component.complexity.budget} 行预算；应拆为子组件和 wrapper` });
    else if (component.complexity.score >= 0.8) issues.push({ severity: "warning", code: "complexity-warning", componentId: component.id, detail: `预计复杂度已达预算的 ${Math.round(component.complexity.score * 100)}%` });
    if (!component.acceptance.text.length) issues.push({ severity: "warning", code: "missing-text-baseline", componentId: component.id, detail: "未提取到逐字文本基线，需人工补充" });
  }
  if (!components.length) issues.push({ severity: "error", code: "empty-plan", detail: "未生成任何组件计划" });
  return issues;
}

function renderPlan(plan: ComponentPlan): string {
  const list = (items: string[], empty = "None") => items.length ? items.map((item) => `- ${item}`).join("\n") : empty;
  return `# ${plan.componentName} Specification\n\n## Overview\n- **Target file:** \`${plan.targetFile}\`\n- **Source selector:** \`${plan.sourceSelector}\`\n- **Source instances:** ${plan.sourceSelectors.length}\n- **Interaction model:** ${plan.interactionModel}\n- **Responsibility:** ${plan.responsibility}\n- **Parent:** ${plan.parentId ? `\`${plan.parentId}\`` : "root"}\n- **Dependencies:** ${plan.dependencies.length ? plan.dependencies.map((item) => `\`${item}\``).join(", ") : "None"}\n\n## DOM Structure\n- Preserve the source subtree rooted at \`${plan.sourceSelector}\`.\n${plan.sourceSelectors.length > 1 ? `- Reuse this component for all source instances:\n${list(plan.sourceSelectors.map((item) => `\`${item}\``))}\n` : ""}\n## Computed Styles\n${list(plan.designTokens.map((item) => `Token: \`${item}\``))}\n\n## States & Behaviors\n${list(plan.acceptance.states)}\n\n## Per-State Content\n${list(plan.interactionFingerprints.map((item) => `Covers: \`${item}\``), "N/A (static component)")}\n\n## Mutation Targets\n${list(plan.mutationTargets.map((item) => `Mutates: \`${item}\``), "N/A")}\n\n## State Transitions\n${list(plan.stateTransitions.map((item) => `${item.target}: ${item.kind}.${item.operation}${item.name ? ` \`${item.name}\`${item.value !== undefined ? ` → \`${String(item.value)}\`` : ""}` : ""}`), "N/A")}\n\n## Assets & Data\n${list([...plan.dataDependencies.map((item) => `Data dependency: \`${item}\``), ...plan.dataContracts.map((item) => `Data contract: \`${item}\``)])}\n\n## Text Content (verbatim)\n${list(plan.acceptance.text)}\n\n## Responsive Behavior\n${list(plan.acceptance.viewports.map((item) => `${item}: must pass visual quality matrix`))}\n${plan.responsiveQueries.length ? `\nSource media queries:\n${list(plan.responsiveQueries.map((item) => `\`${item}\``))}\n` : ""}\n## Complexity Budget\n- Estimated lines: ${plan.complexity.estimatedLines}\n- Budget: ${plan.complexity.budget}\n- Status: ${plan.complexity.overBudget ? "SPLIT REQUIRED" : "READY"}\n`;
}

export async function writeComponentPlanningReport(path: string, report: ComponentPlanningReport): Promise<void> { await writeFile(resolve(path), `${JSON.stringify(report, null, 2)}\n`, "utf8"); }
export async function writeComponentSpecs(directory: string, report: ComponentPlanningReport): Promise<void> {
  const target = resolve(directory); await mkdir(target, { recursive: true });
  await Promise.all(report.components.map((component) => writeFile(resolve(target, `${component.id}.spec.md`), renderPlan(component), "utf8")));
}
