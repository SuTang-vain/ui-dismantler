import { createRequire } from "node:module";
import type { VisualTargetOwnerPlan } from "./visual-target-plan.js";

interface CssTreeNode {
  type: string;
  name?: string;
  prelude?: CssTreeNode;
  loc?: { start: { offset: number }; end: { offset: number } };
  children?: { forEach(callback: (node: CssTreeNode) => void): void };
}

interface CssTreeApi {
  parse(source: string, options?: { context?: string; positions?: boolean }): CssTreeNode;
  generate(node: CssTreeNode): string;
  walk(root: CssTreeNode, visitor: { enter(node: CssTreeNode): void; leave(node: CssTreeNode): void }): void;
}

const require = createRequire(import.meta.url);
const cssTree = require("css-tree") as CssTreeApi;

export interface MaterializedOwnerStyleSheet {
  index: number;
  sourceScoped: boolean;
  compileStatus: "compiled" | "raw-css" | "failed";
  materialized: boolean;
  ruleCount: number;
  selectorCount: number;
  keyframeRuleCount: number;
  error?: string;
}

export interface OwnerSourceStyleMaterialization {
  css: string;
  styleSheets: MaterializedOwnerStyleSheet[];
  metrics: {
    styleSheetsAvailable: number;
    styleSheetsMaterialized: number;
    styleSheetsFailed: number;
    rulesMaterialized: number;
    selectorsMaterialized: number;
    keyframeRulesPreserved: number;
  };
  reviewReasons: string[];
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function unwrapFunctionalPseudo(selector: string, name: "deep" | "global" | "slotted"): string {
  const pattern = new RegExp(`:${name}\\(([^()]*)\\)`, "g");
  return selector.replace(pattern, "$1");
}

function scopeSelector(selector: string, ownerSelector: string): string {
  const entireGlobal = selector.trim().match(/^:global\((.+)\)$/);
  if (entireGlobal) return entireGlobal[1].trim();
  let normalized = selector.trim()
    .replace(/::v-deep\s*/g, " ")
    .replace(/\s*(?:>>>|\/deep\/)\s*/g, " ");
  normalized = unwrapFunctionalPseudo(normalized, "deep");
  normalized = unwrapFunctionalPseudo(normalized, "global");
  normalized = unwrapFunctionalPseudo(normalized, "slotted");
  normalized = normalized.replace(/\s+/g, " ").trim();
  if (!normalized) return ownerSelector;
  if (normalized.startsWith(ownerSelector)) return normalized;
  if (/^:scope\b/.test(normalized)) return normalized.replace(/^:scope\b/, ownerSelector);
  if (/^(?::root|html|body|#app)(?=$|[\s>+~.#[:])/.test(normalized)) {
    return normalized.replace(/^(?::root|html|body|#app)/, ownerSelector);
  }
  return `${ownerSelector} ${normalized}`;
}

function materializeSheet(ownerSelector: string, sheet: VisualTargetOwnerPlan["sourceStyleSheets"][number]): { css: string; report: MaterializedOwnerStyleSheet } {
  if (!sheet.compiledCss || sheet.compileStatus === "failed") {
    return {
      css: "",
      report: {
        index: sheet.index,
        sourceScoped: sheet.scoped,
        compileStatus: sheet.compileStatus,
        materialized: false,
        ruleCount: 0,
        selectorCount: 0,
        keyframeRuleCount: 0,
        error: sheet.compileStatus === "failed" ? "source stylesheet compilation failed" : "compiled CSS is absent",
      },
    };
  }
  try {
    const ast = cssTree.parse(sheet.compiledCss, { positions: true });
    const replacements: Array<{ start: number; end: number; value: string }> = [];
    let keyframeDepth = 0;
    let ruleCount = 0;
    let selectorCount = 0;
    let keyframeRuleCount = 0;
    cssTree.walk(ast, {
      enter(node) {
        if (node.type === "Atrule" && /(?:^|-)keyframes$/i.test(node.name ?? "")) keyframeDepth += 1;
        if (node.type !== "Rule" || node.prelude?.type !== "SelectorList") return;
        if (keyframeDepth > 0) { keyframeRuleCount += 1; return; }
        const selectors: string[] = [];
        node.prelude.children?.forEach((child) => selectors.push(cssTree.generate(child)));
        if (selectors.length === 0 || !node.prelude.loc) return;
        const value = selectors.map((selector) => scopeSelector(selector, ownerSelector)).join(",");
        cssTree.parse(value, { context: "selectorList" });
        replacements.push({ start: node.prelude.loc.start.offset, end: node.prelude.loc.end.offset, value });
        ruleCount += 1;
        selectorCount += selectors.length;
      },
      leave(node) {
        if (node.type === "Atrule" && /(?:^|-)keyframes$/i.test(node.name ?? "")) keyframeDepth -= 1;
      },
    });
    const css = replacements.sort((left, right) => right.start - left.start).reduce((value, replacement) => `${value.slice(0, replacement.start)}${replacement.value}${value.slice(replacement.end)}`, sheet.compiledCss);
    return {
      css,
      report: {
        index: sheet.index,
        sourceScoped: sheet.scoped,
        compileStatus: sheet.compileStatus,
        materialized: true,
        ruleCount,
        selectorCount,
        keyframeRuleCount,
      },
    };
  } catch (error) {
    return {
      css: "",
      report: {
        index: sheet.index,
        sourceScoped: sheet.scoped,
        compileStatus: sheet.compileStatus,
        materialized: false,
        ruleCount: 0,
        selectorCount: 0,
        keyframeRuleCount: 0,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function materializeOwnerSourceStyles(owner: Pick<VisualTargetOwnerPlan, "id" | "sourceStyleSheets">): OwnerSourceStyleMaterialization {
  const ownerSelector = `[data-visual-owner="${escapeAttributeValue(owner.id)}"]`;
  const materialized = owner.sourceStyleSheets.map((sheet) => materializeSheet(ownerSelector, sheet));
  const styleSheets = materialized.map((item) => item.report);
  const failed = styleSheets.filter((sheet) => !sheet.materialized);
  return {
    css: materialized.map((item) => item.css).filter(Boolean).join("\n"),
    styleSheets,
    metrics: {
      styleSheetsAvailable: styleSheets.length,
      styleSheetsMaterialized: styleSheets.length - failed.length,
      styleSheetsFailed: failed.length,
      rulesMaterialized: styleSheets.reduce((sum, sheet) => sum + sheet.ruleCount, 0),
      selectorsMaterialized: styleSheets.reduce((sum, sheet) => sum + sheet.selectorCount, 0),
      keyframeRulesPreserved: styleSheets.reduce((sum, sheet) => sum + sheet.keyframeRuleCount, 0),
    },
    reviewReasons: failed.map((sheet) => `source stylesheet ${sheet.index} was not materialized: ${sheet.error ?? "unknown error"}`),
  };
}
