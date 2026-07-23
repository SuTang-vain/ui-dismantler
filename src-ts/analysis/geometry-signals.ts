import { parse } from "acorn";
import { fullAncestor } from "acorn-walk";

export type GraphGeometryResponsibility = "layout" | "edge-rendering" | "label-placement" | "animation-loop";

export interface GraphGeometryCluster {
  responsibility: GraphGeometryResponsibility;
  functionNames: string[];
  sourceLines: number;
  statementCount: number;
  loopCount: number;
  maxLoopDepth: number;
  recursiveFunctions: number;
  svgElementCreations: number;
  pathWrites: number;
  textMeasurements: number;
  coordinateReads: number;
  animationFrames: number;
  trigonometryCalls: number;
  distanceCalls: number;
  collisionEvidence: number;
  scaledCoordinateSpace: boolean;
  anchors: string[];
  reasons: string[];
}

export interface GraphGeometrySignals {
  detected: boolean;
  score: number;
  parsed: boolean;
  functionCount: number;
  statementCount: number;
  sourceLines: number;
  loopCount: number;
  maxLoopDepth: number;
  recursiveFunctions: number;
  svgElementCreations: number;
  pathWrites: number;
  textMeasurements: number;
  coordinateReads: number;
  animationFrames: number;
  trigonometryCalls: number;
  distanceCalls: number;
  permutationSearch: boolean;
  collisionEvidence: number;
  scaledCoordinateSpace: boolean;
  responsibilities: GraphGeometryResponsibility[];
  anchors: string[];
  clusters: GraphGeometryCluster[];
  reasons: string[];
}

interface MutableFunctionMetrics {
  name: string;
  startLine: number;
  endLine: number;
  statementCount: number;
  loopCount: number;
  maxLoopDepth: number;
  svgElementCreations: number;
  pathWrites: number;
  textMeasurements: number;
  coordinateReads: number;
  animationFrames: number;
  trigonometryCalls: number;
  distanceCalls: number;
  collisionEvidence: number;
  scaledCoordinateSpace: boolean;
  recursive: boolean;
  calls: Set<string>;
  anchors: Set<string>;
  source: string;
}

const LOOP_TYPES = new Set(["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"]);
const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
const TRIGONOMETRY = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "atan2"]);
const DISTANCE_MATH = new Set(["hypot", "sqrt", "abs", "min", "max", "sign"]);
const SVG_TAGS = new Set(["svg", "path", "line", "polyline", "rect", "text", "circle", "g"]);
const COLLISION_PATTERN = /collision|overlap|clearance|obstacle|intersect|avoid|避障|碰撞|重叠/gi;
const SCALE_PATTERN = /(?:transform\s*:\s*scale|scale\(|viewBox|offsetWidth|devicePixelRatio|logicalWidth|visualWidth|坐标空间|缩放)/i;
const ANCHOR_PATTERN = /graph|canvas|svg|edge|node|wrap|radar|network|关系|图谱/i;

function propertyName(node: any): string | null {
  if (!node || node.type !== "MemberExpression") return null;
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  if (node.property?.type === "Literal" && typeof node.property.value === "string") return node.property.value;
  return null;
}

function staticString(node: any): string | null {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions?.length === 0) return node.quasis?.[0]?.value?.cooked ?? "";
  return null;
}

function namedFunction(node: any, ancestors: any[]): string {
  if (node.id?.type === "Identifier") return node.id.name;
  const index = ancestors.lastIndexOf(node);
  const parent = index > 0 ? ancestors[index - 1] : null;
  if (parent?.type === "VariableDeclarator" && parent.id?.type === "Identifier") return parent.id.name;
  if (parent?.type === "Property") {
    if (parent.key?.type === "Identifier") return parent.key.name;
    if (parent.key?.type === "Literal" && typeof parent.key.value === "string") return parent.key.value;
  }
  return `<anonymous@${node.start ?? 0}>`;
}

function ownerFunction(ancestors: any[]): any | null {
  for (let index = ancestors.length - 2; index >= 0; index -= 1) {
    if (FUNCTION_TYPES.has(ancestors[index]?.type)) return ancestors[index];
  }
  return null;
}

function normalizeAnchor(value: string): string {
  return value.toLowerCase().replace(/\\[0-9a-f]+\s?/g, "").replace(/[^\p{Letter}\p{Number}#.[\]_-]+/gu, "");
}

function addAnchor(metrics: MutableFunctionMetrics, value: string): void {
  const normalized = normalizeAnchor(value);
  if (normalized && normalized.length <= 80 && !/^(?:data|https?)/.test(normalized) && ANCHOR_PATTERN.test(normalized)) metrics.anchors.add(normalized);
}

function emptyMetrics(name: string, source: string, startLine: number, endLine: number): MutableFunctionMetrics {
  return {
    name, startLine, endLine, statementCount: 0, loopCount: 0, maxLoopDepth: 0,
    svgElementCreations: 0, pathWrites: 0, textMeasurements: 0, coordinateReads: 0,
    animationFrames: 0, trigonometryCalls: 0, distanceCalls: 0, collisionEvidence: 0,
    scaledCoordinateSpace: false, recursive: false, calls: new Set(), anchors: new Set(), source,
  };
}

function mergeIntervals(records: MutableFunctionMetrics[]): number {
  const intervals = records.map((record) => [record.startLine, record.endLine] as const).sort((a, b) => a[0] - b[0]);
  let total = 0; let start = -1; let end = -1;
  for (const [nextStart, nextEnd] of intervals) {
    if (nextStart > end + 1) { if (start >= 0) total += end - start + 1; start = nextStart; end = nextEnd; }
    else end = Math.max(end, nextEnd);
  }
  return start >= 0 ? total + end - start + 1 : 0;
}

function clusterReasons(role: GraphGeometryResponsibility, cluster: Omit<GraphGeometryCluster, "reasons">): string[] {
  const reasons = [`${cluster.functionNames.length} 个函数组成 ${role} 调用簇（源区间约 ${cluster.sourceLines} 行）`];
  if (cluster.recursiveFunctions) reasons.push(`调用簇含 ${cluster.recursiveFunctions} 个递归函数`);
  if (cluster.maxLoopDepth >= 2) reasons.push(`调用簇含 ${cluster.maxLoopDepth} 层嵌套循环`);
  if (cluster.trigonometryCalls) reasons.push(`调用簇含 ${cluster.trigonometryCalls} 次三角函数计算`);
  if (cluster.svgElementCreations || cluster.pathWrites) reasons.push(`调用簇含 ${cluster.svgElementCreations} 次 SVG 创建、${cluster.pathWrites} 次路径写入`);
  if (cluster.textMeasurements) reasons.push(`调用簇含 ${cluster.textMeasurements} 次文本测量`);
  if (cluster.collisionEvidence) reasons.push(`调用簇含 ${cluster.collisionEvidence} 处碰撞/避障语义`);
  if (cluster.animationFrames) reasons.push(`调用簇含 ${cluster.animationFrames} 个动画帧调度点`);
  if (cluster.scaledCoordinateSpace) reasons.push("调用簇处理缩放逻辑/视觉坐标换算");
  return reasons;
}

function buildCluster(role: GraphGeometryResponsibility, records: MutableFunctionMetrics[]): GraphGeometryCluster {
  const selected = [...new Map(records.map((record) => [record.name, record])).values()];
  const base = {
    responsibility: role,
    functionNames: selected.map((record) => record.name).sort(),
    sourceLines: mergeIntervals(selected),
    statementCount: selected.reduce((sum, record) => sum + record.statementCount, 0),
    loopCount: selected.reduce((sum, record) => sum + record.loopCount, 0),
    maxLoopDepth: Math.max(0, ...selected.map((record) => record.maxLoopDepth)),
    recursiveFunctions: selected.filter((record) => record.recursive).length,
    svgElementCreations: selected.reduce((sum, record) => sum + record.svgElementCreations, 0),
    pathWrites: selected.reduce((sum, record) => sum + record.pathWrites, 0),
    textMeasurements: selected.reduce((sum, record) => sum + record.textMeasurements, 0),
    coordinateReads: selected.reduce((sum, record) => sum + record.coordinateReads, 0),
    animationFrames: selected.reduce((sum, record) => sum + record.animationFrames, 0),
    trigonometryCalls: selected.reduce((sum, record) => sum + record.trigonometryCalls, 0),
    distanceCalls: selected.reduce((sum, record) => sum + record.distanceCalls, 0),
    collisionEvidence: selected.reduce((sum, record) => sum + record.collisionEvidence, 0),
    scaledCoordinateSpace: selected.some((record) => record.scaledCoordinateSpace),
    anchors: [...new Set(selected.flatMap((record) => [...record.anchors]))].sort(),
  };
  return { ...base, reasons: clusterReasons(role, base) };
}

function roleRecords(role: GraphGeometryResponsibility, records: MutableFunctionMetrics[]): MutableFunctionMetrics[] {
  const selected = records.filter((record) => {
    const name = record.name.toLowerCase();
    if (role === "layout") return record.recursive || record.trigonometryCalls > 0 || /layout|order|position|measure|clamp|collision|overlap|separat|arrang|permut/.test(name);
    if (role === "edge-rendering") return record.svgElementCreations > 0 || record.pathWrites > 0 || /render.*edge|build.*graph|create.*edge/.test(name);
    if (role === "label-placement") return record.textMeasurements > 0 || record.collisionEvidence > 0 && /label|clearance|edge|place/.test(name);
    return record.animationFrames > 0 && /sync|physics|animat|frame/.test(name);
  });
  const selectedNames = new Set(selected.map((record) => record.name));
  for (const record of records) {
    if (selectedNames.has(record.name)) continue;
    const sourceLines = record.endLine - record.startLine + 1;
    if (selected.some((root) => root.calls.has(record.name)) && record.statementCount <= 20 && sourceLines <= 40) selected.push(record);
  }
  return selected;
}

export function geometrySignalsForRole(signals: GraphGeometrySignals, role: GraphGeometryResponsibility): GraphGeometrySignals {
  const cluster = signals.clusters.find((candidate) => candidate.responsibility === role);
  if (!cluster) return signals;
  return {
    ...signals,
    ...cluster,
    detected: true,
    score: Math.max(0.8, Math.min(1, cluster.sourceLines / 150 + 0.35)),
    functionCount: cluster.functionNames.length,
    sourceLines: cluster.sourceLines,
    permutationSearch: role === "layout" && cluster.recursiveFunctions > 0,
    responsibilities: [role],
    anchors: cluster.anchors.length ? cluster.anchors : signals.anchors,
    clusters: [],
    reasons: cluster.reasons,
  };
}

export function geometrySignalsMatchRegion(signals: GraphGeometrySignals, elements: Array<Element | null>, graphCount: number): boolean {
  if (!signals.detected) return false;
  if (graphCount <= 1) return true;
  const regionAnchors = new Set<string>();
  for (const element of elements) {
    if (!element) continue;
    if (element.id) regionAnchors.add(normalizeAnchor(`#${element.id}`));
    regionAnchors.add(normalizeAnchor(element.tagName.toLowerCase()));
    for (const className of element.classList) regionAnchors.add(normalizeAnchor(`.${className}`));
  }
  if (!signals.anchors.length) return false;
  const generic = new Set(["svg", "graph", "canvas", "node", "edge", "graphwrap", "graphcanvas", "radar", "network"]);
  const specific = signals.anchors.filter((anchor) => !generic.has(anchor.replace(/^[#.]/, "")));
  const candidates = specific.length ? specific : signals.anchors;
  return candidates.some((anchor) => {
    if (regionAnchors.has(anchor)) return true;
    const bare = anchor.replace(/^[#.]/, "");
    return [...regionAnchors].some((candidate) => candidate.replace(/^[#.]/, "") === bare);
  });
}

export function analyzeGraphGeometry(script: string): GraphGeometrySignals {
  let parsed = true; let ast: any;
  try { ast = parse(script, { ecmaVersion: "latest", sourceType: "script", allowHashBang: true, locations: true }); }
  catch {
    try { ast = parse(script, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true, locations: true }); }
    catch { parsed = false; ast = null; }
  }
  const records = new Map<string, MutableFunctionMetrics>();
  const top = emptyMetrics("<top-level>", script, 1, Math.max(1, script.split("\n").length)); records.set(top.name, top);
  const functionNames = new Map<any, string>();
  if (ast) fullAncestor(ast, (node: any, _state: unknown, ancestors: any[]) => {
    if (FUNCTION_TYPES.has(node.type)) {
      const name = namedFunction(node, ancestors); functionNames.set(node, name);
      const source = script.slice(node.start ?? 0, node.end ?? 0);
      const existing = records.get(name);
      const record = existing ?? emptyMetrics(name, source, node.loc?.start.line ?? 1, node.loc?.end.line ?? 1);
      record.startLine = node.loc?.start.line ?? record.startLine; record.endLine = node.loc?.end.line ?? record.endLine; record.source = source;
      record.collisionEvidence = Math.max(record.collisionEvidence, (source.match(COLLISION_PATTERN) ?? []).length);
      record.scaledCoordinateSpace ||= SCALE_PATTERN.test(source);
      records.set(name, record);
    }
    const owner = ownerFunction(ancestors); const ownerName = owner ? functionNames.get(owner) ?? namedFunction(owner, ancestors) : top.name;
    let record = records.get(ownerName);
    if (!record && owner) {
      const source = script.slice(owner.start ?? 0, owner.end ?? 0);
      record = emptyMetrics(ownerName, source, owner.loc?.start.line ?? 1, owner.loc?.end.line ?? 1);
      record.collisionEvidence = (source.match(COLLISION_PATTERN) ?? []).length; record.scaledCoordinateSpace = SCALE_PATTERN.test(source); records.set(ownerName, record);
    }
    record ??= top;
    if (/Statement$|Declaration$/.test(node.type) && node !== owner) record.statementCount += 1;
    if (LOOP_TYPES.has(node.type)) {
      record.loopCount += 1;
      const ownerIndex = owner ? ancestors.lastIndexOf(owner) : -1;
      const depth = ancestors.slice(ownerIndex + 1).filter((ancestor) => LOOP_TYPES.has(ancestor.type)).length;
      record.maxLoopDepth = Math.max(record.maxLoopDepth, depth || 1);
    }
    if (node.type === "Identifier" && ANCHOR_PATTERN.test(node.name)) addAnchor(record, node.name);
    const literal = staticString(node); if (literal) addAnchor(record, literal);
    if (node.type !== "CallExpression") return;
    const method = propertyName(node.callee);
    if (method === "createElementNS") {
      const tag = staticString(node.arguments?.[1]); if (!tag || SVG_TAGS.has(tag.toLowerCase())) record.svgElementCreations += 1;
    }
    if (method === "setAttribute" && staticString(node.arguments?.[0]) === "d") record.pathWrites += 1;
    if (["getComputedTextLength", "getBBox", "measureText"].includes(method ?? "")) record.textMeasurements += 1;
    if (["getBoundingClientRect", "getScreenCTM", "createSVGPoint"].includes(method ?? "")) record.coordinateReads += 1;
    if ((node.callee?.type === "Identifier" && node.callee.name === "requestAnimationFrame") || method === "requestAnimationFrame") record.animationFrames += 1;
    if (node.callee?.type === "MemberExpression" && node.callee.object?.type === "Identifier" && node.callee.object.name === "Math") {
      if (TRIGONOMETRY.has(method ?? "")) record.trigonometryCalls += 1;
      if (DISTANCE_MATH.has(method ?? "")) record.distanceCalls += 1;
    }
    if (node.callee?.type === "Identifier") record.calls.add(node.callee.name);
  });

  for (const record of records.values()) record.recursive = record.calls.has(record.name);
  const functionRecords = [...records.values()].filter((record) => record.name !== top.name);
  const metricRecords = [top, ...functionRecords];
  const aggregate = <K extends keyof MutableFunctionMetrics>(key: K): number => metricRecords.reduce((sum, record) => sum + (typeof record[key] === "number" ? record[key] as number : 0), 0);
  const recursiveFunctions = functionRecords.filter((record) => record.recursive).length;
  const loopCount = aggregate("loopCount"); const maxLoopDepth = Math.max(0, ...metricRecords.map((record) => record.maxLoopDepth));
  const svgElementCreations = aggregate("svgElementCreations"); const pathWrites = aggregate("pathWrites");
  const textMeasurements = aggregate("textMeasurements"); const coordinateReads = aggregate("coordinateReads");
  const animationFrames = aggregate("animationFrames"); const trigonometryCalls = aggregate("trigonometryCalls");
  const distanceCalls = aggregate("distanceCalls"); const collisionEvidence = (script.match(COLLISION_PATTERN) ?? []).length;
  const permutationSearch = recursiveFunctions > 0 && /permut|backtrack|candidateCost|bestCost|排列|回溯/i.test(script);
  const scaledCoordinateSpace = coordinateReads > 0 && SCALE_PATTERN.test(script);
  const responsibilities: GraphGeometryResponsibility[] = [];
  if (permutationSearch || trigonometryCalls >= 2 || maxLoopDepth >= 2 || collisionEvidence >= 2) responsibilities.push("layout");
  if (svgElementCreations > 0 && pathWrites > 0) responsibilities.push("edge-rendering");
  if (textMeasurements > 0 || svgElementCreations >= 3 && collisionEvidence > 0) responsibilities.push("label-placement");
  if (animationFrames >= 2 || animationFrames > 0 && pathWrites > 0) responsibilities.push("animation-loop");
  const clusters = responsibilities.map((role) => buildCluster(role, roleRecords(role, metricRecords)));
  const anchors = [...new Set([...top.anchors, ...functionRecords.flatMap((record) => [...record.anchors])])].sort();
  const reasons = clusters.flatMap((cluster) => cluster.reasons).filter((reason, index, items) => items.indexOf(reason) === index);
  const rawScore = responsibilities.length * 0.2 + Math.min(maxLoopDepth, 3) * 0.08 + Math.min(recursiveFunctions, 2) * 0.08
    + Math.min(svgElementCreations, 5) * 0.025 + Math.min(textMeasurements, 2) * 0.05 + Math.min(animationFrames, 3) * 0.04 + (scaledCoordinateSpace ? 0.08 : 0);
  return {
    detected: responsibilities.length > 0, score: Number(Math.min(1, rawScore).toFixed(2)), parsed,
    functionCount: functionRecords.length, statementCount: aggregate("statementCount"), sourceLines: mergeIntervals(functionRecords),
    loopCount, maxLoopDepth, recursiveFunctions, svgElementCreations, pathWrites, textMeasurements, coordinateReads,
    animationFrames, trigonometryCalls, distanceCalls, permutationSearch, collisionEvidence, scaledCoordinateSpace,
    responsibilities, anchors, clusters, reasons,
  };
}
