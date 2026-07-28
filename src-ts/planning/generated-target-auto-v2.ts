import type { SpaRouteShellPlan, SpaRouteShellRouteNode } from "./spa-route-shell.js";
import type { VisualTargetPlan, VisualTargetOwnerPlan } from "./visual-target-plan.js";
import type { RouterSfcResponsibilityGraph } from "./router-sfc-responsibility.js";
import { compilePrimitiveDom, materializeElementUiPrimitiveCss, materializePrimitiveCss, type PrimitiveDomCompilation, type PrimitiveDomNode } from "./primitive-dom-compiler.js";

export interface AutoV2GeneratedFile {
  path: string;
  content: string;
  lines: number;
}

export interface AutoV2SourceBundle {
  routePlan: SpaRouteShellPlan;
  visualPlan: VisualTargetPlan;
  routerSfc: RouterSfcResponsibilityGraph;
  sfcVisual?: { metrics?: Record<string, unknown>; apiFixtures?: { metrics?: Record<string, unknown> } };
  apiFixture?: { metrics?: Record<string, unknown> };
  spaAuth?: { metrics?: Record<string, unknown>; contracts?: unknown };
  transportProxy?: { metrics?: Record<string, unknown> };
}

export interface AutoV2QualitySummary {
  available: boolean;
  passed: boolean | null;
  navigationIntegrity: number | null;
  computedStyle: number | null;
  pixelDiff: number | null;
  runtimeErrors: number | null;
  requiredNetworkFailures: number | null;
  stabilityFailures: number | null;
  blockingHandlesAfterClose: number | null;
}

export interface AutoV2QualityComparison {
  comparable: boolean;
  routeComparable: boolean;
  manual: AutoV2QualitySummary;
  generated: AutoV2QualitySummary;
  generatedMinusManual: {
    computedStyle: number | null;
    pixelDiff: number | null;
    navigationIntegrity: number | null;
  };
  detail: string;
}

export interface GeneratedTargetAutoV2Artifact {
  schemaVersion: "1.0";
  kind: "generated-target-auto-v2";
  reviewRequired: true;
  fullGeneratedApplication: false;
  generatedVisualDom: true;
  source: {
    routerSfcGraphKind: RouterSfcResponsibilityGraph["kind"];
    routeBindings: number;
    resolvedRoutes: number;
    visualBoundaries: number;
    visualOwners: number;
    sfcVisualMetrics: Record<string, unknown> | null;
    apiFixtureMetrics: Record<string, unknown> | null;
    spaAuthMetrics: Record<string, unknown> | null;
    transportProxyMetrics: Record<string, unknown> | null;
  };
  files: AutoV2GeneratedFile[];
  metrics: {
    generatedFiles: number;
    generatedLines: number;
    generatedBytes: number;
    routeEntries: number;
    visualBoundaries: number;
    visualOwners: number;
    compiledOwnerRoots: number;
    generatedVisualNodes: number;
    generatedInteractionBindings: number;
    modelCalls: 0;
    manualEdits: 0;
    manualEditedLines: 0;
    repairIterations: 0;
    generationMs: number | null;
  };
  qualityComparison: AutoV2QualityComparison;
  costComparison: {
    manualReviewedTarget: { manualEditedLines: number | null; repairIterations: number | null };
    autoV2FirstPass: { generatedLines: number; generatedBytes: number; manualEditedLines: 0; repairIterations: 0; modelCalls: 0; generationMs: number | null };
    detail: string;
  };
  limitations: string[];
}

export interface AutoV2GenerationOptions {
  manualQualityReport?: unknown;
  generatedQualityReport?: unknown;
  manualEditedLines?: number;
  repairIterations?: number;
  generationMs?: number;
}

function file(path: string, content: string): AutoV2GeneratedFile {
  const normalized = content.trimStart().replace(/\s+$/, "") + "\n";
  return { path, content: normalized, lines: normalized.split("\n").length - 1 };
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/</g, "\\u003c");
}

function normalizePath(path: string): string {
  const hash = path.includes("#") ? path.slice(path.indexOf("#") + 1) : path;
  const query = hash.split("?")[0] || "/";
  return query.startsWith("/") ? query : `/${query}`;
}

function routeMatches(path: string, pattern: string): boolean {
  const actual = normalizePath(path).split("/").filter(Boolean);
  const expected = normalizePath(pattern).split("/").filter(Boolean);
  if (actual.length !== expected.length) return false;
  return expected.every((segment, index) => segment.startsWith(":") || segment === "*" || segment === actual[index]);
}

interface AutoV2RouteRecord {
  path: string;
  name: string | null;
  componentFile: string | null;
  dynamic: boolean;
  resolution: string;
  confidence: string;
  visualBoundary: string | null;
  ownerIds: string[];
  screenshotAnchors: string[];
  viewports: string[];
}

function routeRecord(bundle: AutoV2SourceBundle): AutoV2RouteRecord[] {
  const boundaries = bundle.visualPlan.boundaries;
  return bundle.routerSfc.routes.map((route) => {
    const boundary = boundaries.find((candidate) => routeMatches(candidate.route, route.path));
    return {
      path: route.path,
      name: route.name,
      componentFile: route.sfcFile,
      dynamic: route.dynamic,
      resolution: route.resolution,
      confidence: route.confidence,
      visualBoundary: boundary?.id ?? null,
      ownerIds: boundary?.ownerIds ?? [],
      screenshotAnchors: boundary?.acceptance.screenshotAnchors ?? [],
      viewports: boundary?.acceptance.viewports ?? [],
    };
  });
}

function escapeHtml(value: string): string { return value.replace(/[&<>"\']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character); }

function renderPrimitiveAttributes(node: PrimitiveDomNode, interactionEvents: string[]): string {
  const attributes: string[] = [`data-primitive-node="${escapeHtml(node.id)}"`];
  if (node.classes.length > 0) attributes.push(`class="${escapeHtml(node.classes.join(" "))}"`);
  for (const [name, value] of Object.entries(node.attributes)) {
    if (name.startsWith("@") || name.startsWith(":") || name.startsWith("v-") || name.startsWith("#")) continue;
    if (name === "class" || name === "style") continue;
    attributes.push(value === true ? escapeHtml(name) : `${escapeHtml(name)}="${escapeHtml(String(value))}"`);
  }
  const style = Object.entries(node.inlineStyle).map(([name, value]) => `${name}:${value}`).join(";");
  if (style) attributes.push(`style="${escapeHtml(style)}"`);
  if (interactionEvents.length > 0) attributes.push(`data-auto-v2-events="${escapeHtml(interactionEvents.join(","))}"`);
  return attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
}

function renderPrimitiveCompilation(compilation: PrimitiveDomCompilation): { html: string; css: string; nodes: number; interactions: number } {
  const nodes = new Map(compilation.nodes.map((node) => [node.sourceNodeId, node]));
  const children = new Map<string, PrimitiveDomNode[]>();
  for (const node of compilation.nodes) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? []; list.push(node); children.set(node.parentId, list);
  }
  const eventsBySource = new Map<string, string[]>();
  for (const interaction of compilation.interactions) eventsBySource.set(interaction.sourceNodeId, [...(eventsBySource.get(interaction.sourceNodeId) ?? []), interaction.event]);
  const escapeContent = (value: string): string => escapeHtml(value.replace(/{{[^}]+}}/g, ""));
  const renderNode = (node: PrimitiveDomNode): string => {
    const childBySource = new Map((children.get(node.id) ?? []).map((child) => [child.sourceNodeId, child]));
    const tokens = node.content.map((token) => token.kind === "text" ? escapeContent(token.value) : (childBySource.get(token.nodeId) ? renderNode(childBySource.get(token.nodeId)!) : "")).join("");
    const fallbackChildren = tokens || (children.get(node.id) ?? []).sort((a, b) => a.order - b.order).map(renderNode).join("");
    const content = fallbackChildren;
    const attributes = renderPrimitiveAttributes(node, eventsBySource.get(node.sourceNodeId) ?? []);
    const voidTag = new Set(["input", "img", "br", "hr", "meta", "link"]).has(node.renderTag);
    return voidTag ? `<${node.renderTag}${attributes}>` : `<${node.renderTag}${attributes}>${content}</${node.renderTag}>`;
  };
  const html = compilation.roots.map((rootId) => nodes.get(rootId) ? renderNode(nodes.get(rootId)!) : "").join("");
  return { html, css: `${materializeElementUiPrimitiveCss(compilation)}${materializePrimitiveCss(compilation)}`, nodes: compilation.nodes.length, interactions: compilation.interactions.length };
}

interface GeneratedOwnerRender { html: string; css: string; nodes: number; interactions: number }

function ownerMarkup(owner: VisualTargetOwnerPlan): GeneratedOwnerRender {
  const label = owner.componentName.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const compilation = compilePrimitiveDom(owner.templateStructure, `auto-v2-${owner.id}`);
  const rendered = renderPrimitiveCompilation(compilation);
  const body = rendered.html || `<div class="auto-v2-owner-body" data-auto-v2-node="${escapeHtml(owner.componentId)}"></div>`;
  return { ...rendered, html: `<section class="auto-v2-owner" data-visual-owner="${escapeHtml(owner.id)}" data-source-file="${escapeHtml(owner.sourceFile)}"><header>${escapeHtml(label)}</header><div class="auto-v2-owner-body">${body}</div></section>` };
}

function generatedApp(bundle: AutoV2SourceBundle): string {
  const records = routeRecord(bundle);
  const ownerRenders = Object.fromEntries(bundle.visualPlan.owners.map((owner) => [owner.id, ownerMarkup(owner)]));
  const ownerMarkupById = Object.fromEntries(Object.entries(ownerRenders).map(([id, render]) => [id, render.html]));
  const initial = normalizePath(bundle.routePlan.routes.find((route) => route.entry)?.route ?? records[0]?.path ?? "/");
  return `const ROUTES=${json(records)};
const OWNER_MARKUP=${json(ownerMarkupById)};
const BOUNDARIES=${json(Object.fromEntries(bundle.visualPlan.boundaries.map((boundary) => [boundary.id, { route: boundary.route, ownerIds: boundary.ownerIds }])))};
const app=document.getElementById('app');
const normalize=(value)=>{const hash=value.includes('#')?value.slice(value.indexOf('#')+1):value;const path=(hash.split('?')[0]||'/');return path.startsWith('/')?path:'/'+path};
const matches=(path,pattern)=>{const a=normalize(path).split('/').filter(Boolean),b=normalize(pattern).split('/').filter(Boolean);return a.length===b.length&&b.every((part,index)=>part.startsWith(':')||part==='*'||part===a[index])};
const routeFor=(path)=>ROUTES.find((route)=>matches(path,route.path))||ROUTES[0];
const render=()=>{const path=normalize(location.pathname+location.search),route=routeFor(path);const owners=(route.ownerIds||[]).map((id)=>OWNER_MARKUP['visual:'+id]||OWNER_MARKUP[id]||'').join('');app.innerHTML='<nav class="auto-v2-nav">'+ROUTES.map((item)=>'<a href="'+item.path+'" data-auto-v2-route="'+item.path+'">'+(item.name||item.path)+'</a>').join('')+'</nav><main data-auto-v2-route="'+route.path+'" data-auto-v2-component="'+(route.componentFile||'')+'"><h1>'+((route.name||route.path))+'</h1>'+owners+'</main>';document.title=route.name||route.path;document.querySelectorAll('[data-auto-v2-route]').forEach((node)=>node.addEventListener('click',(event)=>{if(node.tagName==='A'){event.preventDefault();history.pushState({autoV2:true,route:node.getAttribute('href')},'',node.getAttribute('href'));render()}}))};
history.replaceState({autoV2:true,route:${JSON.stringify(initial)}},'',location.href);addEventListener('popstate',render);render();
void BOUNDARIES;`;
}

function generatedStyles(bundle: AutoV2SourceBundle): string {
  const ownerCss = bundle.visualPlan.owners.map((owner) => ownerMarkup(owner).css).filter(Boolean).join("");
  return `:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#263238;background:#f4f6f8}*{box-sizing:border-box}body{margin:0;min-height:100vh}.auto-v2-nav{display:flex;gap:16px;padding:16px 24px;background:#263238}.auto-v2-nav a{color:#fff;text-decoration:none;font-size:14px}.auto-v2-nav a:hover{text-decoration:underline}main{max-width:1200px;margin:0 auto;padding:32px}main>h1{font-size:24px;margin:0 0 24px}.auto-v2-owner{display:block;margin:16px 0;padding:20px;border:1px solid #dcdfe6;border-radius:4px;background:#fff;min-height:96px}.auto-v2-owner>header{font-weight:600;color:#303133}.auto-v2-owner-body{min-height:32px;margin-top:12px;background:#f8f9fa}@media(max-width:767px){.auto-v2-nav{overflow:auto;white-space:nowrap}.auto-v2-nav a{flex:0 0 auto}main{padding:16px}.auto-v2-owner{margin:12px 0;padding:16px}}${ownerCss}`;
}

function generatedIndex(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Generated Target Auto v2</title><link rel="stylesheet" href="/styles.css"></head><body><div id="app"></div><script src="/app.js"></script></body></html>`;
}

function generatedServer(): string {
  return `import { createServer } from 'node:http';import { readFile } from 'node:fs/promises';import { extname,join } from 'node:path';import { fileURLToPath } from 'node:url';const root=join(fileURLToPath(new URL('.',import.meta.url)),'public');const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};createServer(async(req,res)=>{try{const pathname=new URL(req.url||'/', 'http://localhost').pathname;const path=join(root,pathname==='/'?'index.html':pathname);const body=await readFile(path);res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(body)}catch{const body=await readFile(join(root,'index.html'));res.writeHead(200,{'content-type':types['.html'],'cache-control':'no-store'});res.end(body)}}).listen(Number(process.env.PORT||9530),'127.0.0.1',()=>console.log('generated-target-auto-v2 http://127.0.0.1:'+Number(process.env.PORT||9530)));`;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function qualitySummary(report: unknown): AutoV2QualitySummary {
  if (!report || typeof report !== "object") return { available: false, passed: null, navigationIntegrity: null, computedStyle: null, pixelDiff: null, runtimeErrors: null, requiredNetworkFailures: null, stabilityFailures: null, blockingHandlesAfterClose: null };
  const value = report as Record<string, any>;
  return {
    available: true,
    passed: typeof value.passed === "boolean" ? value.passed : null,
    navigationIntegrity: numberOrNull(value.navigationIntegrity?.rate),
    computedStyle: numberOrNull(value.visualMatrix?.worstComputedStyle),
    pixelDiff: numberOrNull(value.visualMatrix?.worstPixelDiff),
    runtimeErrors: numberOrNull(value.runtimeErrors),
    requiredNetworkFailures: numberOrNull(value.requiredNetworkFailures),
    stabilityFailures: numberOrNull(value.visualMatrix?.stabilityFailures ?? value.stabilityFailures),
    blockingHandlesAfterClose: numberOrNull(value.telemetry?.activeHandlesAfterClose?.totalBlockingHandles),
  };
}

function delta(manual: number | null, generated: number | null): number | null {
  return manual === null || generated === null ? null : Number((generated - manual).toFixed(6));
}

function compareQuality(manualReport: unknown, generatedReport: unknown): AutoV2QualityComparison {
  const manual = qualitySummary(manualReport);
  const generated = qualitySummary(generatedReport);
  const routeComparable = manual.available && generated.available && manual.navigationIntegrity !== null && generated.navigationIntegrity !== null;
  const comparable = routeComparable && manual.computedStyle !== null && generated.computedStyle !== null && manual.pixelDiff !== null && generated.pixelDiff !== null;
  return {
    comparable,
    routeComparable,
    manual,
    generated,
    generatedMinusManual: { computedStyle: delta(manual.computedStyle, generated.computedStyle), pixelDiff: delta(manual.pixelDiff, generated.pixelDiff), navigationIntegrity: delta(manual.navigationIntegrity, generated.navigationIntegrity) },
    detail: comparable ? "report-level quality comparison; formal Gold+ gates remain authoritative" : routeComparable ? "Semantic route reports are comparable, but generated visual Gold+ fields are absent; no visual-equivalence claim" : "quality reports were not supplied; auto-v2 is a review candidate and does not claim visual equivalence",
  };
}

export function generateGeneratedTargetAutoV2(bundle: AutoV2SourceBundle, options: AutoV2GenerationOptions = {}): GeneratedTargetAutoV2Artifact {
  const files = [file("public/index.html", generatedIndex()), file("public/app.js", generatedApp(bundle)), file("public/styles.css", generatedStyles(bundle)), file("server.mjs", generatedServer())];
  const ownerRenders = bundle.visualPlan.owners.map((owner) => ownerMarkup(owner));
  const compiledOwnerRoots = bundle.visualPlan.owners.length;
  const generatedVisualNodes = ownerRenders.reduce((sum, render) => sum + render.nodes, 0);
  const generatedInteractionBindings = ownerRenders.reduce((sum, render) => sum + render.interactions, 0);
  return {
    schemaVersion: "1.0",
    kind: "generated-target-auto-v2",
    reviewRequired: true,
    fullGeneratedApplication: false,
    generatedVisualDom: true,
    source: {
      routerSfcGraphKind: bundle.routerSfc.kind,
      routeBindings: bundle.routerSfc.metrics.routeBindings,
      resolvedRoutes: bundle.routerSfc.metrics.resolvedRoutes,
      visualBoundaries: bundle.visualPlan.metrics.boundaries,
      visualOwners: bundle.visualPlan.metrics.owners,
      sfcVisualMetrics: bundle.sfcVisual?.metrics ?? null,
      apiFixtureMetrics: bundle.apiFixture?.metrics ?? null,
      spaAuthMetrics: bundle.spaAuth?.metrics ?? null,
      transportProxyMetrics: bundle.transportProxy?.metrics ?? null,
    },
    files,
    metrics: {
      generatedFiles: files.length,
      generatedLines: files.reduce((sum, item) => sum + item.lines, 0),
      generatedBytes: files.reduce((sum, item) => sum + Buffer.byteLength(item.content, "utf8"), 0),
      routeEntries: bundle.routerSfc.routes.length,
      visualBoundaries: bundle.visualPlan.metrics.boundaries,
      visualOwners: bundle.visualPlan.metrics.owners,
      compiledOwnerRoots,
      generatedVisualNodes,
      generatedInteractionBindings,
      modelCalls: 0,
      manualEdits: 0,
      manualEditedLines: 0,
      repairIterations: 0,
      generationMs: options.generationMs ?? null,
    },
    qualityComparison: compareQuality(options.manualQualityReport, options.generatedQualityReport),
    costComparison: {
      manualReviewedTarget: { manualEditedLines: options.manualEditedLines ?? null, repairIterations: options.repairIterations ?? null },
      autoV2FirstPass: { generatedLines: files.reduce((sum, item) => sum + item.lines, 0), generatedBytes: files.reduce((sum, item) => sum + Buffer.byteLength(item.content, "utf8"), 0), manualEditedLines: 0, repairIterations: 0, modelCalls: 0, generationMs: options.generationMs ?? null },
      detail: "manual values are reviewed inputs; auto-v2 first-pass values are deterministic generation telemetry",
    },
    limitations: [
      "auto-v2 is a responsibility-guided route and visual-owner shell, not a full business-page implementation",
      "router ownership comes from route-to-import-to-SFC evidence; unresolved bindings must block dispatch",
      "owner roots are compiled from primitive template evidence; unsupported primitives remain explicit review boundaries",
      "API, auth, and proxy graphs are recorded as evidence inputs; runtime fixture materialization remains a separate reviewed step",
      "the first Semantic and Gold+ run must be recorded before any manual repair; current artifact does not claim visual equivalence",
    ],
  };
}
