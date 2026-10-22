import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RenderResult, RenderTree, RoundtripScore, Scenario, ScenarioDocument } from "../types.js";
import { loadScenarios } from "./scenarios.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RENDERER = resolve(HERE, "../../scripts/_roundtrip_render.mjs");

function runNode(args: string[], cwd: string): Promise<RenderResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [RENDERER, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolvePromise({ ok: false, error: error.message }));
    child.on("close", (code) => {
      if (code !== 0) return resolvePromise({ ok: false, error: `node exit ${code}: ${stderr.slice(0, 400)}` });
      try { resolvePromise(JSON.parse(stdout) as RenderResult); }
      catch { resolvePromise({ ok: false, error: `渲染器输出非 JSON: ${stderr.slice(0, 400)}${stdout.slice(0, 200)}` }); }
    });
  });
}

export async function renderReference(htmlPath: string, options: { width?: number; height?: number; scenarioFile?: string; scenarioId?: string } = {}): Promise<RenderResult> {
  return runNode([resolve(htmlPath), "--ref", "--width", String(options.width ?? 1024), "--height", String(options.height ?? 768), ...scenarioArgs(options)], process.cwd());
}

export async function renderLibrary(libDir: string, options: { width?: number; height?: number; scenarioFile?: string; scenarioId?: string } = {}): Promise<RenderResult> {
  const examples = await (await import("node:fs/promises")).readdir(resolve(libDir, "examples"));
  const example = examples.filter((name) => name.endsWith(".html")).sort()[0];
  if (!example) return { ok: false, error: `${libDir}/examples 下没有 HTML` };
  return runNode([resolve(libDir, "examples", example), "--width", String(options.width ?? 1024), "--height", String(options.height ?? 768), ...scenarioArgs(options)], process.cwd());
}

function scenarioArgs(options: { scenarioFile?: string; scenarioId?: string }): string[] {
  if (!options.scenarioFile && !options.scenarioId) return [];
  if (!options.scenarioFile || !options.scenarioId) throw new Error("scenarioFile 与 scenarioId 必须同时提供");
  return ["--scenario-file", resolve(options.scenarioFile), "--scenario-id", options.scenarioId];
}

function count(tree: RenderTree | undefined): number {
  return tree ? 1 + (tree.children ?? []).reduce((total, child) => total + count(child), 0) : 0;
}

function normalizeClasses(values: string[] = []): Set<string> {
  return new Set(values.map((value) => value.toLowerCase().replace(/^sg-/, "")).filter(Boolean));
}

function suffixTokens(value: string): Set<string> {
  const parts = value.split("-");
  return new Set(parts.map((_, index) => parts.slice(index).join("-")));
}

function classSimilarity(reference: Set<string>, generated: Set<string>): number {
  if (!reference.size && !generated.size) return 0.3;
  if (!reference.size || !generated.size) return 0;
  const exact = [...reference].filter((value) => generated.has(value)).length;
  const union = new Set([...reference, ...generated]).size;
  const referenceSuffixes = new Set([...reference].flatMap((value) => [...suffixTokens(value)]));
  const generatedSuffixes = new Set([...generated].flatMap((value) => [...suffixTokens(value)]));
  const suffixMatches = [...referenceSuffixes].filter((value) => generatedSuffixes.has(value)).length;
  const suffixCredit = Math.min(0.6, (suffixMatches / Math.max(reference.size, generated.size)) * 0.6);
  return Math.min(1, exact / union + suffixCredit);
}

function isContainer(node: RenderTree | undefined): boolean {
  return Boolean(node && ["div", "span", "body"].includes(node.tag) && !(node.classes?.length) && !node.text);
}

function unwrap(node: RenderTree | undefined): RenderTree | undefined {
  let current = node;
  while (isContainer(current)) {
    const children = (current?.children ?? []).filter((child) => child.tag !== "#text");
    if (!children.length) break;
    if (children.length === 1) { current = children[0]; continue; }
    const total = children.reduce((sum, child) => sum + textWeight(child), 0);
    if (!total) break;
    const dominant = [...children].sort((left, right) => textWeight(right) - textWeight(left))[0];
    if (!dominant || textWeight(dominant) / total < 0.6) break;
    current = dominant;
  }
  return current;
}

function textWeight(node: RenderTree | undefined): number {
  if (!node) return 0;
  const own = (node.text ?? "").trim().length;
  return own + (node.children ?? []).reduce((total, child) => total + textWeight(child), 0);
}

const signatures = new WeakMap<RenderTree, string[]>();

function signature(node: RenderTree | undefined, limit = 40): string[] {
  if (!node) return [];
  const cached = signatures.get(node);
  if (cached) return cached;
  const values: string[] = [];
  const own = (node.text ?? "").trim();
  if (own.length >= 6) values.push(own);
  const stack = [...(node.children ?? [])].reverse();
  while (stack.length && values.length < limit) {
    const current = stack.pop() as RenderTree;
    const value = (current.text ?? "").trim();
    if (value.length >= 6) values.push(value);
    for (const child of current.children ?? []) stack.push(child);
  }
  signatures.set(node, values);
  return values;
}

// Class names encode the design system, so a from-scratch semantic rebuild shares none of
// them. When class matching finds nothing, fall back to visible text so structurally
// equivalent sections can still be paired instead of collapsing to zero.
function semanticSimilarity(reference: RenderTree, generated: RenderTree): number {
  const referenceTexts = signature(reference);
  const generatedTexts = signature(generated);
  if (!referenceTexts.length || !generatedTexts.length) return 0;
  let hits = 0;
  for (const value of referenceTexts) {
    if (generatedTexts.includes(value)) hits += 1;
    else if (value.length >= 16 && generatedTexts.some((candidate) => candidate.includes(value) || value.includes(candidate))) hits += 0.5;
  }
  return Math.min(1, hits / referenceTexts.length);
}

function collectTexts(node: RenderTree | undefined, into: string[]): void {
  if (!node) return;
  const value = (node.text ?? "").trim();
  if (value.length >= 6) into.push(value);
  for (const child of node.children ?? []) collectTexts(child, into);
}

// A semantic rebuild can keep every string while nesting it differently. Anchor coverage
// measures that content-level equivalence without rewarding structural mimicry.
function anchorCoverage(referenceRoot: RenderTree | undefined, generatedRoot: RenderTree | undefined): { coverage: number; matched: number; total: number } {
  const referenceTexts: string[] = [];
  const generatedTexts: string[] = [];
  collectTexts(referenceRoot, referenceTexts);
  collectTexts(generatedRoot, generatedTexts);
  const pool = new Map<string, number>();
  for (const value of generatedTexts) pool.set(value, (pool.get(value) ?? 0) + 1);
  let matched = 0;
  for (const value of referenceTexts) {
    const available = pool.get(value) ?? 0;
    if (available > 0) { matched += 1; pool.set(value, available - 1); }
  }
  const coverage = referenceTexts.length ? Number((matched / referenceTexts.length).toFixed(3)) : 1;
  return { coverage, matched, total: referenceTexts.length };
}

function structureScore(ref: RenderResult, got: RenderResult, mode: "mimicry" | "semantic" = "mimicry"): RoundtripScore["structure"] {
  const referenceRoot = unwrap(ref.dom ?? ref.tree);
  const generatedRoot = unwrap(got.dom ?? got.tree);
  const stats = { refNodes: 0, gotNodes: 0, matched: 0, refClasses: 0, classMatched: 0, semanticMatches: 0 };

  function bestMatch(referenceNode: RenderTree, candidates: RenderTree[], used: Set<number>, allowSemantic: boolean): [number, number, "class" | "text" | "none"] {
    const referenceClasses = normalizeClasses(referenceNode.classes);
    let bestIndex = -1, bestScore = 0, bestKind: "class" | "text" | "none" = "none";
    candidates.forEach((candidate, index) => {
      if (used.has(index)) return;
      const score = classSimilarity(referenceClasses, normalizeClasses(candidate.classes));
      if (score > bestScore) { bestIndex = index; bestScore = score; bestKind = "class"; }
    });
    if (bestScore >= 0.2 || !allowSemantic) return [bestIndex, bestScore, bestKind];
    candidates.forEach((candidate, index) => {
      if (used.has(index)) return;
      const similarity = semanticSimilarity(referenceNode, candidate);
      if (similarity < 0.5) return;
      const score = 0.2 + similarity * 0.3;
      if (score > bestScore) { bestIndex = index; bestScore = score; bestKind = "text"; }
    });
    return [bestIndex, bestScore, bestKind];
  }

  function walk(referenceNode: RenderTree | undefined, generatedNode: RenderTree | undefined, semantic = false): void {
    if (!referenceNode) return;
    stats.refNodes += 1;
    if (generatedNode) stats.gotNodes += 1;
    if (!generatedNode) return;
    if (referenceNode.tag === generatedNode.tag) stats.matched += 1;
    else if (semantic) { stats.matched += 0.5; stats.semanticMatches += 1; }
    const referenceClasses = normalizeClasses(referenceNode.classes);
    const generatedClasses = normalizeClasses(generatedNode.classes);
    if (referenceClasses.size || generatedClasses.size) {
      stats.refClasses += 1;
      stats.classMatched += classSimilarity(referenceClasses, generatedClasses);
    }
    const referenceChildren = referenceNode.children ?? [];
    const generatedChildren = generatedNode.children ?? [];
    const used = new Set<number>();
    for (const child of referenceChildren) {
      const [index, score, kind] = bestMatch(child, generatedChildren, used, mode === "semantic");
      if (index >= 0 && score > 0.2) {
        used.add(index);
        walk(child, generatedChildren[index], kind === "text");
      } else {
        stats.refNodes += count(child);
      }
    }
    generatedChildren.forEach((child, index) => { if (!used.has(index)) stats.gotNodes += count(child); });
  }

  walk(referenceRoot, generatedRoot);
  const anchors = anchorCoverage(referenceRoot, generatedRoot);
  const recall = stats.refNodes ? stats.matched / stats.refNodes : 0;
  const precision = stats.gotNodes ? stats.matched / stats.gotNodes : 0;
  const excess = Math.max(0, stats.gotNodes - stats.refNodes * 1.5);
  const redundancyPenalty = stats.gotNodes ? Math.min(0.8, excess / stats.gotNodes) : 0;
  return {
    nodeMatchRate: Number((recall * (1 - redundancyPenalty)).toFixed(3)),
    nodeRecall: Number(recall.toFixed(3)),
    nodePrecision: Number(precision.toFixed(3)),
    redundancyPenalty: Number(redundancyPenalty.toFixed(3)),
    classMatchRate: Number((stats.refClasses ? stats.classMatched / stats.refClasses : 1).toFixed(3)),
    refNodes: stats.refNodes,
    gotNodes: stats.gotNodes,
    matchedNodes: stats.matched,
    semanticMatches: stats.semanticMatches,
    structureMode: mode,
    textAnchors: anchors.total,
    textAnchorMatches: anchors.matched,
    textAnchorCoverage: anchors.coverage,
  };
}

function textScore(ref: RenderResult, got: RenderResult): RoundtripScore["text"] {
  const refSet = new Set(ref.texts ?? []);
  const gotSet = new Set(got.texts ?? []);
  let contain = 0;
  for (const text of refSet) if (!gotSet.has(text) && [...gotSet].some((candidate) => candidate.includes(text))) contain += 1;
  const exact = [...refSet].filter((text) => gotSet.has(text)).length;
  const matched = exact + contain;
  return {
    textMatchRate: Number((refSet.size ? matched / refSet.size : gotSet.size ? 0 : 1).toFixed(3)),
    textPrecision: Number((gotSet.size ? matched / gotSet.size : 0).toFixed(3)),
    exactMatch: exact,
    containMatch: contain,
    refCount: refSet.size,
    gotCount: gotSet.size,
    missing: [...refSet].filter((text) => !gotSet.has(text)).slice(0, 10),
    extra: [...gotSet].filter((text) => !refSet.has(text)).slice(0, 10),
  };
}

export function scoreRoundtrip(reference: RenderResult, generated: RenderResult, options: { structureMode?: "mimicry" | "semantic" } = {}): RoundtripScore {
  const mode = options.structureMode ?? "mimicry";
  const structure = structureScore(reference, generated, mode);
  const text = textScore(reference, generated);
  const structureComposite = mode === "semantic"
    ? structure.textAnchorCoverage
    : Number(((structure.nodeMatchRate + structure.classMatchRate) / 2).toFixed(3));
  const overall = Number(((structureComposite + text.textMatchRate) * 0.5).toFixed(3));
  return {
    structure,
    text,
    classCoverage: generated.classCoverage,
    scores: { structure: structureComposite, text: text.textMatchRate, overall },
    overall,
  };
}

export async function evaluateRoundtrip(htmlPath: string, libDir: string, options: { width?: number; height?: number; structureMode?: "mimicry" | "semantic" } = {}) {
  const reference = await renderReference(htmlPath, options);
  const generated = await renderLibrary(libDir, options);
  return { reference, generated, score: reference.ok && generated.ok ? scoreRoundtrip(reference, generated, { structureMode: options.structureMode }) : null };
}

export async function evaluateScenario(htmlPath: string, libDir: string, scenarioFile: string, scenario: Scenario, options: { width?: number; height?: number; threshold?: number } = {}) {
  const scenarioPath = resolve(scenarioFile);
  const renderOptions = { ...options, width: scenario.viewport?.width ?? options.width, height: scenario.viewport?.height ?? options.height };
  const [reference, generated] = await Promise.all([
    renderReference(htmlPath, { ...renderOptions, scenarioFile: scenarioPath, scenarioId: scenario.id }),
    renderLibrary(libDir, { ...renderOptions, scenarioFile: scenarioPath, scenarioId: scenario.id }),
  ]);
  const score = reference.ok && generated.ok ? scoreRoundtrip(reference, generated) : null;
  const passed = Boolean(score && score.overall >= (options.threshold ?? 0.85) && score.structure.nodeMatchRate >= 0.7 && score.text.textMatchRate >= 0.8);
  return { id: scenario.id, label: scenario.label, reference, generated, score, passed };
}

export async function loadScenarioFile(path: string): Promise<ScenarioDocument> { return loadScenarios(JSON.parse(await readFile(path, "utf8"))); }
