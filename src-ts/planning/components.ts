import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AnalyzedView, Interaction, Manifest } from "../types.js";

export type InteractionModel = "static" | "click-driven" | "scroll-driven" | "time-driven" | "hover-driven" | "combined";
export type PlanningSeverity = "error" | "warning";

export interface ComponentPlan {
  id: string;
  componentName: string;
  targetFile: string;
  sourceSelector: string;
  responsibility: string;
  interactionModel: InteractionModel;
  interactionFingerprints: string[];
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
  summary: { components: number; overBudget: number; errors: number; warnings: number; ready: boolean };
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

function selectorAffinity(interaction: Interaction, selector: string): boolean {
  if (interaction.trigger === "event-listener") return false;
  if (interaction.trigger === selector) return true;
  const anchor = selector.match(/(?:#|\.)[A-Za-z0-9_-]+/)?.[0];
  return Boolean(anchor && (interaction.trigger.includes(anchor) || interaction.target?.includes(anchor.slice(1))));
}

function inferInteractionModel(interactions: Interaction[], view: AnalyzedView): InteractionModel {
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
  const states = interactions.slice(0, 8).map((item) => `${item.event}: ${item.trigger}${item.target ? ` → ${item.target}` : ""}`);
  return states.length ? states : ["记录并验证所有可观察交互状态"];
}

function estimatedComplexity(view: AnalyzedView, interactions: Interaction[], manifest: Manifest): ComponentPlan["complexity"] {
  const detailsLength = JSON.stringify(view.details).length;
  const interactionWeight = interactions.length * 18;
  const dataWeight = manifest.data.contracts.length * 8;
  const tokenWeight = Math.min(manifest.theme.tokens.length, 20) * 2;
  const responsiveWeight = manifest.responsive.length * 8;
  const viewWeight = ["graph", "carousel-3d", "cause-chain"].includes(view.type) ? 80 : 45;
  const estimatedLines = Math.max(40, Math.round(viewWeight + detailsLength / 24 + interactionWeight + dataWeight + tokenWeight + responsiveWeight));
  const reasons = [`${interactions.length} 个关联交互`, `${manifest.data.contracts.length} 个数据契约`, `${manifest.responsive.length} 个响应式查询`];
  if (["graph", "carousel-3d", "cause-chain"].includes(view.type)) reasons.push(`${view.type} 属于高复杂度视图`);
  return { estimatedLines, score: Number((estimatedLines / DEFAULT_LINE_BUDGET).toFixed(2)), reasons, budget: DEFAULT_LINE_BUDGET, overBudget: false };
}

function fallbackView(manifest: Manifest): AnalyzedView {
  return { id: "page-shell-1", type: "page-shell", structuralType: "content-region", semanticType: "page-shell", confidence: 0.5, evidence: [{ signal: "planning-fallback" }], selector: "body", details: { text: manifest.meta.title || manifest.meta.caseName } };
}

export function planComponents(manifest: Manifest, options: ComponentPlanningOptions = {}): ComponentPlanningReport {
  const lineBudget = options.lineBudget ?? DEFAULT_LINE_BUDGET;
  if (!Number.isFinite(lineBudget) || lineBudget < 40) throw new Error("lineBudget 必须是不小于 40 的数字");
  const views = manifest.structure.views.length ? manifest.structure.views : [fallbackView(manifest)];
  const components = views.map((view, index): ComponentPlan => {
    const interactions = manifest.interactions.filter((item) => selectorAffinity(item, view.selector));
    const effectiveInteractions = interactions.length ? interactions : views.length === 1 ? manifest.interactions : [];
    const componentName = pascal(`${view.type}-${index + 1}`);
    const interactionModel = inferInteractionModel(effectiveInteractions, view);
    const complexity = estimatedComplexity(view, effectiveInteractions, manifest);
    complexity.budget = lineBudget;
    complexity.score = Number((complexity.estimatedLines / lineBudget).toFixed(2));
    complexity.overBudget = complexity.estimatedLines > lineBudget;
    return {
      id: slug(view.id || componentName), componentName, targetFile: `src/components/${componentName}.ts`, sourceSelector: view.selector,
      responsibility: responsibility(view), interactionModel, interactionFingerprints: effectiveInteractions.map((item) => item.fingerprint),
      dataContracts: manifest.data.contracts.map((item) => item.name), designTokens: manifest.theme.tokens.slice(0, 24).map((item) => item.original), responsiveQueries: manifest.responsive.map((item) => item.query),
      acceptance: { text: typeof view.details.text === "string" && view.details.text.trim() ? [view.details.text.trim().slice(0, 200)] : [], states: acceptanceStates(interactionModel, effectiveInteractions), viewports: ["desktop", "tablet", "mobile", "tiny"] }, complexity,
    };
  });
  const issues = validateComponentPlans(components);
  return { schemaVersion: "1.0", generatedFrom: manifest.meta.source, generatedAt: new Date().toISOString(), lineBudget, components, issues, summary: { components: components.length, overBudget: components.filter((item) => item.complexity.overBudget).length, errors: issues.filter((item) => item.severity === "error").length, warnings: issues.filter((item) => item.severity === "warning").length, ready: !issues.some((item) => item.severity === "error") } };
}

export function validateComponentPlans(components: ComponentPlan[]): PlanningIssue[] {
  const issues: PlanningIssue[] = [];
  const names = new Set<string>(); const files = new Set<string>();
  for (const component of components) {
    if (names.has(component.componentName)) issues.push({ severity: "error", code: "duplicate-name", componentId: component.id, detail: `组件名重复：${component.componentName}` });
    if (files.has(component.targetFile)) issues.push({ severity: "error", code: "duplicate-target", componentId: component.id, detail: `目标文件重复：${component.targetFile}` });
    names.add(component.componentName); files.add(component.targetFile);
    if (!component.sourceSelector.trim()) issues.push({ severity: "error", code: "missing-selector", componentId: component.id, detail: "缺少源页面选择器" });
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
  return `# ${plan.componentName} Specification\n\n## Overview\n- **Target file:** \`${plan.targetFile}\`\n- **Source selector:** \`${plan.sourceSelector}\`\n- **Interaction model:** ${plan.interactionModel}\n- **Responsibility:** ${plan.responsibility}\n\n## DOM Structure\n- Preserve the source subtree rooted at \`${plan.sourceSelector}\`.\n\n## Computed Styles\n${list(plan.designTokens.map((item) => `Token: \`${item}\``))}\n\n## States & Behaviors\n${list(plan.acceptance.states)}\n\n## Per-State Content\n${list(plan.interactionFingerprints.map((item) => `Covers: \`${item}\``), "N/A (static component)")}\n\n## Assets & Data\n${list(plan.dataContracts.map((item) => `Data contract: \`${item}\``))}\n\n## Text Content (verbatim)\n${list(plan.acceptance.text)}\n\n## Responsive Behavior\n${list(plan.acceptance.viewports.map((item) => `${item}: must pass visual quality matrix`))}\n${plan.responsiveQueries.length ? `\nSource media queries:\n${list(plan.responsiveQueries.map((item) => `\`${item}\``))}\n` : ""}\n## Complexity Budget\n- Estimated lines: ${plan.complexity.estimatedLines}\n- Budget: ${plan.complexity.budget}\n- Status: ${plan.complexity.overBudget ? "SPLIT REQUIRED" : "READY"}\n`;
}

export async function writeComponentPlanningReport(path: string, report: ComponentPlanningReport): Promise<void> { await writeFile(resolve(path), `${JSON.stringify(report, null, 2)}\n`, "utf8"); }
export async function writeComponentSpecs(directory: string, report: ComponentPlanningReport): Promise<void> {
  const target = resolve(directory); await mkdir(target, { recursive: true });
  await Promise.all(report.components.map((component) => writeFile(resolve(target, `${component.id}.spec.md`), renderPlan(component), "utf8")));
}
