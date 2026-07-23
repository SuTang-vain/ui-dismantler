import { parse } from "acorn";
import { fullAncestor } from "acorn-walk";

export type GraphGeometryResponsibility = "layout" | "edge-rendering" | "label-placement" | "animation-loop";

export interface GraphGeometrySignals {
  detected: boolean;
  score: number;
  parsed: boolean;
  functionCount: number;
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
  reasons: string[];
}

const LOOP_TYPES = new Set(["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"]);
const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
const TRIGONOMETRY = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "atan2"]);
const DISTANCE_MATH = new Set(["hypot", "sqrt", "abs", "min", "max", "sign"]);

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

function functionName(node: any, ancestors: any[]): string | null {
  if (node.id?.type === "Identifier") return node.id.name;
  const parent = ancestors.at(-2);
  if (parent?.type === "VariableDeclarator" && parent.id?.type === "Identifier") return parent.id.name;
  if (parent?.type === "Property") {
    if (parent.key?.type === "Identifier") return parent.key.name;
    if (parent.key?.type === "Literal" && typeof parent.key.value === "string") return parent.key.value;
  }
  return null;
}

export function analyzeGraphGeometry(script: string): GraphGeometrySignals {
  let parsed = true;
  let ast: any;
  try {
    ast = parse(script, { ecmaVersion: "latest", sourceType: "script", allowHashBang: true });
  } catch {
    try { ast = parse(script, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true }); }
    catch { parsed = false; ast = null; }
  }

  let functionCount = 0;
  let loopCount = 0;
  let maxLoopDepth = 0;
  let svgElementCreations = 0;
  let pathWrites = 0;
  let textMeasurements = 0;
  let coordinateReads = 0;
  let animationFrames = 0;
  let trigonometryCalls = 0;
  let distanceCalls = 0;
  const functions = new Map<string, any>();
  const calledWithin = new Map<string, Set<string>>();

  if (ast) fullAncestor(ast, (node: any, _state: unknown, ancestors: any[]) => {
    if (FUNCTION_TYPES.has(node.type)) {
      functionCount += 1;
      const name = functionName(node, ancestors);
      if (name) functions.set(name, node);
    }
    if (LOOP_TYPES.has(node.type)) {
      loopCount += 1;
      maxLoopDepth = Math.max(maxLoopDepth, ancestors.filter((ancestor) => LOOP_TYPES.has(ancestor.type)).length);
    }
    if (node.type !== "CallExpression") return;
    const method = propertyName(node.callee);
    if (method === "createElementNS") {
      const tag = staticString(node.arguments?.[1]);
      if (!tag || ["svg", "path", "line", "polyline", "rect", "text", "circle", "g"].includes(tag.toLowerCase())) svgElementCreations += 1;
    }
    if (method === "setAttribute" && staticString(node.arguments?.[0]) === "d") pathWrites += 1;
    if (["getComputedTextLength", "getBBox", "measureText"].includes(method ?? "")) textMeasurements += 1;
    if (["getBoundingClientRect", "getScreenCTM", "createSVGPoint"].includes(method ?? "")) coordinateReads += 1;
    if ((node.callee?.type === "Identifier" && node.callee.name === "requestAnimationFrame") || method === "requestAnimationFrame") animationFrames += 1;
    if (node.callee?.type === "MemberExpression" && node.callee.object?.type === "Identifier" && node.callee.object.name === "Math") {
      if (TRIGONOMETRY.has(method ?? "")) trigonometryCalls += 1;
      if (DISTANCE_MATH.has(method ?? "")) distanceCalls += 1;
    }
    if (node.callee?.type === "Identifier") {
      const owner = [...ancestors].reverse().find((ancestor) => FUNCTION_TYPES.has(ancestor.type));
      const ownerName = owner ? functionName(owner, ancestors.slice(0, ancestors.indexOf(owner) + 1)) : null;
      if (ownerName) {
        const calls = calledWithin.get(ownerName) ?? new Set<string>();
        calls.add(node.callee.name);
        calledWithin.set(ownerName, calls);
      }
    }
  });

  const recursiveFunctions = [...functions.keys()].filter((name) => calledWithin.get(name)?.has(name)).length;
  const permutationSearch = recursiveFunctions > 0 && /permut|backtrack|candidateCost|bestCost|排列|回溯/i.test(script);
  const collisionEvidence = (script.match(/collision|overlap|clearance|obstacle|intersect|avoid|避障|碰撞|重叠/gi) ?? []).length;
  const scaledCoordinateSpace = coordinateReads > 0 && /(?:transform\s*:\s*scale|scale\(|viewBox|offsetWidth|devicePixelRatio|logicalWidth|visualWidth|坐标空间|缩放)/i.test(script);
  const responsibilities: GraphGeometryResponsibility[] = [];
  if (permutationSearch || trigonometryCalls >= 2 || maxLoopDepth >= 2 || collisionEvidence >= 2) responsibilities.push("layout");
  if (svgElementCreations > 0 && pathWrites > 0) responsibilities.push("edge-rendering");
  if (textMeasurements > 0 || (svgElementCreations >= 3 && collisionEvidence > 0)) responsibilities.push("label-placement");
  if (animationFrames >= 2 || (animationFrames > 0 && pathWrites > 0)) responsibilities.push("animation-loop");

  const rawScore = responsibilities.length * 0.2
    + Math.min(maxLoopDepth, 3) * 0.08
    + Math.min(recursiveFunctions, 2) * 0.08
    + Math.min(svgElementCreations, 5) * 0.025
    + Math.min(textMeasurements, 2) * 0.05
    + Math.min(animationFrames, 3) * 0.04
    + (scaledCoordinateSpace ? 0.08 : 0);
  const reasons: string[] = [];
  if (permutationSearch) reasons.push("检测到递归排列/回溯布局搜索");
  if (maxLoopDepth >= 2) reasons.push(`检测到 ${maxLoopDepth} 层几何循环`);
  if (trigonometryCalls) reasons.push(`检测到 ${trigonometryCalls} 次三角函数坐标计算`);
  if (collisionEvidence) reasons.push(`检测到 ${collisionEvidence} 处碰撞/避障语义`);
  if (svgElementCreations || pathWrites) reasons.push(`检测到 ${svgElementCreations} 次 SVG 元素创建、${pathWrites} 次路径写入`);
  if (textMeasurements) reasons.push(`检测到 ${textMeasurements} 次 SVG/Canvas 文本测量`);
  if (animationFrames) reasons.push(`检测到 ${animationFrames} 个 requestAnimationFrame 调度点`);
  if (scaledCoordinateSpace) reasons.push("检测到缩放视觉坐标与逻辑坐标换算");

  return {
    detected: responsibilities.length > 0,
    score: Number(Math.min(1, rawScore).toFixed(2)),
    parsed,
    functionCount,
    loopCount,
    maxLoopDepth,
    recursiveFunctions,
    svgElementCreations,
    pathWrites,
    textMeasurements,
    coordinateReads,
    animationFrames,
    trigonometryCalls,
    distanceCalls,
    permutationSearch,
    collisionEvidence,
    scaledCoordinateSpace,
    responsibilities,
    reasons,
  };
}
