import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { chromium, type Browser, type BrowserContext, type Page, type Request } from "playwright-core";
import { compareComputedStyles, comparePixels, COMPUTED_STYLE_PROPERTIES } from "./browser.js";
import type { ComputedStyleSnapshot, JsonValue, PixelDiffReport, QualityViewport, StyleComparisonReport } from "../types.js";

export interface SpaRouterFixture {
  path: string;
  method?: string;
  status?: number;
  headers?: Record<string, string>;
  body: JsonValue;
}

export interface SpaRouterStep {
  action: "click" | "dblclick" | "hover" | "input" | "key" | "back" | "forward" | "reload" | "wait";
  target?: string;
  value?: string;
  key?: string;
  ms?: number;
}

export interface SpaRouterAssertion {
  path?: string;
  search?: string;
  hash?: string;
  visibleText?: string;
  visibleSelector?: string;
  absentText?: string;
  absentExactText?: string;
  absentSelector?: string;
  selectorCount?: { target: string; count: number };
  inputValue?: { target: string; value: string };
}

export type SpaRouterRoleSelector = string | { default?: string; reference?: string; generated?: string };

export interface SpaRouterVisualStyleTarget {
  id: string;
  selector: SpaRouterRoleSelector;
}

export interface SpaRouterScenarioVisualState {
  screenshotAnchor?: SpaRouterRoleSelector;
  styleTargets?: SpaRouterVisualStyleTarget[];
}

export interface SpaRouterScenario {
  id: string;
  entryPath: string;
  steps: SpaRouterStep[];
  assertions: SpaRouterAssertion;
  visual?: SpaRouterScenarioVisualState;
}

export interface SpaRouterVisualMatrixConfig {
  viewports?: QualityViewport[];
  pixelThreshold?: number;
  styleThreshold?: number;
  artifactDir?: string;
  stabilityTimeoutMs?: number;
}

export interface SpaRouterExecutionConfig {
  contractConcurrency?: number;
  visualConcurrency?: number;
}

export interface SpaRouterContractConfig {
  schemaVersion: "1.0";
  /** Backward-compatible source-only execution target. */
  baseUrl?: string;
  /** Reference target for strict translation comparison. */
  referenceBaseUrl?: string;
  /** Generated/dismantled target for strict translation comparison. */
  generatedBaseUrl?: string;
  apiPrefix?: string;
  ignoredStateKeys?: string[];
  fixtures?: SpaRouterFixture[];
  scenarios: SpaRouterScenario[];
  /** Explicitly enables route-state visual replay for scenarios that declare `visual`. */
  visualMatrix?: SpaRouterVisualMatrixConfig;
  execution?: SpaRouterExecutionConfig;
}

export interface SpaRouterTransition {
  method: "pushState" | "replaceState" | "popstate" | "hashchange";
  target: string;
  state: string;
}

export interface SpaRouterScenarioResult {
  id: string;
  passed: boolean;
  entryUrl: string;
  finalUrl: string;
  transitions: SpaRouterTransition[];
  runtimeErrors: string[];
  unmockedApiRequests: string[];
  assertionFailures: string[];
}

export interface SpaRouterTargetReport {
  baseUrl: string;
  passed: boolean;
  scenariosPassed: number;
  scenariosTotal: number;
  runtimeErrors: number;
  unmockedApiRequests: number;
  results: SpaRouterScenarioResult[];
}

export type SpaRouterComparisonFailureReason =
  | "missing-reference-scenario"
  | "missing-generated-scenario"
  | "reference-assertion-failure"
  | "generated-assertion-failure"
  | "transition-count-mismatch"
  | "transition-method-mismatch"
  | "transition-target-mismatch"
  | "transition-state-mismatch"
  | "final-route-mismatch";

export interface SpaRouterComparisonFailure {
  reason: SpaRouterComparisonFailureReason;
  transitionIndex?: number;
  reference?: string | number;
  generated?: string | number;
  detail: string;
}

export interface SpaRouterScenarioComparison {
  id: string;
  passed: boolean;
  reference?: SpaRouterScenarioResult;
  generated?: SpaRouterScenarioResult;
  failures: SpaRouterComparisonFailure[];
}

export interface SpaRouterNavigationIntegrityReport {
  passed: boolean;
  rate: number;
  matchedScenarios: number;
  totalScenarios: number;
  failures: number;
}

export interface SpaRouterVisualViewportResult extends QualityViewport {
  passed: boolean;
  referenceFinalRoute: string;
  generatedFinalRoute: string;
  referenceAnchor: string | null;
  generatedAnchor: string | null;
  runtimeErrors: number;
  unmockedApiRequests: number;
  stabilityFailures: string[];
  adaptiveWaitMs: number;
  durationMs: number;
  navigationPassed: boolean;
  navigationFailures: SpaRouterComparisonFailure[];
  captureFailures: string[];
  styles: StyleComparisonReport;
  pixels: PixelDiffReport;
}

export interface SpaRouterScenarioVisualMatrix {
  scenarioId: string;
  passed: boolean;
  viewports: SpaRouterVisualViewportResult[];
  worstComputedStyle: number;
  worstPixelDiff: number;
  durationMs: number;
}

export interface SpaRouterVisualMatrixReport {
  passed: boolean;
  scenarios: SpaRouterScenarioVisualMatrix[];
  scenarioCount: number;
  viewportRuns: number;
  runtimeErrors: number;
  unmockedApiRequests: number;
  navigationFailures: number;
  navigationMatchedRuns: number;
  worstComputedStyle: number;
  worstPixelDiff: number;
  styleThreshold: number;
  pixelThreshold: number;
  targetRuns: number;
  reusedTargetRuns: number;
  freshTargetRuns: number;
  stabilityFailures: number;
  adaptiveWaitMs: number;
}

export interface SpaRouterExecutionTelemetry {
  contractTargetRuns: number;
  visualViewportRuns: number;
  visualTargetRuns: number;
  visualTargetReusedRuns: number;
  visualTargetFreshRuns: number;
  visualStabilityFailures: number;
  visualAdaptiveWaitMs: number;
  contractConcurrency: number;
  visualConcurrency: number;
  timing: {
    browserLaunchMs: number;
    contractMs: number;
    comparisonMs: number;
    visualMatrixMs: number;
    browserCloseMs: number;
    totalMs: number;
  };
}

export interface SpaRouterQualityGate {
  id: "scenario-protocol" | "scenario-viewport-matrix" | "visual-runtime" | "resource-readiness" | "navigation-integrity";
  passed: boolean;
  detail: string;
}

export interface SpaRouterContractReport {
  schemaVersion: "1.0";
  mode: "single" | "reference-generated";
  /** Present in source-only mode for backward compatibility. */
  baseUrl?: string;
  referenceBaseUrl?: string;
  generatedBaseUrl?: string;
  passed: boolean;
  scenariosPassed: number;
  scenariosTotal: number;
  runtimeErrors: number;
  unmockedApiRequests: number;
  /** Source-only results, or generated results in comparison mode for backward-compatible consumers. */
  results: SpaRouterScenarioResult[];
  reference?: SpaRouterTargetReport;
  generated?: SpaRouterTargetReport;
  comparisons?: SpaRouterScenarioComparison[];
  navigationIntegrity: SpaRouterNavigationIntegrityReport;
  visualMatrix?: SpaRouterVisualMatrixReport;
  telemetry: SpaRouterExecutionTelemetry;
  qualityGates: SpaRouterQualityGate[];
}

type SpaRouterTargetRole = "single" | "reference" | "generated";
interface SpaRouterVisualCapture {
  screenshot: Buffer;
  styles: ComputedStyleSnapshot[];
  anchor: string | null;
  failures: string[];
  stabilityFailures: string[];
  adaptiveWaitMs: number;
}
interface SpaRouterScenarioExecution {
  result: SpaRouterScenarioResult;
  visual?: SpaRouterVisualCapture;
}
interface SpaRouterTargetEvaluation {
  report: SpaRouterTargetReport;
  executions: Map<string, SpaRouterScenarioExecution>;
}

const DEFAULT_VISUAL_VIEWPORTS: QualityViewport[] = [
  { id: "desktop", label: "Desktop", width: 1024, height: 768 },
  { id: "tablet", label: "Tablet", width: 768, height: 1024 },
  { id: "mobile", label: "Mobile", width: 390, height: 844 },
];
const NAVIGATION_FAILURE_REASONS = new Set<SpaRouterComparisonFailureReason>([
  "missing-reference-scenario", "missing-generated-scenario", "transition-count-mismatch", "transition-method-mismatch",
  "transition-target-mismatch", "transition-state-mismatch", "final-route-mismatch",
]);

function chromePath(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((value): value is string => Boolean(value));
  const selected = candidates.find(existsSync);
  if (!selected) throw new Error("未找到 Chrome/Chromium；可通过 CHROME_PATH 指定浏览器路径");
  return selected;
}

function targetUrl(baseUrl: string, path: string): string { return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).href; }
function routeOf(value: string): string { const url = new URL(value); return `${url.pathname}${url.search}${url.hash}`; }
function selectorForRole(value: SpaRouterRoleSelector | undefined, role: SpaRouterTargetRole): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (role === "generated") return value.generated ?? value.default ?? value.reference;
  return value.reference ?? value.default ?? value.generated;
}

function resolveMode(config: SpaRouterContractConfig): { mode: "single"; baseUrl: string } | { mode: "reference-generated"; referenceBaseUrl: string; generatedBaseUrl: string } {
  const single = Boolean(config.baseUrl);
  const dual = Boolean(config.referenceBaseUrl || config.generatedBaseUrl);
  if (single && dual) throw new TypeError("SPA Router 配置不能同时使用 baseUrl 与 referenceBaseUrl/generatedBaseUrl");
  if (single) return { mode: "single", baseUrl: config.baseUrl! };
  if (config.referenceBaseUrl && config.generatedBaseUrl) return { mode: "reference-generated", referenceBaseUrl: config.referenceBaseUrl, generatedBaseUrl: config.generatedBaseUrl };
  throw new TypeError("SPA Router 配置必须包含 baseUrl，或同时包含 referenceBaseUrl/generatedBaseUrl");
}

function validateConfig(config: SpaRouterContractConfig): ReturnType<typeof resolveMode> {
  if (config.schemaVersion !== "1.0" || !Array.isArray(config.scenarios) || !config.scenarios.length) throw new TypeError("SPA Router 配置必须是 schemaVersion=1.0 且包含 scenarios");
  const ids = config.scenarios.map((scenario) => scenario.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new TypeError("SPA Router scenarios 必须包含非空且唯一的 id");
  const mode = resolveMode(config);
  for (const [name, value] of Object.entries(config.execution ?? {})) {
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 4) throw new TypeError(`execution.${name} 必须是 1..4 的整数`);
  }
  if (config.visualMatrix) {
    if (mode.mode !== "reference-generated") throw new TypeError("SPA route-state visualMatrix 需要 referenceBaseUrl/generatedBaseUrl 双端配置");
    const visualScenarios = config.scenarios.filter((scenario) => scenario.visual);
    if (!visualScenarios.length) throw new TypeError("visualMatrix 已启用，但没有场景声明 visual 状态");
    const viewports = config.visualMatrix.viewports ?? DEFAULT_VISUAL_VIEWPORTS;
    if (!viewports.length || viewports.some((viewport) => !viewport.id || viewport.width <= 0 || viewport.height <= 0)) throw new TypeError("visualMatrix.viewports 必须包含有效 id/width/height");
    if (new Set(viewports.map((viewport) => viewport.id)).size !== viewports.length) throw new TypeError("visualMatrix viewport id 必须唯一");
  }
  return mode;
}

async function initializeRouterTracking(context: BrowserContext, ignoredStateKeys: string[] = []): Promise<void> {
  await context.addInitScript(({ ignoredKeys }) => {
    type Transition = { method: "pushState" | "replaceState" | "popstate" | "hashchange"; target: string; state: string };
    const host = globalThis as typeof globalThis & { __uiDismantlerSpaTransitions?: Transition[] };
    const transitions: Transition[] = [];
    host.__uiDismantlerSpaTransitions = transitions;
    const stableState = (value: unknown): string => {
      const seen = new WeakSet<object>();
      const normalize = (input: unknown): unknown => {
        if (!input || typeof input !== "object") return input;
        if (seen.has(input)) return "[Circular]";
        seen.add(input);
        if (Array.isArray(input)) return input.map(normalize);
        return Object.fromEntries(Object.keys(input as Record<string, unknown>).filter((key) => !ignoredKeys.includes(key)).sort().map((key) => [key, normalize((input as Record<string, unknown>)[key])]));
      };
      try { return JSON.stringify(normalize(value)) ?? "undefined"; } catch { return String(value); }
    };
    const normalizeTarget = (value: string | URL | null | undefined): string => {
      if (value == null || String(value) === "") return `${location.pathname}${location.search}${location.hash}`;
      try { const url = new URL(String(value), location.href); return `${url.pathname}${url.search}${url.hash}`; } catch { return String(value); }
    };
    const record = (method: Transition["method"], target: string | URL | null | undefined, state: unknown): void => {
      transitions.push({ method, target: normalizeTarget(target), state: stableState(state) });
    };
    for (const method of ["pushState", "replaceState"] as const) {
      const native = history[method].bind(history);
      history[method] = ((state: unknown, title: string, url?: string | URL | null) => {
        const result = native(state, title, url);
        record(method, url, state);
        return result;
      }) as History[typeof method];
    }
    addEventListener("popstate", (event) => record("popstate", location.href, event.state));
    addEventListener("hashchange", () => record("hashchange", location.href, history.state));
  }, { ignoredKeys: ignoredStateKeys });
}

async function settle(page: Page, ms = 250): Promise<void> {
  await page.waitForTimeout(ms);
  await page.evaluate(async () => { await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))); });
}

interface VisualStabilityResult {
  stabilityFailures: string[];
  adaptiveWaitMs: number;
}
interface RequestActivity {
  active: Set<Request>;
  lastActivityAt: number;
}

async function initializeVisualStabilityTracking(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    type StabilityState = { lastMutationAt: number; lastResizeAt: number; mutationCount: number; resizeCount: number };
    const host = globalThis as typeof globalThis & { __uiDismantlerSpaStability?: StabilityState };
    const state: StabilityState = { lastMutationAt: performance.now(), lastResizeAt: performance.now(), mutationCount: 0, resizeCount: 0 };
    host.__uiDismantlerSpaStability = state;
    const observe = (): void => {
      if (!document.documentElement) return;
      const mutationObserver = new MutationObserver(() => { state.lastMutationAt = performance.now(); state.mutationCount += 1; });
      mutationObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      if (typeof ResizeObserver !== "undefined") {
        const resizeObserver = new ResizeObserver(() => { state.lastResizeAt = performance.now(); state.resizeCount += 1; });
        resizeObserver.observe(document.documentElement);
        if (document.body) resizeObserver.observe(document.body);
      }
    };
    if (document.readyState === "loading") addEventListener("DOMContentLoaded", observe, { once: true }); else observe();
  });
}

async function settleVisual(page: Page, requestActivity: RequestActivity, timeoutMs = 1800): Promise<VisualStabilityResult> {
  const startedAt = Date.now(), quietWindowMs = 120;
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.status !== "loaded") await Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, 1200))]);
    await Promise.all([...document.images].map(async (image) => {
      if (!image.complete) await new Promise<void>((done) => { image.addEventListener("load", () => done(), { once: true }); image.addEventListener("error", () => done(), { once: true }); setTimeout(done, 1200); });
      if (typeof image.decode === "function") await image.decode().catch(() => undefined);
    }));
  });
  const deadline = Date.now() + timeoutMs;
  let previousSignature = "", stableSamples = 0;
  let lastState = { mutationQuiet: false, resizeQuiet: false, layoutStable: false, networkQuiet: false };
  while (Date.now() < deadline) {
    const sample = await page.evaluate((quietMs) => {
      const host = globalThis as typeof globalThis & { __uiDismantlerSpaStability?: { lastMutationAt: number; lastResizeAt: number } };
      const now = performance.now(), state = host.__uiDismantlerSpaStability;
      const signature = JSON.stringify([...document.querySelectorAll("body *")].slice(0, 500).map((element) => {
        const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
        return [element.tagName, element.id, String(element.className), Math.round(rect.x * 10) / 10, Math.round(rect.y * 10) / 10, Math.round(rect.width * 10) / 10, Math.round(rect.height * 10) / 10, style.display, style.visibility, (element.textContent ?? "").length];
      }));
      return { signature, mutationQuiet: Boolean(state && now - state.lastMutationAt >= quietMs), resizeQuiet: Boolean(state && now - state.lastResizeAt >= quietMs) };
    }, quietWindowMs);
    stableSamples = sample.signature === previousSignature ? stableSamples + 1 : 0;
    previousSignature = sample.signature;
    const networkQuiet = requestActivity.active.size === 0 && Date.now() - requestActivity.lastActivityAt >= quietWindowMs;
    lastState = { mutationQuiet: sample.mutationQuiet, resizeQuiet: sample.resizeQuiet, layoutStable: stableSamples >= 2, networkQuiet };
    if (lastState.mutationQuiet && lastState.resizeQuiet && lastState.layoutStable && lastState.networkQuiet) return { stabilityFailures: [], adaptiveWaitMs: Date.now() - startedAt };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const stabilityFailures: string[] = [];
  if (!lastState.mutationQuiet) stabilityFailures.push("DOM mutation quiet window was not reached before visual capture");
  if (!lastState.resizeQuiet || !lastState.layoutStable) stabilityFailures.push("layout rect did not remain stable for two consecutive samples before visual capture");
  if (!lastState.networkQuiet) stabilityFailures.push(`network quiet window was not reached before visual capture: active=${requestActivity.active.size}`);
  return { stabilityFailures, adaptiveWaitMs: Date.now() - startedAt };
}

async function executeStep(page: Page, step: SpaRouterStep): Promise<void> {
  if (step.action === "wait") { await page.waitForTimeout(step.ms ?? 250); return; }
  if (step.action === "back") { await page.goBack({ waitUntil: "domcontentloaded" }); await settle(page); return; }
  if (step.action === "forward") { await page.goForward({ waitUntil: "domcontentloaded" }); await settle(page); return; }
  if (step.action === "reload") { await page.reload({ waitUntil: "domcontentloaded" }); await settle(page); return; }
  if (!step.target) throw new TypeError(`${step.action} step 缺少 target`);
  const locator = page.locator(step.target).first();
  if (step.action === "click") await locator.click();
  else if (step.action === "dblclick") await locator.dblclick();
  else if (step.action === "hover") await locator.hover();
  else if (step.action === "input") await locator.fill(step.value ?? "");
  else if (step.action === "key") { await locator.focus(); await locator.press(step.key ?? "Enter"); }
  await settle(page);
}

async function assertScenario(page: Page, assertion: SpaRouterAssertion): Promise<string[]> {
  const failures: string[] = [];
  const url = new URL(page.url());
  if (assertion.path !== undefined && url.pathname !== assertion.path) failures.push(`path expected=${assertion.path} actual=${url.pathname}`);
  if (assertion.search !== undefined && url.search !== assertion.search) failures.push(`search expected=${assertion.search} actual=${url.search}`);
  if (assertion.hash !== undefined && url.hash !== assertion.hash) failures.push(`hash expected=${assertion.hash} actual=${url.hash}`);
  if (assertion.visibleText !== undefined && !(await page.getByText(assertion.visibleText, { exact: false }).first().isVisible().catch(() => false))) failures.push(`visibleText missing=${assertion.visibleText}`);
  if (assertion.visibleSelector !== undefined && !(await page.locator(assertion.visibleSelector).first().isVisible().catch(() => false))) failures.push(`visibleSelector missing=${assertion.visibleSelector}`);
  if (assertion.absentText !== undefined && await page.getByText(assertion.absentText, { exact: false }).first().isVisible().catch(() => false)) failures.push(`absentText still visible=${assertion.absentText}`);
  if (assertion.absentExactText !== undefined && await page.getByText(assertion.absentExactText, { exact: true }).first().isVisible().catch(() => false)) failures.push(`absentExactText still visible=${assertion.absentExactText}`);
  if (assertion.absentSelector !== undefined && await page.locator(assertion.absentSelector).first().isVisible().catch(() => false)) failures.push(`absentSelector still visible=${assertion.absentSelector}`);
  if (assertion.selectorCount !== undefined) {
    const count = await page.locator(assertion.selectorCount.target).count();
    if (count !== assertion.selectorCount.count) failures.push(`selectorCount ${assertion.selectorCount.target} expected=${assertion.selectorCount.count} actual=${count}`);
  }
  if (assertion.inputValue !== undefined) {
    const value = await page.locator(assertion.inputValue.target).first().inputValue().catch(() => "<missing>");
    if (value !== assertion.inputValue.value) failures.push(`inputValue ${assertion.inputValue.target} expected=${assertion.inputValue.value} actual=${value}`);
  }
  return failures;
}

async function normalizeScrollAnchor(page: Page, visual: SpaRouterScenarioVisualState, role: SpaRouterTargetRole): Promise<string | null> {
  const selector = selectorForRole(visual.screenshotAnchor, role);
  if (!selector) return null;
  const normalized = await page.evaluate((target) => {
    let element: Element | null = null;
    try { element = document.querySelector(target); } catch { return false; }
    if (!element) return false;
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) return false;
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    const nextRect = element.getBoundingClientRect();
    const targetTop = Math.max(24, (innerHeight - nextRect.height) / 2);
    if (document.scrollingElement) document.scrollingElement.scrollTop += nextRect.top - targetTop;
    return true;
  }, selector);
  if (!normalized) return null;
  await page.evaluate(async () => { await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))); });
  return selector;
}

async function captureVisualState(page: Page, visual: SpaRouterScenarioVisualState, role: SpaRouterTargetRole, requestActivity: RequestActivity, stabilityTimeoutMs?: number): Promise<SpaRouterVisualCapture> {
  const stability = await settleVisual(page, requestActivity, stabilityTimeoutMs);
  const anchor = await normalizeScrollAnchor(page, visual, role);
  const targets = visual.styleTargets?.length ? visual.styleTargets : [{ id: "document-body", selector: "body" }];
  const failures: string[] = [];
  const styles: ComputedStyleSnapshot[] = [];
  for (const target of targets) {
    const selector = selectorForRole(target.selector, role);
    if (!selector) { failures.push(`style target ${target.id} 缺少 ${role} selector`); continue; }
    const snapshot = await page.locator(selector).first().evaluate((element, input) => {
      const computed = getComputedStyle(element), rect = element.getBoundingClientRect();
      return {
        key: input.id, tag: element.tagName.toLowerCase(), id: input.id, classes: [input.id], selector: input.selector,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        styles: Object.fromEntries(input.properties.map((property) => [property, computed.getPropertyValue(property).trim()])),
      };
    }, { id: target.id, selector, properties: [...COMPUTED_STYLE_PROPERTIES] }).catch(() => null);
    if (snapshot) styles.push(snapshot);
    else failures.push(`style target ${target.id} 未命中 selector=${selector}`);
  }
  const screenshot = await page.screenshot({ type: "png", fullPage: false, animations: "disabled" });
  return { screenshot, styles, anchor, failures: [...failures, ...stability.stabilityFailures], stabilityFailures: stability.stabilityFailures, adaptiveWaitMs: stability.adaptiveWaitMs };
}

function fixtureMap(config: SpaRouterContractConfig): Map<string, SpaRouterFixture> {
  return new Map((config.fixtures ?? []).map((fixture) => [`${(fixture.method ?? "GET").toUpperCase()} ${fixture.path}`, fixture]));
}

async function executeScenario(browser: Browser, baseUrl: string, config: SpaRouterContractConfig, scenario: SpaRouterScenario, options: { viewport?: QualityViewport; role?: SpaRouterTargetRole; captureVisual?: boolean } = {}): Promise<SpaRouterScenarioExecution> {
  const viewport = options.viewport ?? { id: "contract", label: "Contract", width: 1024, height: 768 };
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
  const runtimeErrors: string[] = [], unmockedApiRequests: string[] = [];
  try {
    await initializeRouterTracking(context, config.ignoredStateKeys ?? []);
    if (options.captureVisual) await initializeVisualStabilityTracking(context);
    const fixtures = fixtureMap(config);
    await context.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url());
      const fixture = fixtures.get(`${request.method().toUpperCase()} ${url.pathname}`);
      if (fixture) {
        await route.fulfill({ status: fixture.status ?? 200, headers: { "content-type": "application/json; charset=utf-8", ...(fixture.headers ?? {}) }, body: JSON.stringify(fixture.body) });
        return;
      }
      if (config.apiPrefix && url.pathname.startsWith(config.apiPrefix)) {
        unmockedApiRequests.push(`${request.method()} ${url.pathname}`);
        await route.fulfill({ status: 501, contentType: "application/json", body: JSON.stringify({ code: 501, message: "unmocked SPA router fixture" }) });
        return;
      }
      await route.continue();
    });
    const page = await context.newPage();
    const requestActivity: RequestActivity = { active: new Set<Request>(), lastActivityAt: Date.now() };
    page.on("request", (request) => { requestActivity.active.add(request); requestActivity.lastActivityAt = Date.now(); });
    page.on("requestfinished", (request) => { requestActivity.active.delete(request); requestActivity.lastActivityAt = Date.now(); });
    page.on("requestfailed", (request) => { requestActivity.active.delete(request); requestActivity.lastActivityAt = Date.now(); });
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error" && !/^Failed to load resource:/i.test(message.text())) runtimeErrors.push(message.text()); });
    const entryUrl = targetUrl(baseUrl, scenario.entryPath);
    await page.goto(entryUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await settle(page, 500);
    for (const step of scenario.steps) await executeStep(page, step);
    const assertionFailures = await assertScenario(page, scenario.assertions);
    const transitions = await page.evaluate(() => ([...((globalThis as typeof globalThis & { __uiDismantlerSpaTransitions?: SpaRouterTransition[] }).__uiDismantlerSpaTransitions ?? [])]));
    const uniqueRuntimeErrors = [...new Set(runtimeErrors)], uniqueUnmocked = [...new Set(unmockedApiRequests)];
    const result: SpaRouterScenarioResult = { id: scenario.id, passed: assertionFailures.length === 0 && uniqueRuntimeErrors.length === 0 && uniqueUnmocked.length === 0, entryUrl, finalUrl: page.url(), transitions, runtimeErrors: uniqueRuntimeErrors, unmockedApiRequests: uniqueUnmocked, assertionFailures };
    const visual = options.captureVisual && scenario.visual ? await captureVisualState(page, scenario.visual, options.role ?? "single", requestActivity, config.visualMatrix?.stabilityTimeoutMs) : undefined;
    return { result, visual };
  } finally { await context.close(); }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex; nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function evaluateTarget(browser: Browser, baseUrl: string, config: SpaRouterContractConfig, options: { role?: SpaRouterTargetRole; visualViewport?: QualityViewport } = {}): Promise<SpaRouterTargetEvaluation> {
  const concurrency = config.execution?.contractConcurrency ?? 1;
  const orderedExecutions = await mapWithConcurrency(config.scenarios, concurrency, async (scenario) => {
    const captureVisual = Boolean(options.visualViewport && scenario.visual);
    return executeScenario(browser, baseUrl, config, scenario, { viewport: options.visualViewport, role: options.role, captureVisual });
  });
  const executions = new Map(config.scenarios.map((scenario, index) => [scenario.id, orderedExecutions[index]]));
  const results = [...executions.values()].map((execution) => execution.result);
  return {
    report: {
      baseUrl, passed: results.every((result) => result.passed),
      scenariosPassed: results.filter((result) => result.passed).length, scenariosTotal: results.length,
      runtimeErrors: results.reduce((sum, result) => sum + result.runtimeErrors.length, 0),
      unmockedApiRequests: results.reduce((sum, result) => sum + result.unmockedApiRequests.length, 0), results,
    },
    executions,
  };
}

function compareScenario(id: string, reference: SpaRouterScenarioResult | undefined, generated: SpaRouterScenarioResult | undefined): SpaRouterScenarioComparison {
  const failures: SpaRouterComparisonFailure[] = [];
  if (!reference) failures.push({ reason: "missing-reference-scenario", detail: `reference 缺少场景 ${id}` });
  if (!generated) failures.push({ reason: "missing-generated-scenario", detail: `generated 缺少场景 ${id}` });
  if (!reference || !generated) return { id, passed: false, reference, generated, failures };
  if (reference.assertionFailures.length) failures.push({ reason: "reference-assertion-failure", reference: reference.assertionFailures.join("; "), detail: `reference 场景断言失败: ${reference.assertionFailures.join("; ")}` });
  if (generated.assertionFailures.length) failures.push({ reason: "generated-assertion-failure", generated: generated.assertionFailures.join("; "), detail: `generated 场景断言失败: ${generated.assertionFailures.join("; ")}` });
  if (reference.transitions.length !== generated.transitions.length) failures.push({ reason: "transition-count-mismatch", reference: reference.transitions.length, generated: generated.transitions.length, detail: `transition 数量 reference=${reference.transitions.length} generated=${generated.transitions.length}` });
  const totalTransitions = Math.max(reference.transitions.length, generated.transitions.length);
  for (let index = 0; index < totalTransitions; index += 1) {
    const expected = reference.transitions[index], actual = generated.transitions[index];
    if (!expected || !actual) continue;
    if (expected.method !== actual.method) failures.push({ reason: "transition-method-mismatch", transitionIndex: index, reference: expected.method, generated: actual.method, detail: `transition[${index}] method reference=${expected.method} generated=${actual.method}` });
    if (expected.target !== actual.target) failures.push({ reason: "transition-target-mismatch", transitionIndex: index, reference: expected.target, generated: actual.target, detail: `transition[${index}] target reference=${expected.target} generated=${actual.target}` });
    if (expected.state !== actual.state) failures.push({ reason: "transition-state-mismatch", transitionIndex: index, reference: expected.state, generated: actual.state, detail: `transition[${index}] state reference=${expected.state} generated=${actual.state}` });
  }
  const referenceRoute = routeOf(reference.finalUrl), generatedRoute = routeOf(generated.finalUrl);
  if (referenceRoute !== generatedRoute) failures.push({ reason: "final-route-mismatch", reference: referenceRoute, generated: generatedRoute, detail: `final route reference=${referenceRoute} generated=${generatedRoute}` });
  return { id, passed: failures.length === 0 && reference.passed && generated.passed, reference, generated, failures };
}

function navigationIntegrityForComparisons(comparisons: SpaRouterScenarioComparison[]): SpaRouterNavigationIntegrityReport {
  const failureCounts = comparisons.map((comparison) => comparison.failures.filter((failure) => NAVIGATION_FAILURE_REASONS.has(failure.reason)).length);
  const failures = failureCounts.reduce((sum, count) => sum + count, 0), matchedScenarios = failureCounts.filter((count) => count === 0).length;
  return { passed: failures === 0 && matchedScenarios === comparisons.length, rate: comparisons.length ? matchedScenarios / comparisons.length : 0, matchedScenarios, totalScenarios: comparisons.length, failures };
}

async function evaluateVisualMatrix(browser: Browser, config: SpaRouterContractConfig, referenceBaseUrl: string, generatedBaseUrl: string, referenceEvaluation: SpaRouterTargetEvaluation, generatedEvaluation: SpaRouterTargetEvaluation, reusableViewport?: QualityViewport): Promise<SpaRouterVisualMatrixReport | undefined> {
  const visualConfig = config.visualMatrix;
  if (!visualConfig) return undefined;
  const viewports = visualConfig.viewports ?? DEFAULT_VISUAL_VIEWPORTS;
  const pixelThreshold = visualConfig.pixelThreshold ?? 0.02, styleThreshold = visualConfig.styleThreshold ?? 0.98;
  let reusedTargetRuns = 0, freshTargetRuns = 0;
  const matrices: SpaRouterScenarioVisualMatrix[] = [];
  for (const scenario of config.scenarios.filter((item) => item.visual)) {
    const scenarioStartedAt = performance.now();
    const viewportResults = await mapWithConcurrency(viewports, config.execution?.visualConcurrency ?? 1, async (viewport): Promise<SpaRouterVisualViewportResult> => {
      const viewportStartedAt = performance.now();
      const canReuse = Boolean(reusableViewport && viewport.width === reusableViewport.width && viewport.height === reusableViewport.height);
      const referenceReuse = canReuse ? referenceEvaluation.executions.get(scenario.id) : undefined;
      const generatedReuse = canReuse ? generatedEvaluation.executions.get(scenario.id) : undefined;
      const [reference, generated] = await Promise.all([
        referenceReuse?.visual ? Promise.resolve(referenceReuse) : executeScenario(browser, referenceBaseUrl, config, scenario, { viewport, role: "reference", captureVisual: true }),
        generatedReuse?.visual ? Promise.resolve(generatedReuse) : executeScenario(browser, generatedBaseUrl, config, scenario, { viewport, role: "generated", captureVisual: true }),
      ]);
      reusedTargetRuns += Number(Boolean(referenceReuse?.visual)) + Number(Boolean(generatedReuse?.visual));
      freshTargetRuns += Number(!referenceReuse?.visual) + Number(!generatedReuse?.visual);
      if (!reference.visual || !generated.visual) throw new Error(`场景 ${scenario.id} 的 visual capture 未生成`);
      const comparison = compareScenario(scenario.id, reference.result, generated.result);
      const navigationFailures = comparison.failures.filter((failure) => NAVIGATION_FAILURE_REASONS.has(failure.reason));
      const styles = compareComputedStyles(reference.visual.styles, generated.visual.styles);
      const artifactDir = visualConfig.artifactDir ? resolve(visualConfig.artifactDir, scenario.id, viewport.id) : undefined;
      const pixels = await comparePixels(reference.visual.screenshot, generated.visual.screenshot, pixelThreshold, artifactDir);
      const captureFailures = [...reference.visual.failures.map((failure) => `reference: ${failure}`), ...generated.visual.failures.map((failure) => `generated: ${failure}`)];
      const runtimeErrors = reference.result.runtimeErrors.length + generated.result.runtimeErrors.length;
      const unmockedApiRequests = reference.result.unmockedApiRequests.length + generated.result.unmockedApiRequests.length;
      return {
        ...viewport, passed: comparison.passed && navigationFailures.length === 0 && captureFailures.length === 0 && styles.rate >= styleThreshold && pixels.passed,
        referenceFinalRoute: routeOf(reference.result.finalUrl), generatedFinalRoute: routeOf(generated.result.finalUrl),
        referenceAnchor: reference.visual.anchor, generatedAnchor: generated.visual.anchor,
        runtimeErrors, unmockedApiRequests, stabilityFailures: [...reference.visual.stabilityFailures, ...generated.visual.stabilityFailures], adaptiveWaitMs: reference.visual.adaptiveWaitMs + generated.visual.adaptiveWaitMs, durationMs: Number((performance.now() - viewportStartedAt).toFixed(3)), navigationPassed: navigationFailures.length === 0, navigationFailures, captureFailures, styles, pixels,
      };
    });
    matrices.push({ scenarioId: scenario.id, passed: viewportResults.every((viewport) => viewport.passed), viewports: viewportResults, worstComputedStyle: Math.min(...viewportResults.map((viewport) => viewport.styles.rate)), worstPixelDiff: Math.max(...viewportResults.map((viewport) => viewport.pixels.diffRate)), durationMs: Number((performance.now() - scenarioStartedAt).toFixed(3)) });
  }
  const entries = matrices.flatMap((matrix) => matrix.viewports);
  return {
    passed: matrices.length > 0 && matrices.every((matrix) => matrix.passed), scenarios: matrices, scenarioCount: matrices.length, viewportRuns: entries.length,
    runtimeErrors: entries.reduce((sum, entry) => sum + entry.runtimeErrors, 0), unmockedApiRequests: entries.reduce((sum, entry) => sum + entry.unmockedApiRequests, 0),
    navigationFailures: entries.reduce((sum, entry) => sum + entry.navigationFailures.length, 0), navigationMatchedRuns: entries.filter((entry) => entry.navigationPassed).length,
    stabilityFailures: entries.reduce((sum, entry) => sum + entry.stabilityFailures.length, 0), adaptiveWaitMs: entries.reduce((sum, entry) => sum + entry.adaptiveWaitMs, 0),
    worstComputedStyle: entries.length ? Math.min(...entries.map((entry) => entry.styles.rate)) : 0, worstPixelDiff: entries.length ? Math.max(...entries.map((entry) => entry.pixels.diffRate)) : 1,
    styleThreshold, pixelThreshold,
    targetRuns: reusedTargetRuns + freshTargetRuns, reusedTargetRuns, freshTargetRuns,
  };
}

function assertionPassCount(target: SpaRouterTargetReport): number { return target.results.filter((result) => result.assertionFailures.length === 0).length; }

function singleQualityGates(target: SpaRouterTargetReport): SpaRouterQualityGate[] {
  const assertionsPassed = assertionPassCount(target);
  return [
    { id: "scenario-protocol", passed: assertionsPassed === target.scenariosTotal, detail: `${assertionsPassed}/${target.scenariosTotal} 场景断言通过` },
    { id: "visual-runtime", passed: target.runtimeErrors === 0, detail: `runtimeErrors=${target.runtimeErrors}` },
    { id: "resource-readiness", passed: target.unmockedApiRequests === 0, detail: `unmockedApiRequests=${target.unmockedApiRequests}` },
    { id: "navigation-integrity", passed: assertionsPassed === target.scenariosTotal, detail: `source-only contract=${assertionsPassed}/${target.scenariosTotal}` },
  ];
}

function comparisonQualityGates(reference: SpaRouterTargetReport, generated: SpaRouterTargetReport, navigationIntegrity: SpaRouterNavigationIntegrityReport, visualMatrix?: SpaRouterVisualMatrixReport): SpaRouterQualityGate[] {
  const referenceAssertions = assertionPassCount(reference), generatedAssertions = assertionPassCount(generated);
  const gates: SpaRouterQualityGate[] = [
    { id: "scenario-protocol", passed: referenceAssertions === reference.scenariosTotal && generatedAssertions === generated.scenariosTotal, detail: `reference=${referenceAssertions}/${reference.scenariosTotal}，generated=${generatedAssertions}/${generated.scenariosTotal}` },
    { id: "visual-runtime", passed: reference.runtimeErrors + generated.runtimeErrors + (visualMatrix?.runtimeErrors ?? 0) === 0 && (visualMatrix?.stabilityFailures ?? 0) === 0, detail: `referenceRuntimeErrors=${reference.runtimeErrors}，generatedRuntimeErrors=${generated.runtimeErrors}，visualRuntimeErrors=${visualMatrix?.runtimeErrors ?? 0}，stabilityFailures=${visualMatrix?.stabilityFailures ?? 0}` },
    { id: "resource-readiness", passed: reference.unmockedApiRequests + generated.unmockedApiRequests + (visualMatrix?.unmockedApiRequests ?? 0) === 0, detail: `referenceUnmockedApi=${reference.unmockedApiRequests}，generatedUnmockedApi=${generated.unmockedApiRequests}，visualUnmockedApi=${visualMatrix?.unmockedApiRequests ?? 0}` },
    { id: "navigation-integrity", passed: navigationIntegrity.passed, detail: `matched=${navigationIntegrity.matchedScenarios}/${navigationIntegrity.totalScenarios}，rate=${navigationIntegrity.rate}，failures=${navigationIntegrity.failures}` },
  ];
  if (visualMatrix) gates.splice(1, 0, { id: "scenario-viewport-matrix", passed: visualMatrix.passed, detail: `${visualMatrix.scenarios.filter((matrix) => matrix.passed).length}/${visualMatrix.scenarioCount} SPA route states 通过，viewportRuns=${visualMatrix.viewportRuns}，worstComputedStyle=${visualMatrix.worstComputedStyle}，worstPixelDiff=${visualMatrix.worstPixelDiff}` });
  return gates;
}

export async function evaluateSpaRouterContract(config: SpaRouterContractConfig, options: { executablePath?: string } = {}): Promise<SpaRouterContractReport> {
  const totalStartedAt = performance.now();
  const timing = { browserLaunchMs: 0, contractMs: 0, comparisonMs: 0, visualMatrixMs: 0, browserCloseMs: 0, totalMs: 0 };
  const elapsed = (startedAt: number): number => Number((performance.now() - startedAt).toFixed(3));
  const resolved = validateConfig(config);
  let phaseStartedAt = performance.now();
  const browser: Browser = await chromium.launch({ executablePath: chromePath(options.executablePath), headless: true });
  timing.browserLaunchMs = elapsed(phaseStartedAt);
  try {
    if (resolved.mode === "single") {
      phaseStartedAt = performance.now();
      const targetEvaluation = await evaluateTarget(browser, resolved.baseUrl, config), target = targetEvaluation.report;
      timing.contractMs = elapsed(phaseStartedAt);
      const qualityGates = singleQualityGates(target);
      return {
        schemaVersion: "1.0", mode: "single", baseUrl: resolved.baseUrl, passed: qualityGates.every((gate) => gate.passed),
        scenariosPassed: target.scenariosPassed, scenariosTotal: target.scenariosTotal, runtimeErrors: target.runtimeErrors, unmockedApiRequests: target.unmockedApiRequests,
        results: target.results, navigationIntegrity: { passed: target.passed, rate: target.scenariosTotal ? target.scenariosPassed / target.scenariosTotal : 0, matchedScenarios: target.scenariosPassed, totalScenarios: target.scenariosTotal, failures: target.scenariosTotal - target.scenariosPassed },
        telemetry: { contractTargetRuns: target.scenariosTotal, visualViewportRuns: 0, visualTargetRuns: 0, visualTargetReusedRuns: 0, visualTargetFreshRuns: 0, visualStabilityFailures: 0, visualAdaptiveWaitMs: 0, contractConcurrency: config.execution?.contractConcurrency ?? 1, visualConcurrency: config.execution?.visualConcurrency ?? 1, timing }, qualityGates,
      };
    }
    const visualViewports = config.visualMatrix?.viewports ?? (config.visualMatrix ? DEFAULT_VISUAL_VIEWPORTS : []);
    const reusableViewport = visualViewports.find((viewport) => viewport.width === 1024 && viewport.height === 768);
    phaseStartedAt = performance.now();
    const [referenceEvaluation, generatedEvaluation] = await Promise.all([
      evaluateTarget(browser, resolved.referenceBaseUrl, config, { role: "reference", visualViewport: reusableViewport }),
      evaluateTarget(browser, resolved.generatedBaseUrl, config, { role: "generated", visualViewport: reusableViewport }),
    ]);
    timing.contractMs = elapsed(phaseStartedAt);
    const reference = referenceEvaluation.report, generated = generatedEvaluation.report;
    phaseStartedAt = performance.now();
    const referenceById = new Map(reference.results.map((result) => [result.id, result])), generatedById = new Map(generated.results.map((result) => [result.id, result]));
    const scenarioIds = [...new Set([...config.scenarios.map((scenario) => scenario.id), ...referenceById.keys(), ...generatedById.keys()])];
    const comparisons = scenarioIds.map((id) => compareScenario(id, referenceById.get(id), generatedById.get(id)));
    const baseNavigationIntegrity = navigationIntegrityForComparisons(comparisons);
    timing.comparisonMs = elapsed(phaseStartedAt);
    phaseStartedAt = performance.now();
    const visualMatrix = await evaluateVisualMatrix(browser, config, resolved.referenceBaseUrl, resolved.generatedBaseUrl, referenceEvaluation, generatedEvaluation, reusableViewport);
    timing.visualMatrixMs = elapsed(phaseStartedAt);
    phaseStartedAt = performance.now();
    const visualNavigationRuns = visualMatrix?.viewportRuns ?? 0, visualNavigationMatched = visualMatrix?.navigationMatchedRuns ?? 0, visualNavigationFailures = visualMatrix?.navigationFailures ?? 0;
    const totalNavigationRuns = baseNavigationIntegrity.totalScenarios + visualNavigationRuns, matchedNavigationRuns = baseNavigationIntegrity.matchedScenarios + visualNavigationMatched;
    const navigationIntegrity: SpaRouterNavigationIntegrityReport = {
      passed: baseNavigationIntegrity.failures + visualNavigationFailures === 0 && matchedNavigationRuns === totalNavigationRuns,
      rate: totalNavigationRuns ? matchedNavigationRuns / totalNavigationRuns : 0, matchedScenarios: matchedNavigationRuns, totalScenarios: totalNavigationRuns, failures: baseNavigationIntegrity.failures + visualNavigationFailures,
    };
    const qualityGates = comparisonQualityGates(reference, generated, navigationIntegrity, visualMatrix);
    timing.comparisonMs = Number((timing.comparisonMs + elapsed(phaseStartedAt)).toFixed(3));
    return {
      schemaVersion: "1.0", mode: "reference-generated", referenceBaseUrl: resolved.referenceBaseUrl, generatedBaseUrl: resolved.generatedBaseUrl,
      passed: qualityGates.every((gate) => gate.passed), scenariosPassed: comparisons.filter((comparison) => comparison.passed).length, scenariosTotal: comparisons.length,
      runtimeErrors: reference.runtimeErrors + generated.runtimeErrors + (visualMatrix?.runtimeErrors ?? 0), unmockedApiRequests: reference.unmockedApiRequests + generated.unmockedApiRequests + (visualMatrix?.unmockedApiRequests ?? 0),
      results: generated.results, reference, generated, comparisons, navigationIntegrity, visualMatrix,
      telemetry: {
        contractTargetRuns: reference.scenariosTotal + generated.scenariosTotal,
        visualViewportRuns: visualMatrix?.viewportRuns ?? 0,
        visualTargetRuns: visualMatrix?.targetRuns ?? 0,
        visualTargetReusedRuns: visualMatrix?.reusedTargetRuns ?? 0,
        visualTargetFreshRuns: visualMatrix?.freshTargetRuns ?? 0,
        visualStabilityFailures: visualMatrix?.stabilityFailures ?? 0,
        visualAdaptiveWaitMs: visualMatrix?.adaptiveWaitMs ?? 0,
        contractConcurrency: config.execution?.contractConcurrency ?? 1,
        visualConcurrency: config.execution?.visualConcurrency ?? 1,
        timing,
      },
      qualityGates,
    };
  } finally {
    phaseStartedAt = performance.now();
    await browser.close();
    timing.browserCloseMs = elapsed(phaseStartedAt);
    timing.totalMs = elapsed(totalStartedAt);
  }
}
