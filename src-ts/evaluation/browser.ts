import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { chromium, type Browser, type BrowserContext, type Page, type Request, type Route } from "playwright-core";
import type {
  BrowserQualityReport,
  ComputedStyleSnapshot,
  PixelDiffReport,
  BrowserQualityMatrixReport,
  BrowserViewportReport,
  QualityViewport,
  Scenario,
  ScenarioAssertion,
  SelectorCoverageReport,
  StyleComparisonReport,
  VisualResourceFailure,
  VisualResourceType,
} from "../types.js";

const STYLE_PROPERTIES = [
  "display", "position", "visibility", "opacity", "box-sizing",
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "top", "right", "bottom", "left", "inset", "transform", "transform-origin",
  "flex-direction", "flex-wrap", "justify-content", "align-items", "align-content", "gap",
  "grid-template-columns", "grid-template-rows", "grid-auto-flow",
  "overflow", "overflow-x", "overflow-y", "z-index",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "background-color", "background-image", "color", "border-top-width", "border-right-width",
  "border-bottom-width", "border-left-width", "border-top-color", "border-radius",
  "box-shadow", "font-size", "font-weight", "line-height", "text-align",
] as const;
const ADAPTIVE_STABILITY_TIMEOUT_MS = 1200;

interface BrowserSnapshot {
  ok: boolean;
  runtimeErrors: string[];
  stabilityFailures: string[];
  resourceFailures: VisualResourceFailure[];
  selectorCoverage: SelectorCoverageReport;
  classEvidence: Array<{ className: string; count: number; hasSelector: boolean }>;
  styles: ComputedStyleSnapshot[];
  screenshot: Buffer;
}

interface RuntimeErrorTracker {
  errors: string[];
  reset(): void;
}

function trackRuntimeErrors(page: Page): RuntimeErrorTracker {
  const tracker: RuntimeErrorTracker = { errors: [], reset() { this.errors.length = 0; } };
  page.on("pageerror", (error) => tracker.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/^Failed to load resource:/i.test(text)) return;
    tracker.errors.push(text);
  });
  return tracker;
}

async function initializeQualityContext(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* unavailable for this origin */ }
    const installStabilityStyle = (): void => {
      if (document.getElementById("ui-dismantler-stability-style")) return;
      const parent = document.head ?? document.documentElement;
      if (!parent) return;
      const style = document.createElement("style");
      style.id = "ui-dismantler-stability-style";
      style.textContent = "*,*::before,*::after{animation-delay:0s!important;animation-duration:0s!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}::-webkit-scrollbar{display:none!important}";
      parent.appendChild(style);
    };
    installStabilityStyle();
    if (!document.getElementById("ui-dismantler-stability-style")) document.addEventListener("DOMContentLoaded", installStabilityStyle, { once: true });
    let state = 0x6d2b79f5;
    Math.random = () => {
      state = Math.imul(state ^ state >>> 15, state | 1);
      state ^= state + Math.imul(state ^ state >>> 7, state | 61);
      return ((state ^ state >>> 14) >>> 0) / 4294967296;
    };
    const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
    const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);
    const pendingTimers = new Map<number, number>();
    const timerState = globalThis as typeof globalThis & { __uiDismantlerPendingTimers?: () => number[] };
    timerState.__uiDismantlerPendingTimers = () => [...pendingTimers.values()];
    globalThis.setTimeout = ((handler: TimerHandler, timeout = 0, ...args: unknown[]) => {
      if (typeof handler !== "function") return nativeSetTimeout(handler, timeout, ...args);
      let timerId = 0;
      timerId = nativeSetTimeout((...callbackArgs: unknown[]) => {
        pendingTimers.delete(timerId);
        handler(...callbackArgs);
      }, timeout, ...args) as unknown as number;
      if (timeout > 0 && timeout <= 1000) pendingTimers.set(timerId, performance.now() + timeout);
      return timerId;
    }) as typeof globalThis.setTimeout;
    globalThis.clearTimeout = ((timerId?: number) => {
      if (typeof timerId === "number") pendingTimers.delete(timerId);
      return nativeClearTimeout(timerId);
    }) as typeof globalThis.clearTimeout;
  });
}

interface CachedResource {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  cacheable: boolean;
}

type RunResourceCache = Map<string, Promise<CachedResource>>;

function cacheableRequest(route: Route): boolean {
  const request = route.request();
  const headers = request.headers();
  return request.method() === "GET"
    && /^https?:\/\//i.test(request.url())
    && ["image", "font"].includes(request.resourceType())
    && !headers.authorization
    && !headers.cookie;
}

async function installRunResourceCache(context: BrowserContext, cache: RunResourceCache, telemetry: BrowserExecutionTelemetry): Promise<void> {
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (/^https?:\/\//i.test(request.url())) telemetry.workload.remoteRequests += 1;
    if (!cacheableRequest(route)) { await route.continue(); return; }
    const key = `${request.method()}|${request.resourceType()}|${request.headers().accept ?? ""}|${request.url()}`;
    let cached = cache.get(key);
    if (cached) telemetry.workload.resourceCacheHits += 1;
    else {
      telemetry.workload.resourceCacheMisses += 1;
      cached = (async () => {
        const response = await route.fetch({ timeout: 15000 });
        const cacheable = response.status() >= 200 && response.status() < 300;
        const body = await response.body();
        const headers = { ...response.headers() };
        delete headers["content-encoding"];
        delete headers["content-length"];
        delete headers["transfer-encoding"];
        delete headers["set-cookie"];
        if (cacheable) telemetry.workload.resourceCacheBytes += body.length;
        return { status: response.status(), headers, body, cacheable };
      })();
      cache.set(key, cached);
      cached.catch(() => cache.delete(key));
    }
    try {
      const response = await cached;
      if (!response.cacheable) cache.delete(key);
      await route.fulfill({ status: response.status, headers: response.headers, body: response.body });
    } catch {
      await route.continue();
    }
  });
}

export interface BrowserQualityOptions {
  width?: number;
  height?: number;
  pixelThreshold?: number;
  selectorCoverageThreshold?: number;
  styleThreshold?: number;
  artifactDir?: string;
  executablePath?: string;
  stabilityMode?: "fixed" | "adaptive";
}

export interface BrowserQualityMatrixOptions extends Omit<BrowserQualityOptions, "width" | "height"> {
  viewports?: QualityViewport[];
  concurrency?: number;
  resourceCache?: "off" | "run-local";
}

export interface BrowserExecutionTelemetry {
  mode: "legacy" | "shared-browser";
  concurrency: number;
  resourceCache: "off" | "run-local";
  stabilityMode: "fixed" | "adaptive";
  timing: {
    launchMs: number;
    contextCreateMs: number;
    contextInitMs: number;
    pageCreateMs: number;
    navigationMs: number;
    settleMs: number;
    domStabilityMs: number;
    networkIdleMs: number;
    fixedWaitMs: number;
    resourceScanMs: number;
    signatureScanMs: number;
    scenarioExecutionMs: number;
    scrollAnchorMs: number;
    snapshotEvaluationMs: number;
    screenshotMs: number;
    pixelDiffMs: number;
    artifactWriteMs: number;
    closeMs: number;
    totalMs: number;
  };
  workload: {
    browserLaunches: number;
    contextsCreated: number;
    pagesCreated: number;
    pagePairsCreatedInParallel: number;
    navigations: number;
    viewportRuns: number;
    scenarioMatrices: number;
    scenarioSteps: number;
    stabilityChecks: number;
    stabilityTimeouts: number;
    assertionStabilityChecks: number;
    assertionStabilityTimeouts: number;
    networkIdleTimeouts: number;
    timerAwareWaits: number;
    timerDrainTimeouts: number;
    resourceAwareWaits: number;
    resourceDrainTimeouts: number;
    stylesheetAwareWaits: number;
    backgroundImageAwareWaits: number;
    fontAwareWaits: number;
    resourceFullScans: number;
    resourceIncrementalScans: number;
    resourceElementsScanned: number;
    resourcePseudoElementsScanned: number;
    resourceUrlsDiscovered: number;
    signatureFullScans: number;
    signatureIncrementalScans: number;
    signatureNodesScanned: number;
    signatureMutationInvalidations: number;
    signatureResizeInvalidations: number;
    signatureScrollInvalidations: number;
    examplePathCacheHits: number;
    examplePathCacheMisses: number;
    explicitWaits: number;
    adaptiveExplicitWaits: number;
    scrollAnchorNormalizations: number;
    screenshots: number;
    remoteRequests: number;
    resourceCacheHits: number;
    resourceCacheMisses: number;
    resourceCacheBytes: number;
  };
}

export interface BrowserQualitySuiteReport {
  initial: Awaited<ReturnType<typeof evaluateBrowserQualityMatrixInternal>>;
  scenarios: Array<{ scenarioId: string; label?: string; evaluation: Awaited<ReturnType<typeof evaluateBrowserQualityMatrixInternal>> }>;
  phaseTiming: { initialMatrixMs: number; scenarioMatricesMs: number };
  telemetry: BrowserExecutionTelemetry;
}

function createBrowserTelemetry(mode: BrowserExecutionTelemetry["mode"], concurrency: number, resourceCache: BrowserExecutionTelemetry["resourceCache"] = "off", stabilityMode: BrowserExecutionTelemetry["stabilityMode"] = "fixed"): BrowserExecutionTelemetry {
  return {
    mode,
    concurrency,
    resourceCache,
    stabilityMode,
    timing: { launchMs: 0, contextCreateMs: 0, contextInitMs: 0, pageCreateMs: 0, navigationMs: 0, settleMs: 0, domStabilityMs: 0, networkIdleMs: 0, fixedWaitMs: 0, resourceScanMs: 0, signatureScanMs: 0, scenarioExecutionMs: 0, scrollAnchorMs: 0, snapshotEvaluationMs: 0, screenshotMs: 0, pixelDiffMs: 0, artifactWriteMs: 0, closeMs: 0, totalMs: 0 },
    workload: { browserLaunches: 0, contextsCreated: 0, pagesCreated: 0, pagePairsCreatedInParallel: 0, navigations: 0, viewportRuns: 0, scenarioMatrices: 0, scenarioSteps: 0, stabilityChecks: 0, stabilityTimeouts: 0, assertionStabilityChecks: 0, assertionStabilityTimeouts: 0, networkIdleTimeouts: 0, timerAwareWaits: 0, timerDrainTimeouts: 0, resourceAwareWaits: 0, resourceDrainTimeouts: 0, stylesheetAwareWaits: 0, backgroundImageAwareWaits: 0, fontAwareWaits: 0, resourceFullScans: 0, resourceIncrementalScans: 0, resourceElementsScanned: 0, resourcePseudoElementsScanned: 0, resourceUrlsDiscovered: 0, signatureFullScans: 0, signatureIncrementalScans: 0, signatureNodesScanned: 0, signatureMutationInvalidations: 0, signatureResizeInvalidations: 0, signatureScrollInvalidations: 0, examplePathCacheHits: 0, examplePathCacheMisses: 0, explicitWaits: 0, adaptiveExplicitWaits: 0, scrollAnchorNormalizations: 0, screenshots: 0, remoteRequests: 0, resourceCacheHits: 0, resourceCacheMisses: 0, resourceCacheBytes: 0 },
  };
}

const elapsed = (startedAt: number): number => Number((performance.now() - startedAt).toFixed(3));

export const DEFAULT_QUALITY_VIEWPORTS: QualityViewport[] = [
  { id: "desktop", label: "Desktop", width: 1024, height: 768 },
  { id: "tablet", label: "Tablet portrait", width: 768, height: 1024 },
  { id: "mobile", label: "Mobile", width: 390, height: 844 },
  { id: "tiny", label: "Extreme mobile", width: 320, height: 568 },
];

export function resolveQualityViewports(value?: string): QualityViewport[] {
  if (!value) return DEFAULT_QUALITY_VIEWPORTS.map((viewport) => ({ ...viewport }));
  const byId = new Map(DEFAULT_QUALITY_VIEWPORTS.map((viewport) => [viewport.id, viewport]));
  const selected = value.split(",").map((item) => item.trim()).filter(Boolean).map((id) => byId.get(id));
  if (!selected.length || selected.some((viewport) => !viewport)) throw new Error(`未知质量视口：${value}；可选值：${DEFAULT_QUALITY_VIEWPORTS.map((viewport) => viewport.id).join(",")}`);
  return selected.map((viewport) => ({ ...viewport as QualityViewport }));
}

function chromeCandidates(): string[] {
  return [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((value): value is string => Boolean(value));
}

async function launchBrowser(executablePath?: string): Promise<Browser> {
  const candidate = executablePath ?? chromeCandidates().find(existsSync);
  if (!candidate) throw new Error("未找到 Chrome/Chromium；可通过 CHROME_PATH 指定浏览器路径");
  return chromium.launch({ executablePath: candidate, headless: true, args: ["--allow-file-access-from-files", "--disable-web-security"] });
}

const examplePathCache = new Map<string, Promise<string>>();

async function firstExample(libDir: string, telemetry?: BrowserExecutionTelemetry): Promise<string> {
  const dir = resolve(libDir, "examples");
  const cached = examplePathCache.get(dir);
  if (cached) {
    if (telemetry) telemetry.workload.examplePathCacheHits += 1;
    return cached;
  }
  if (telemetry) telemetry.workload.examplePathCacheMisses += 1;
  const pending = readdir(dir).then((names) => {
    const examples = names.filter((name) => name.endsWith(".html")).sort();
    if (!examples.length) throw new Error(`${dir} 下没有 HTML example`);
    return resolve(dir, examples[0]);
  });
  examplePathCache.set(dir, pending);
  try {
    return await pending;
  } catch (error) {
    examplePathCache.delete(dir);
    throw error;
  }
}

interface NetworkResourceRecord {
  url: string;
  type: string;
  state: "pending" | "completed" | "http-error" | "request-failed";
  status?: number;
  failure?: string;
  startedAt: number;
  endedAt?: number;
}

interface NetworkActivityTracker {
  pending: Set<Request>;
  records: Map<Request, NetworkResourceRecord>;
  lastActivityAt: number;
  observed: number;
}

interface ResolvedScenarioAssertion extends Omit<ScenarioAssertion, "target" | "classIncludes" | "classExcludes"> {
  target: string;
  actionable?: boolean;
  classIncludes?: string[];
  classExcludes?: string[];
}

interface PageStabilityResult {
  stable: boolean;
  assertionsSatisfied: boolean;
  domTimedOut: boolean;
  networkTimedOut: boolean;
  timerTimedOut: boolean;
  resourceTimedOut: boolean;
  resourceFailed: boolean;
  resourceFailures: VisualResourceFailure[];
}

interface VisualResourceReference {
  url: string;
  type: VisualResourceType;
  owner: string;
  pseudo?: "::before" | "::after";
  state: "loaded" | "pending" | "decode-error" | "font-loading";
  required?: boolean;
}

interface DomStabilityProbeResult {
  stable: boolean;
  assertionsSatisfied: boolean;
  timersSettled: boolean;
  resourcesSettled: boolean;
  waitedForTimers: boolean;
  waitedForResources: boolean;
  waitedForStylesheets: boolean;
  waitedForBackgroundImages: boolean;
  waitedForFonts: boolean;
  resourceReferences: VisualResourceReference[];
  resourceScan: {
    fullScans: number;
    incrementalScans: number;
    elementsScanned: number;
    pseudoElementsScanned: number;
    urlsDiscovered: number;
    elapsedMs: number;
  };
  signatureScan: {
    fullScans: number;
    incrementalScans: number;
    nodesScanned: number;
    mutationInvalidations: number;
    resizeInvalidations: number;
    scrollInvalidations: number;
    elapsedMs: number;
  };
}

function trackNetworkActivity(page: Page): NetworkActivityTracker {
  const tracker: NetworkActivityTracker = { pending: new Set(), records: new Map(), lastActivityAt: 0, observed: 0 };
  const relevant = (request: Request): boolean => /^https?:\/\//i.test(request.url());
  page.on("request", (request) => {
    if (!relevant(request)) return;
    const now = performance.now();
    tracker.pending.add(request);
    tracker.records.set(request, { url: request.url(), type: request.resourceType(), state: "pending", startedAt: now });
    tracker.lastActivityAt = now;
    tracker.observed += 1;
  });
  page.on("response", (response) => {
    const record = tracker.records.get(response.request());
    if (!record) return;
    record.status = response.status();
    if (response.status() >= 400) record.state = "http-error";
  });
  page.on("requestfinished", (request) => {
    const now = performance.now();
    tracker.pending.delete(request);
    const record = tracker.records.get(request);
    if (record) {
      if (record.state !== "http-error") record.state = "completed";
      record.endedAt = now;
    }
    tracker.lastActivityAt = now;
  });
  page.on("requestfailed", (request) => {
    const now = performance.now();
    tracker.pending.delete(request);
    const record = tracker.records.get(request);
    if (record) {
      record.state = "request-failed";
      record.failure = request.failure()?.errorText;
      record.endedAt = now;
    }
    tracker.lastActivityAt = now;
  });
  return tracker;
}

function resolvedAssertions(scenario: Scenario | undefined, role: "reference" | "library" | undefined): ResolvedScenarioAssertion[] {
  if (!scenario || !role) return [];
  return scenario.assertions.flatMap((assertion) => {
    const target = scenarioSelector(assertion.target, role);
    if (!target) return [];
    const resolveClass = (value: string | NonNullable<ScenarioAssertion["classIncludes"]>[number]): string | undefined =>
      typeof value === "string" ? value : scenarioSelector(value, role);
    return [{
      ...assertion,
      target,
      classIncludes: assertion.classIncludes?.map(resolveClass).filter((value): value is string => Boolean(value)),
      classExcludes: assertion.classExcludes?.map(resolveClass).filter((value): value is string => Boolean(value)),
    }];
  });
}

async function waitForNetworkIdle(tracker: NetworkActivityTracker, timeoutMs = 1000, quietMs = 32): Promise<boolean> {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const idleFor = performance.now() - Math.max(startedAt, tracker.lastActivityAt);
    if (tracker.pending.size === 0 && idleFor >= quietMs) return true;
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 8));
  }
  return tracker.pending.size === 0;
}

async function waitForDomLayoutAndAssertions(
  page: Page,
  rootSelector: string,
  assertions: ResolvedScenarioAssertion[],
  timeoutMs = ADAPTIVE_STABILITY_TIMEOUT_MS,
): Promise<DomStabilityProbeResult> {
  return page.evaluate(async ({ selector, expected, timeout }) => {
    const root = document.querySelector(selector);
    if (!root) return { stable: false, assertionsSatisfied: false, timersSettled: false, resourcesSettled: false, waitedForTimers: false, waitedForResources: false, waitedForStylesheets: false, waitedForBackgroundImages: false, waitedForFonts: false, resourceReferences: [], resourceScan: { fullScans: 0, incrementalScans: 0, elementsScanned: 0, pseudoElementsScanned: 0, urlsDiscovered: 0, elapsedMs: 0 }, signatureScan: { fullScans: 0, incrementalScans: 0, nodesScanned: 0, mutationInvalidations: 0, resizeInvalidations: 0, scrollInvalidations: 0, elapsedMs: 0 } };
    const visible = (element: Element): boolean => {
      let current: Element | null = element;
      while (current) {
        if ((current as HTMLElement).hidden || current.getAttribute("aria-hidden") === "true") return false;
        const computed = getComputedStyle(current);
        if (computed.display === "none" || computed.visibility === "hidden") return false;
        current = current.parentElement;
      }
      return true;
    };
    const resourceVisible = (element: Element): boolean => {
      if (!visible(element)) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
    };
    const text = (element: Element): string => (((element as HTMLElement).innerText || element.textContent || "").trim());
    const assertionsSatisfied = (): boolean => expected.every((assertion) => {
      let element: Element | null;
      try { element = document.querySelector(assertion.target); } catch { return false; }
      if (!element) return false;
      if (assertion.visible !== undefined && visible(element) !== assertion.visible) return false;
      if (assertion.actionable) {
        const html = element as HTMLElement;
        const rect = element.getBoundingClientRect();
        const disabled = "disabled" in html && Boolean((html as HTMLButtonElement).disabled);
        if (!visible(element) || disabled || element.getAttribute("aria-disabled") === "true" || rect.width <= 0 || rect.height <= 0) return false;
        const x = Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
        const y = Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
        const hit = document.elementFromPoint(x, y);
        if (hit && hit !== element && !element.contains(hit)) return false;
      }
      if (assertion.text !== undefined && text(element) !== assertion.text) return false;
      if (assertion.textContains !== undefined && !text(element).includes(assertion.textContains)) return false;
      if (assertion.value !== undefined && (!("value" in element) || String((element as HTMLInputElement).value) !== assertion.value)) return false;
      if (assertion.focused !== undefined && (document.activeElement === element) !== assertion.focused) return false;
      if (assertion.classIncludes?.some((name) => !element.classList.contains(name))) return false;
      if (assertion.classExcludes?.some((name) => element.classList.contains(name))) return false;
      if (assertion.attributes && Object.entries(assertion.attributes).some(([name, value]) => element.getAttribute(name) !== value)) return false;
      return true;
    });
    const pendingTimerDeadlines = (): number[] => {
      const timerState = globalThis as typeof globalThis & { __uiDismantlerPendingTimers?: () => number[] };
      return timerState.__uiDismantlerPendingTimers?.() ?? [];
    };
    const resourceOwner = (element: Element): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const classes = [...element.classList].slice(0, 2).map((name) => `.${CSS.escape(name)}`).join("");
      if (classes) return `${element.tagName.toLowerCase()}${classes}`;
      const parent = element.parentElement;
      if (!parent) return element.tagName.toLowerCase();
      return `${resourceOwner(parent)} > ${element.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(element) + 1})`;
    };
    type IndexedVisualResource = Omit<VisualResourceReference, "state"> & {
      element: Element;
      source: "image-element" | "performance";
    };
    type ResourceScanMetrics = DomStabilityProbeResult["resourceScan"];
    type VisualResourceState = { settled: boolean; stylesheets: boolean; backgroundImages: boolean; fonts: boolean; references: VisualResourceReference[] };
    interface VisualResourceTracker {
      root: Element;
      metrics: ResourceScanMetrics;
      state: () => VisualResourceState;
      disconnect: () => void;
    }
    const trackerHost = globalThis as typeof globalThis & { __uiDismantlerVisualResourceTracker?: VisualResourceTracker };
    const existingResourceTracker = trackerHost.__uiDismantlerVisualResourceTracker;
    if (existingResourceTracker && existingResourceTracker.root !== root) existingResourceTracker.disconnect();
    const resourceTracker = existingResourceTracker?.root === root
      ? existingResourceTracker
      : (() => {
    const resourceIndex = new Map<Element, IndexedVisualResource[]>();
    const completedResources = new Set(performance.getEntriesByType("resource").map((entry) => {
      try { return new URL(entry.name, location.href).href; } catch { return entry.name; }
    }));
    const dirtyResourceRoots = new Set<Element>();
    const resourceScan = { fullScans: 0, incrementalScans: 0, elementsScanned: 0, pseudoElementsScanned: 0, urlsDiscovered: 0, elapsedMs: 0 };
    let fullResourceScanPending = true;
    let stylesheetSignature = "";
    const resourceKey = (reference: Pick<IndexedVisualResource, "type" | "url" | "owner" | "pseudo">): string => `${reference.type}|${reference.url}|${reference.owner}|${reference.pseudo ?? ""}`;
    const collectIndexedUrls = (references: IndexedVisualResource[], value: string, type: "background-image" | "mask-image", element: Element, pseudo?: "::before" | "::after"): void => {
      for (const match of value.matchAll(/url\((?:"|')?([^"')]+)(?:"|')?\)/g)) {
        try {
          const url = new URL(match[1], location.href);
          if (!["http:", "https:"].includes(url.protocol)) continue;
          references.push({ url: url.href, type, owner: resourceOwner(element), pseudo, element, source: "performance" });
        } catch { /* invalid CSS URL */ }
      }
    };
    const scanElementResources = (element: Element): void => {
      if (element !== root && !root.contains(element)) {
        resourceIndex.delete(element);
        return;
      }
      resourceScan.elementsScanned += 1;
      const references: IndexedVisualResource[] = [];
      if (element instanceof HTMLImageElement) {
        const url = element.currentSrc || element.src;
        if (url) references.push({ url, type: "image", owner: resourceOwner(element), element, source: "image-element" });
      }
      if (element.matches("svg image, svg use")) {
        const rawUrl = element.getAttribute("href") || element.getAttribute("xlink:href");
        if (rawUrl) {
          try {
            const url = new URL(rawUrl, location.href);
            if (["http:", "https:"].includes(url.protocol)) references.push({ url: url.href, type: "image", owner: resourceOwner(element), element, source: "performance" });
          } catch { /* invalid SVG URL */ }
        }
      }
      if (element instanceof HTMLVideoElement && element.poster) {
        try {
          const url = new URL(element.poster, location.href);
          if (["http:", "https:"].includes(url.protocol)) references.push({ url: url.href, type: "image", owner: resourceOwner(element), element, source: "performance" });
        } catch { /* invalid poster URL */ }
      }
      const computed = getComputedStyle(element);
      collectIndexedUrls(references, computed.backgroundImage, "background-image", element);
      collectIndexedUrls(references, computed.maskImage, "mask-image", element);
      for (const pseudo of ["::before", "::after"] as const) {
        resourceScan.pseudoElementsScanned += 1;
        const pseudoStyle = getComputedStyle(element, pseudo);
        if (pseudoStyle.content !== "none") {
          collectIndexedUrls(references, pseudoStyle.backgroundImage, "background-image", element, pseudo);
          collectIndexedUrls(references, pseudoStyle.maskImage, "mask-image", element, pseudo);
        }
      }
      const deduped = [...new Map(references.map((reference) => [resourceKey(reference), reference])).values()];
      resourceScan.urlsDiscovered += deduped.length;
      resourceIndex.set(element, deduped);
    };
    const subtreeElements = (element: Element): Element[] => [element, ...element.querySelectorAll("*")];
    const performResourceScan = (): void => {
      const startedAt = performance.now();
      if (fullResourceScanPending) {
        resourceScan.fullScans += 1;
        resourceIndex.clear();
        for (const element of [root, ...root.querySelectorAll("*")].slice(0, 500)) scanElementResources(element);
        dirtyResourceRoots.clear();
        fullResourceScanPending = false;
      } else if (dirtyResourceRoots.size) {
        resourceScan.incrementalScans += 1;
        const elements = new Set<Element>();
        for (const dirtyRoot of dirtyResourceRoots) {
          for (const element of subtreeElements(dirtyRoot)) {
            if (resourceIndex.has(element) || resourceIndex.size + elements.size < 500) elements.add(element);
          }
        }
        dirtyResourceRoots.clear();
        for (const element of elements) scanElementResources(element);
      }
      resourceScan.elapsedMs += performance.now() - startedAt;
    };
    const currentStylesheetSignature = (): string => [...document.styleSheets].map((sheet) => {
      let rules = "x";
      try { rules = String(sheet.cssRules.length); } catch { /* cross-origin stylesheet */ }
      return `${sheet.href ?? "inline"}:${sheet.disabled ? 1 : 0}:${rules}`;
    }).join("|");
    const activeStylesheetUrls = (): Set<string> => {
      const urls = new Set([...document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]')].map((link) => link.href));
      for (const sheet of [...document.styleSheets]) {
        try {
          for (const rule of [...sheet.cssRules]) {
            if (rule instanceof CSSImportRule && rule.href) urls.add(new URL(rule.href, location.href).href);
          }
        } catch { /* cross-origin stylesheet rules */ }
      }
      return urls;
    };
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target as Element : mutation.target.parentElement;
        if (!target) continue;
        if (target.matches("style, link[rel~='stylesheet']") || target.closest("style")) {
          fullResourceScanPending = true;
          continue;
        }
        if (target === root || root.contains(target)) dirtyResourceRoots.add(target);
        for (const removed of mutation.removedNodes) {
          if (removed.nodeType !== Node.ELEMENT_NODE) continue;
          for (const element of subtreeElements(removed as Element)) resourceIndex.delete(element);
        }
      }
    });
    mutationObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    const performanceObserver = typeof PerformanceObserver === "undefined" ? undefined : new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        let completedUrl = entry.name;
        try { completedUrl = new URL(entry.name, location.href).href; } catch { /* preserve raw resource name */ }
        completedResources.add(completedUrl);
        const resource = entry as PerformanceResourceTiming;
        if (resource.initiatorType === "link" || activeStylesheetUrls().has(completedUrl)) fullResourceScanPending = true;
      }
    });
    try { performanceObserver?.observe({ type: "resource" }); } catch { /* resource observation unavailable */ }
    const visualResourceState = (): VisualResourceState => {
      const nextStylesheetSignature = currentStylesheetSignature();
      if (stylesheetSignature && nextStylesheetSignature !== stylesheetSignature) fullResourceScanPending = true;
      stylesheetSignature = nextStylesheetSignature;
      performResourceScan();
      const references: VisualResourceReference[] = [];
      for (const indexed of resourceIndex.values()) {
        for (const reference of indexed) {
          if (!resourceVisible(reference.element)) continue;
          const state: VisualResourceReference["state"] = reference.source === "image-element"
            ? (!(reference.element as HTMLImageElement).complete
              ? "pending"
              : (reference.element as HTMLImageElement).naturalWidth > 0 || /^(?:data|blob):/i.test(reference.url)
                ? "loaded"
                : "decode-error")
            : completedResources.has(reference.url) ? "loaded" : "pending";
          references.push({ url: reference.url, type: reference.type, owner: reference.owner, pseudo: reference.pseudo, state });
        }
      }
      for (const link of [...document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')]) {
        if (link.disabled || (link.media && !matchMedia(link.media).matches) || !link.href) continue;
        references.push({ url: link.href, type: "stylesheet", owner: resourceOwner(link), state: link.sheet ? "loaded" : "pending" });
      }
      if (document.fonts && document.fonts.status !== "loaded") {
        const loadingFaces = [...document.fonts].filter((face) => face.status === "loading");
        if (!loadingFaces.length) references.push({ url: "document.fonts", type: "font", owner: "document.fonts", state: "font-loading", required: true });
        for (const face of loadingFaces) {
          const display = String((face as FontFace & { display?: string }).display ?? "auto").toLowerCase();
          const required = !["swap", "fallback", "optional"].includes(display);
          references.push({ url: `font:${face.family}`, type: "font", owner: `@font-face ${face.family} [font-display=${display}]`, state: "font-loading", required });
        }
      }
      const deduped = [...new Map(references.map((reference) => [`${reference.type}|${reference.url}|${reference.owner}|${reference.pseudo ?? ""}`, reference])).values()];
      const requiredReferences = deduped.filter((item) => item.required !== false);
      const stylesheetsSettled = requiredReferences.filter((item) => item.type === "stylesheet").every((item) => item.state === "loaded");
      const backgroundImagesSettled = requiredReferences.filter((item) => item.type === "background-image" || item.type === "mask-image").every((item) => item.state === "loaded");
      const fontsSettled = requiredReferences.filter((item) => item.type === "font").every((item) => item.state === "loaded");
      return {
        settled: requiredReferences.every((item) => item.state === "loaded"),
        stylesheets: stylesheetsSettled,
        backgroundImages: backgroundImagesSettled,
        fonts: fontsSettled,
        references: deduped,
      };
    };
    const tracker: VisualResourceTracker = {
      root,
      metrics: resourceScan,
      state: visualResourceState,
      disconnect: () => { mutationObserver.disconnect(); performanceObserver?.disconnect(); },
    };
    trackerHost.__uiDismantlerVisualResourceTracker = tracker;
    return tracker;
    })();
    const scanStart = { ...resourceTracker.metrics };
    const visualResourceState = resourceTracker.state;
    const resourceScanDelta = (): ResourceScanMetrics => ({
      fullScans: resourceTracker.metrics.fullScans - scanStart.fullScans,
      incrementalScans: resourceTracker.metrics.incrementalScans - scanStart.incrementalScans,
      elementsScanned: resourceTracker.metrics.elementsScanned - scanStart.elementsScanned,
      pseudoElementsScanned: resourceTracker.metrics.pseudoElementsScanned - scanStart.pseudoElementsScanned,
      urlsDiscovered: resourceTracker.metrics.urlsDiscovered - scanStart.urlsDiscovered,
      elapsedMs: Number((resourceTracker.metrics.elapsedMs - scanStart.elapsedMs).toFixed(3)),
    });
    type SignatureScanMetrics = DomStabilityProbeResult["signatureScan"];
    interface DomSignatureTracker {
      root: Element;
      metrics: SignatureScanMetrics;
      signature: () => string;
      disconnect: () => void;
    }
    const signatureHost = globalThis as typeof globalThis & { __uiDismantlerDomSignatureTracker?: DomSignatureTracker };
    const existingSignatureTracker = signatureHost.__uiDismantlerDomSignatureTracker;
    if (existingSignatureTracker && existingSignatureTracker.root !== root) existingSignatureTracker.disconnect();
    const domSignatureTracker = existingSignatureTracker?.root === root
      ? existingSignatureTracker
      : (() => {
        const metrics: SignatureScanMetrics = { fullScans: 0, incrementalScans: 0, nodesScanned: 0, mutationInvalidations: 0, resizeInvalidations: 0, scrollInvalidations: 0, elapsedMs: 0 };
        const semanticByNode = new Map<Element, string>();
        const layoutByNode = new Map<Element, string>();
        const semanticDirty = new Set<Element>();
        const layoutDirty = new Set<Element>();
        const observedSizes = new WeakMap<Element, string>();
        let trackedNodes: Element[] = [];
        let trackedSet = new Set<Element>();
        let structureDirty = true;
        let layoutAllDirty = false;
        let cachedSignature = "";
        let signatureValueDirty = true;
        const quarter = (value: number): number => Math.round(value * 4) / 4;
        const semanticToken = (node: Element): string => {
          const ownText = [...node.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.textContent ?? "").join("");
          return [node.tagName, node.id, node.getAttribute("class") ?? "", node.getAttribute("style") ?? "", node.getAttribute("hidden") ?? "", node.getAttribute("aria-hidden") ?? "", node.getAttribute("aria-selected") ?? "", node.getAttribute("aria-pressed") ?? "", node.getAttribute("aria-expanded") ?? "", ownText].join("~");
        };
        const layoutToken = (node: Element): string => {
          const rect = node.getBoundingClientRect();
          const html = node as HTMLElement;
          observedSizes.set(node, `${quarter(rect.width)},${quarter(rect.height)}`);
          return `${[rect.x, rect.y, rect.width, rect.height].map(quarter).join(",")}:${html.scrollWidth ?? 0},${html.scrollHeight ?? 0},${html.scrollLeft ?? 0},${html.scrollTop ?? 0}`;
        };
        let resizeObserver: ResizeObserver | undefined;
        const rebuild = (): void => {
          metrics.fullScans += 1;
          trackedNodes = [root, ...root.querySelectorAll("*")].slice(0, 500);
          trackedSet = new Set(trackedNodes);
          semanticByNode.clear();
          layoutByNode.clear();
          resizeObserver?.disconnect();
          for (const node of trackedNodes) {
            semanticByNode.set(node, semanticToken(node));
            layoutByNode.set(node, layoutToken(node));
            resizeObserver?.observe(node);
          }
          metrics.nodesScanned += trackedNodes.length;
          semanticDirty.clear();
          layoutDirty.clear();
          structureDirty = false;
          layoutAllDirty = false;
          signatureValueDirty = true;
        };
        resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver((entries) => {
          for (const entry of entries) {
            if (!trackedSet.has(entry.target)) continue;
            const rect = entry.target.getBoundingClientRect();
            const size = `${quarter(rect.width)},${quarter(rect.height)}`;
            const previousSize = observedSizes.get(entry.target);
            observedSizes.set(entry.target, size);
            if (previousSize === undefined || previousSize === size) continue;
            metrics.resizeInvalidations += 1;
            layoutAllDirty = true;
          }
        });
        const mutationObserver = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            const target = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target as Element : mutation.target.parentElement;
            const insideRoot = Boolean(target && (target === root || root.contains(target)));
            const addedStyleNode = mutation.type === "childList" && [...mutation.addedNodes].some((node) => node instanceof Element && (node.matches("style, link[rel~='stylesheet']") || Boolean(node.querySelector("style, link[rel~='stylesheet']"))));
            const affectsStylesheet = Boolean(target && (target.matches("style, link[rel~='stylesheet']") || target.closest("style"))) || addedStyleNode;
            if (!insideRoot && !affectsStylesheet) continue;
            metrics.mutationInvalidations += 1;
            if (affectsStylesheet && !insideRoot) {
              layoutAllDirty = true;
              continue;
            }
            if (mutation.type === "childList") {
              const changesElementTopology = [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE);
              if (changesElementTopology) {
                structureDirty = true;
              } else if (mutation.target instanceof Element && (mutation.target === root || root.contains(mutation.target))) {
                semanticDirty.add(mutation.target);
                layoutAllDirty = true;
              }
              continue;
            }
            if (!target || (target !== root && !root.contains(target))) continue;
            semanticDirty.add(target);
            layoutAllDirty = true;
          }
        });
        mutationObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
        const onScroll = (event: Event): void => {
          metrics.scrollInvalidations += 1;
          const target = event.target;
          if (target instanceof Element && (target === root || root.contains(target))) {
            for (const element of [target, ...target.querySelectorAll("*")]) if (trackedSet.has(element)) layoutDirty.add(element);
          } else {
            layoutAllDirty = true;
          }
        };
        const onVisualLoad = (event: Event): void => {
          if (event.target instanceof HTMLLinkElement && event.target.relList.contains("stylesheet")) layoutAllDirty = true;
        };
        const onFontLoad = (): void => { layoutAllDirty = true; };
        document.addEventListener("scroll", onScroll, true);
        document.addEventListener("load", onVisualLoad, true);
        document.fonts?.addEventListener("loadingdone", onFontLoad);
        const signature = (): string => {
          const startedAt = performance.now();
          if (structureDirty) {
            rebuild();
          } else {
            if (layoutAllDirty) for (const node of trackedNodes) layoutDirty.add(node);
            const dirty = new Set([...semanticDirty, ...layoutDirty]);
            if (dirty.size) metrics.incrementalScans += 1;
            if (dirty.size) signatureValueDirty = true;
            for (const node of dirty) {
              if (!trackedSet.has(node)) continue;
              if (semanticDirty.has(node)) semanticByNode.set(node, semanticToken(node));
              if (layoutAllDirty || layoutDirty.has(node)) layoutByNode.set(node, layoutToken(node));
            }
            metrics.nodesScanned += dirty.size;
            semanticDirty.clear();
            layoutDirty.clear();
            layoutAllDirty = false;
          }
          if (signatureValueDirty) {
            cachedSignature = trackedNodes.map((node) => `${semanticByNode.get(node) ?? ""}:${layoutByNode.get(node) ?? ""}`).join("|");
            signatureValueDirty = false;
          }
          metrics.elapsedMs += performance.now() - startedAt;
          return cachedSignature;
        };
        const tracker: DomSignatureTracker = {
          root,
          metrics,
          signature,
          disconnect: () => {
            mutationObserver.disconnect();
            resizeObserver?.disconnect();
            document.removeEventListener("scroll", onScroll, true);
            document.removeEventListener("load", onVisualLoad, true);
            document.fonts?.removeEventListener("loadingdone", onFontLoad);
          },
        };
        signatureHost.__uiDismantlerDomSignatureTracker = tracker;
        return tracker;
      })();
    const signatureStart = { ...domSignatureTracker.metrics };
    const signature = domSignatureTracker.signature;
    const signatureScanDelta = (): SignatureScanMetrics => ({
      fullScans: domSignatureTracker.metrics.fullScans - signatureStart.fullScans,
      incrementalScans: domSignatureTracker.metrics.incrementalScans - signatureStart.incrementalScans,
      nodesScanned: domSignatureTracker.metrics.nodesScanned - signatureStart.nodesScanned,
      mutationInvalidations: domSignatureTracker.metrics.mutationInvalidations - signatureStart.mutationInvalidations,
      resizeInvalidations: domSignatureTracker.metrics.resizeInvalidations - signatureStart.resizeInvalidations,
      scrollInvalidations: domSignatureTracker.metrics.scrollInvalidations - signatureStart.scrollInvalidations,
      elapsedMs: Number((domSignatureTracker.metrics.elapsedMs - signatureStart.elapsedMs).toFixed(3)),
    });
    return new Promise<DomStabilityProbeResult>((resolveWait) => {
      const startedAt = performance.now();
      let previous = "";
      let stableFrames = 0;
      let waitedForTimers = false;
      let waitedForResources = false;
      let waitedForStylesheets = false;
      let waitedForBackgroundImages = false;
      let waitedForFonts = false;
      const sample = (): void => {
        const current = signature();
        stableFrames = current === previous ? stableFrames + 1 : 1;
        previous = current;
        const assertionState = assertionsSatisfied();
        const now = performance.now();
        const pendingTimers = pendingTimerDeadlines().filter((deadline) => deadline - now <= timeout);
        const timersSettled = pendingTimers.length === 0;
        if (!timersSettled) waitedForTimers = true;
        const resources = visualResourceState();
        if (!resources.settled) waitedForResources = true;
        if (!resources.stylesheets) waitedForStylesheets = true;
        if (!resources.backgroundImages) waitedForBackgroundImages = true;
        if (!resources.fonts) waitedForFonts = true;
        if (stableFrames >= 2 && assertionState && timersSettled && resources.settled) {
          resolveWait({ stable: true, assertionsSatisfied: true, timersSettled: true, resourcesSettled: true, waitedForTimers, waitedForResources, waitedForStylesheets, waitedForBackgroundImages, waitedForFonts, resourceReferences: resources.references, resourceScan: resourceScanDelta(), signatureScan: signatureScanDelta() }); return;
        }
        if (now - startedAt >= timeout) {
          resolveWait({ stable: false, assertionsSatisfied: assertionState, timersSettled, resourcesSettled: resources.settled, waitedForTimers, waitedForResources, waitedForStylesheets, waitedForBackgroundImages, waitedForFonts, resourceReferences: resources.references, resourceScan: resourceScanDelta(), signatureScan: signatureScanDelta() }); return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, { selector: rootSelector, expected: assertions, timeout: timeoutMs });
}

function resourceFailuresForProbe(references: VisualResourceReference[], network: NetworkActivityTracker): VisualResourceFailure[] {
  const now = performance.now();
  const networkByUrl = new Map<string, NetworkResourceRecord>();
  for (const record of network.records.values()) networkByUrl.set(record.url, record);
  const failures: VisualResourceFailure[] = [];
  for (const reference of references) {
    const record = networkByUrl.get(reference.url);
    const networkFailed = record?.state === "http-error" || record?.state === "request-failed";
    if (reference.state === "loaded" && !networkFailed) continue;
    const state: VisualResourceFailure["state"] = record?.state === "http-error"
      ? "http-error"
      : record?.state === "request-failed"
        ? "request-failed"
        : reference.state === "decode-error"
          ? "decode-error"
          : reference.state === "font-loading"
            ? "font-loading"
            : record?.state === "pending"
              ? "pending"
              : "timeout";
    failures.push({
      url: reference.url,
      type: reference.type,
      owner: reference.owner,
      pseudo: reference.pseudo,
      state,
      status: record?.status,
      failure: record?.failure,
      elapsedMs: record ? Number(((record.endedAt ?? now) - record.startedAt).toFixed(3)) : undefined,
      required: reference.required !== false,
      external: /^https?:\/\//i.test(reference.url),
    });
  }
  const blockingFonts = references.some((reference) => reference.type === "font" && reference.required !== false);
  const optionalFonts = references.some((reference) => reference.type === "font" && reference.required === false);
  for (const record of network.records.values()) {
    if (!["font", "stylesheet"].includes(record.type) || !["http-error", "request-failed"].includes(record.state)) continue;
    if (failures.some((failure) => failure.url === record.url)) continue;
    failures.push({
      url: record.url,
      type: record.type === "font" ? "font" : "stylesheet",
      owner: record.type === "font" ? "@font-face" : "@import",
      state: record.state as "http-error" | "request-failed",
      status: record.status,
      failure: record.failure,
      elapsedMs: Number(((record.endedAt ?? now) - record.startedAt).toFixed(3)),
      required: record.type !== "font" || blockingFonts || !optionalFonts,
      external: true,
    });
  }
  return failures;
}

async function waitForAdaptiveStability(
  page: Page,
  rootSelector: string,
  network: NetworkActivityTracker,
  assertions: ResolvedScenarioAssertion[] = [],
  telemetry?: BrowserExecutionTelemetry,
  timeoutMs = ADAPTIVE_STABILITY_TIMEOUT_MS,
): Promise<PageStabilityResult> {
  telemetry && (telemetry.workload.stabilityChecks += 1);
  if (telemetry && assertions.length) telemetry.workload.assertionStabilityChecks += 1;
  const domStartedAt = performance.now();
  const domPromise = waitForDomLayoutAndAssertions(page, rootSelector, assertions, timeoutMs).then((result) => {
    if (telemetry) telemetry.timing.domStabilityMs += elapsed(domStartedAt);
    return result;
  });
  const networkStartedAt = performance.now();
  const networkPromise = waitForNetworkIdle(network, timeoutMs).then((idle) => {
    if (telemetry) telemetry.timing.networkIdleMs += elapsed(networkStartedAt);
    return idle;
  });
  const [dom, rawNetworkIdle] = await Promise.all([domPromise, networkPromise]);
  const hasBlockingFonts = dom.resourceReferences.some((reference) => reference.type === "font" && reference.required !== false);
  const onlyOptionalFontRequestsRemain = network.pending.size > 0 && [...network.pending].every((request) => request.resourceType() === "font") && !hasBlockingFonts;
  const networkIdle = rawNetworkIdle || onlyOptionalFontRequestsRemain;
  const domTimedOut = !dom.stable;
  const networkTimedOut = !networkIdle;
  const timerTimedOut = !dom.timersSettled;
  const resourceTimedOut = !dom.resourcesSettled;
  const resourceFailures = resourceFailuresForProbe(dom.resourceReferences, network);
  const resourceFailed = resourceFailures.some((failure) => failure.required);
  if (telemetry && dom.waitedForTimers) telemetry.workload.timerAwareWaits += 1;
  if (telemetry && dom.waitedForResources) telemetry.workload.resourceAwareWaits += 1;
  if (telemetry && dom.waitedForStylesheets) telemetry.workload.stylesheetAwareWaits += 1;
  if (telemetry && dom.waitedForBackgroundImages) telemetry.workload.backgroundImageAwareWaits += 1;
  if (telemetry && dom.waitedForFonts) telemetry.workload.fontAwareWaits += 1;
  if (telemetry) {
    telemetry.timing.resourceScanMs += dom.resourceScan.elapsedMs;
    telemetry.workload.resourceFullScans += dom.resourceScan.fullScans;
    telemetry.workload.resourceIncrementalScans += dom.resourceScan.incrementalScans;
    telemetry.workload.resourceElementsScanned += dom.resourceScan.elementsScanned;
    telemetry.workload.resourcePseudoElementsScanned += dom.resourceScan.pseudoElementsScanned;
    telemetry.workload.resourceUrlsDiscovered += dom.resourceScan.urlsDiscovered;
    telemetry.timing.signatureScanMs += dom.signatureScan.elapsedMs;
    telemetry.workload.signatureFullScans += dom.signatureScan.fullScans;
    telemetry.workload.signatureIncrementalScans += dom.signatureScan.incrementalScans;
    telemetry.workload.signatureNodesScanned += dom.signatureScan.nodesScanned;
    telemetry.workload.signatureMutationInvalidations += dom.signatureScan.mutationInvalidations;
    telemetry.workload.signatureResizeInvalidations += dom.signatureScan.resizeInvalidations;
    telemetry.workload.signatureScrollInvalidations += dom.signatureScan.scrollInvalidations;
  }
  if (telemetry && (domTimedOut || networkTimedOut)) telemetry.workload.stabilityTimeouts += 1;
  if (telemetry && assertions.length && !dom.assertionsSatisfied) telemetry.workload.assertionStabilityTimeouts += 1;
  if (telemetry && networkTimedOut) telemetry.workload.networkIdleTimeouts += 1;
  if (telemetry && timerTimedOut) telemetry.workload.timerDrainTimeouts += 1;
  if (telemetry && resourceTimedOut) telemetry.workload.resourceDrainTimeouts += 1;
  return { stable: dom.stable && networkIdle && !resourceFailed, assertionsSatisfied: dom.assertionsSatisfied, domTimedOut, networkTimedOut, timerTimedOut, resourceTimedOut, resourceFailed, resourceFailures };
}

async function waitForSettled(
  page: Page,
  rootSelector: string,
  mode: "fixed" | "adaptive",
  network: NetworkActivityTracker,
  telemetry?: BrowserExecutionTelemetry,
): Promise<PageStabilityResult | null> {
  await page.waitForSelector(rootSelector, { state: "attached", timeout: 5000 });
  await page.waitForFunction((selector) => {
    const root = document.querySelector(selector);
    return Boolean(root && (root.children.length || root.textContent?.trim()));
  }, rootSelector, { timeout: 5000 });
  await page.evaluate(async () => { if (document.fonts) await Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, 1200))]); });
  if (mode === "adaptive") {
    return waitForAdaptiveStability(page, rootSelector, network, [], telemetry);
  }
  await page.evaluate(async () => {
    await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  });
  const startedAt = performance.now();
  await page.waitForTimeout(100);
  if (telemetry) telemetry.timing.fixedWaitMs += elapsed(startedAt);
  return null;
}

function scenarioSelector(target: Scenario["steps"][number]["target"], role: "reference" | "library"): string | undefined {
  if (!target) return undefined;
  if (typeof target === "string") return target;
  return target[role] ?? target.default;
}

async function targetIsActionable(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((target) => {
    let element: Element | null;
    try { element = document.querySelector(target); } catch { return false; }
    if (!element) return false;
    let current: Element | null = element;
    while (current) {
      const computed = getComputedStyle(current);
      if ((current as HTMLElement).hidden || current.getAttribute("aria-hidden") === "true" || computed.display === "none" || computed.visibility === "hidden") return false;
      current = current.parentElement;
    }
    const html = element as HTMLElement;
    if (("disabled" in html && Boolean((html as HTMLButtonElement).disabled)) || element.getAttribute("aria-disabled") === "true") return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const x = Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
    const y = Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    return !hit || hit === element || element.contains(hit);
  }, selector);
}

function scenarioAnchorCandidates(scenario: Scenario, role: "reference" | "library"): string[] {
  const selector = scenarioSelector(scenario.screenshotAnchor, role);
  return selector ? [selector] : [];
}

async function normalizeScenarioScrollAnchor(page: Page, scenario: Scenario, role: "reference" | "library", telemetry?: BrowserExecutionTelemetry): Promise<string | null> {
  const candidates = scenarioAnchorCandidates(scenario, role);
  if (!candidates.length) return null;
  const startedAt = performance.now();
  const selector = await page.evaluate((selectors) => {
    const visible = (element: Element): boolean => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    for (const candidate of selectors) {
      let element: Element | null = null;
      try { element = document.querySelector(candidate); } catch { continue; }
      if (!element || !visible(element)) continue;
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      const rect = element.getBoundingClientRect();
      const targetTop = Math.max(24, (innerHeight - rect.height) / 2);
      const scrollingElement = document.scrollingElement as HTMLElement | null;
      if (scrollingElement) scrollingElement.scrollTop += rect.top - targetTop;
      return candidate;
    }
    return null;
  }, candidates);
  if (selector) {
    await page.evaluate(async () => { await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))); });
    if (telemetry) telemetry.workload.scrollAnchorNormalizations += 1;
  }
  if (telemetry) telemetry.timing.scrollAnchorMs += elapsed(startedAt);
  return selector;
}

async function executeBrowserScenario(
  page: Page,
  scenario: Scenario,
  role: "reference" | "library",
  rootSelector: string,
  mode: "fixed" | "adaptive",
  network: NetworkActivityTracker,
  telemetry?: BrowserExecutionTelemetry,
): Promise<Array<{ phase: string; result: PageStabilityResult }>> {
  const outcomes: Array<{ phase: string; result: PageStabilityResult }> = [];
  const adaptiveIntermediateWaits = new Map<number, ResolvedScenarioAssertion[]>();
  for (let index = 0; index < scenario.steps.length; index += 1) {
    const step = scenario.steps[index];
    if (step.action === "wait") {
      if (telemetry) telemetry.workload.explicitWaits += 1;
      const isFinalStep = index === scenario.steps.length - 1;
      const readinessAssertions = adaptiveIntermediateWaits.get(index);
      if (mode === "adaptive" && ((isFinalStep && scenario.assertions.length) || readinessAssertions?.length)) {
        if (telemetry) telemetry.workload.adaptiveExplicitWaits += 1;
        outcomes.push({
          phase: `step-${index}-wait`,
          result: await waitForAdaptiveStability(
            page,
            rootSelector,
            network,
            readinessAssertions ?? resolvedAssertions(scenario, role),
            telemetry,
            Math.max(100, step.ms ?? 0),
          ),
        });
      } else {
        const startedAt = performance.now();
        await page.waitForTimeout(step.ms ?? 0);
        if (telemetry) telemetry.timing.fixedWaitMs += elapsed(startedAt);
      }
      continue;
    }
    if (mode === "adaptive" && scenario.steps[index + 1]?.action === "wait") {
      const followingStep = scenario.steps[index + 2];
      const followingTarget = scenarioSelector(followingStep?.target, role);
      if (followingStep && followingStep.action !== "wait" && followingTarget && !(await targetIsActionable(page, followingTarget))) {
        adaptiveIntermediateWaits.set(index + 1, [{ target: followingTarget, visible: true, actionable: true }]);
      }
    }
    const selector = scenarioSelector(step.target, role);
    const locator = selector ? page.locator(selector).first() : undefined;
    if (step.action === "click") {
      if (!locator) throw new Error(`${scenario.id}: click 缺少 target`);
      await locator.click();
    } else if (step.action === "input") {
      if (!locator) throw new Error(`${scenario.id}: input 缺少 target`);
      await locator.fill(step.value ?? "");
      if (step.commit !== false) await locator.dispatchEvent("change");
    } else if (step.action === "key") {
      if (locator) await locator.focus();
      const modifiers = [step.ctrlKey && "Control", step.altKey && "Alt", step.shiftKey && "Shift", step.metaKey && "Meta"].filter(Boolean);
      await page.keyboard.press([...modifiers, step.key ?? "Enter"].join("+"));
    }
    if (mode === "adaptive") {
      if (scenario.steps[index + 1]?.action !== "wait") {
        const finalAssertions = index === scenario.steps.length - 1 ? resolvedAssertions(scenario, role) : [];
        outcomes.push({ phase: `step-${index}-${step.action}`, result: await waitForAdaptiveStability(page, rootSelector, network, finalAssertions, telemetry) });
      }
    } else {
      await page.evaluate(async () => {
        await new Promise<void>((resolveWait) => requestAnimationFrame(() => requestAnimationFrame(() => resolveWait())));
      });
    }
  }
  if (mode === "adaptive" && scenario.steps.length === 0) {
    outcomes.push({ phase: "scenario-assertions", result: await waitForAdaptiveStability(page, rootSelector, network, resolvedAssertions(scenario, role), telemetry) });
  }
  return outcomes;
}

async function collectBrowserSnapshot(page: Page, rootSelector: string, url: string, withScreenshot = true, scenario?: Scenario, role?: "reference" | "library", telemetry?: BrowserExecutionTelemetry, runtimeTracker?: RuntimeErrorTracker, stabilityMode: "fixed" | "adaptive" = "fixed"): Promise<BrowserSnapshot> {
  const tracker = runtimeTracker ?? trackRuntimeErrors(page);
  const network = trackNetworkActivity(page);
  const stabilityFailures: string[] = [];
  const resourceFailures: VisualResourceFailure[] = [];
  const recordStability = (phase: string, result: PageStabilityResult | null): void => {
    if (result?.resourceFailures.length) resourceFailures.push(...result.resourceFailures.map((failure) => ({ ...failure, phase })));
    if (!result || result.stable) return;
    const causes = [
      result.domTimedOut && "dom/layout/assertion",
      result.networkTimedOut && "network",
      result.timerTimedOut && "timer",
      result.resourceTimedOut && "resource-timeout",
      result.resourceFailed && "resource-failure",
    ].filter(Boolean).join(",");
    stabilityFailures.push(`${phase}: ${causes || "unknown"}${result.resourceFailed && !result.resourceTimedOut ? "" : " stability timeout"}`);
  };
  tracker.reset();
  let startedAt = performance.now();
  await page.goto(pathToFileURL(url).href, { waitUntil: "load", timeout: 15000 });
  if (telemetry) { telemetry.timing.navigationMs += elapsed(startedAt); telemetry.workload.navigations += 1; }
  startedAt = performance.now();
  const initialStability = await waitForSettled(page, rootSelector, stabilityMode, network, telemetry);
  recordStability("initial", initialStability);
  if (telemetry) telemetry.timing.settleMs += elapsed(startedAt);
  if (scenario && role) {
    startedAt = performance.now();
    const scenarioStability = await executeBrowserScenario(page, scenario, role, rootSelector, stabilityMode, network, telemetry);
    for (const outcome of scenarioStability) recordStability(outcome.phase, outcome.result);
    if (stabilityMode === "fixed") {
      const fixedStartedAt = performance.now();
      await page.waitForTimeout(100);
      if (telemetry) telemetry.timing.fixedWaitMs += elapsed(fixedStartedAt);
    }
    if (telemetry) { telemetry.timing.scenarioExecutionMs += elapsed(startedAt); telemetry.workload.scenarioSteps += scenario.steps.length; }
    await normalizeScenarioScrollAnchor(page, scenario, role, telemetry);
  }
  startedAt = performance.now();
  const data = await page.evaluate(({ rootSelector: selector, properties }) => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`缺少根节点 ${selector}`);

    const stableSelector = (element: Element): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const classes = [...element.classList].slice(0, 2).map((name) => `.${CSS.escape(name)}`).join("");
      if (classes) return `${element.tagName.toLowerCase()}${classes}`;
      const parent = element.parentElement;
      if (!parent) return element.tagName.toLowerCase();
      return `${stableSelector(parent)} > ${element.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(element) + 1})`;
    };
    const normalizeSelector = (value: string): string => value
      .replace(/::(?:before|after|marker|placeholder|selection|backdrop|first-letter|first-line)/g, "")
      .replace(/:(?:hover|active|focus|focus-visible|focus-within|visited|target|checked|disabled|enabled)/g, "");
    const allSelectors: string[] = [];
    const visitRules = (rules: CSSRuleList): void => {
      for (const rule of [...rules]) {
        if ("cssRules" in rule) {
          try { visitRules((rule as CSSGroupingRule).cssRules); } catch { /* inaccessible stylesheet */ }
        }
        if (rule instanceof CSSStyleRule) allSelectors.push(...rule.selectorText.split(",").map((item) => item.trim()));
      }
    };
    for (const sheet of [...document.styleSheets]) {
      try { visitRules(sheet.cssRules); } catch { /* cross-origin stylesheet */ }
    }

    const allClassUses = new Map<string, Element[]>();
    for (const element of [root, ...root.querySelectorAll("[class]")]) for (const className of element.classList) allClassUses.set(className, [...(allClassUses.get(className) ?? []), element]);
    const selectorMentionsClass = (selector: string, className: string): boolean => {
      const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\.${escaped}(?![A-Za-z0-9_-])`).test(selector);
    };
    const classEvidence = [...allClassUses].map(([className, elements]) => ({ className, count: elements.length, hasSelector: allSelectors.some((selector) => selectorMentionsClass(selector, className)) }));

    const sgElements = [...root.querySelectorAll("[class*='sg-']")].filter((element) => [...element.classList].some((name) => name.startsWith("sg-")));
    const classUses = new Map<string, Element[]>();
    for (const element of sgElements) for (const name of element.classList) if (name.startsWith("sg-")) classUses.set(name, [...(classUses.get(name) ?? []), element]);
    const unmatchedClasses = [];
    const exemptClasses = [];
    const inactiveClasses = [];
    for (const [className, elements] of classUses) {
      const candidates = allSelectors.filter((item) => item.includes(`.${className}`));
      if (!candidates.length) {
        const issue = { selector: `.${className}`, count: elements.length, examples: elements.slice(0, 3).map(stableSelector) };
        if (className.startsWith("sg-is-")) exemptClasses.push(issue);
        else unmatchedClasses.push(issue);
        continue;
      }
      const active = candidates.some((candidate) => {
        try { return document.querySelector(normalizeSelector(candidate)) !== null; } catch { return false; }
      });
      if (!active) inactiveClasses.push({ selector: `.${className}`, count: elements.length, examples: elements.slice(0, 3).map(stableSelector) });
    }
    const sgSelectors = allSelectors.filter((item) => /(?:[.#]sg-[\w-]+)/.test(item));
    const orphanSgSelectors = sgSelectors.flatMap((cssSelector) => {
      try {
        const count = document.querySelectorAll(normalizeSelector(cssSelector)).length;
        return count ? [] : [{ selector: cssSelector, count: 0, examples: [] }];
      } catch { return []; }
    }).slice(0, 50);
    const sgClassUses = [...classUses.values()].reduce((total, elements) => total + elements.length, 0);
    const unmatchedUses = unmatchedClasses.reduce((total, issue) => total + issue.count, 0);
    const exemptUses = exemptClasses.reduce((total, issue) => total + issue.count, 0);
    const requiredSgClassUses = sgClassUses - exemptUses;
    const inactiveUses = inactiveClasses.reduce((total, issue) => total + issue.count, 0);
    const mismatchHints = unmatchedClasses.flatMap((issue) => {
      const token = issue.selector.replace(/^\.sg-/, "").split("-").at(-1) ?? "";
      const candidate = orphanSgSelectors.find((orphan) => {
        const normalized = orphan.selector.replace(/[.#]sg-/g, "").toLowerCase();
        return token.length > 2 && new RegExp(`(?:[.#-]|^)${token}(?:[\s.#:[>+~]|$)`).test(normalized);
      });
      if (!candidate) return [];
      return [{
        domClass: issue.selector,
        cssSelector: candidate.selector,
        reason: candidate.selector.includes(`#sg-${token}`) ? "DOM 使用 class，但 CSS 疑似使用了 id" : "DOM/CSS 的 sg- 前缀或修饰类命名不一致",
      }];
    });
    const selectorCoverage = {
      passed: unmatchedClasses.length === 0,
      sgElements: sgElements.length,
      sgClassUses,
      requiredSgClassUses,
      matchedSgClassUses: requiredSgClassUses - unmatchedUses,
      coverageRate: requiredSgClassUses ? (requiredSgClassUses - unmatchedUses) / requiredSgClassUses : 1,
      unmatchedClasses,
      exemptClasses,
      inactiveClasses,
      activeMatchRate: requiredSgClassUses ? (requiredSgClassUses - unmatchedUses - inactiveUses) / requiredSgClassUses : 1,
      orphanSgSelectors,
      mismatchHints,
    };

    const nodes = [root, ...root.querySelectorAll("[id], [class], [style]")].slice(0, 500);
    const styles = nodes.map((element, index) => {
      const computed = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const classes = [...element.classList];
      const semantic = classes.map((name) => name.toLowerCase().replace(/^sg-/, "")).sort().join(".");
      return {
        key: `${element.tagName.toLowerCase()}|${semantic || element.id || index}`,
        tag: element.tagName.toLowerCase(),
        id: element.id,
        classes,
        selector: stableSelector(element),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        styles: Object.fromEntries(properties.map((property) => [property, computed.getPropertyValue(property).trim()])),
      };
    });
    return { selectorCoverage, classEvidence, styles };
  }, { rootSelector, properties: [...STYLE_PROPERTIES] });
  if (telemetry) telemetry.timing.snapshotEvaluationMs += elapsed(startedAt);
  startedAt = performance.now();
  const screenshot = withScreenshot ? await page.screenshot({ type: "png", fullPage: false, animations: "disabled" }) : Buffer.alloc(0);
  if (telemetry && withScreenshot) { telemetry.timing.screenshotMs += elapsed(startedAt); telemetry.workload.screenshots += 1; }
  const uniqueResourceFailures = [...new Map(resourceFailures.map((failure) => [`${failure.phase}|${failure.type}|${failure.url}|${failure.owner}|${failure.pseudo ?? ""}`, failure])).values()];
  return { ok: true, runtimeErrors: tracker.errors.slice(0, 20), stabilityFailures, resourceFailures: uniqueResourceFailures, selectorCoverage: data.selectorCoverage, classEvidence: data.classEvidence, styles: data.styles, screenshot };
}

function normalizeClasses(values: string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase().replace(/^sg-/, "")).filter(Boolean));
}

function suffixTokens(value: string): Set<string> {
  const parts = value.split("-");
  return new Set(parts.map((_, index) => parts.slice(index).join("-")));
}

function classSimilarity(a: string[], b: string[]): number {
  const left = normalizeClasses(a), right = normalizeClasses(b);
  if (!left.size && !right.size) return 0.2;
  if (!left.size || !right.size) return 0;
  const exact = [...left].filter((value) => right.has(value)).length;
  const union = new Set([...left, ...right]).size;
  const leftSuffix = new Set([...left].flatMap((value) => [...suffixTokens(value)]));
  const rightSuffix = new Set([...right].flatMap((value) => [...suffixTokens(value)]));
  const suffix = [...leftSuffix].filter((value) => rightSuffix.has(value)).length;
  return Math.min(1, exact / union + Math.min(0.6, suffix / Math.max(left.size, right.size) * 0.6));
}

function valuesEqual(property: string, left: string, right: string): boolean {
  if (left === right) return true;
  const pixel = /^(-?\d+(?:\.\d+)?)px$/;
  const leftPixel = left.match(pixel), rightPixel = right.match(pixel);
  if (leftPixel && rightPixel) return Math.abs(Number(leftPixel[1]) - Number(rightPixel[1])) <= 1;
  if (property === "transform" && left.startsWith("matrix") && right.startsWith("matrix")) {
    const numbers = (value: string) => [...value.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
    const a = numbers(left), b = numbers(right);
    return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) <= 0.02);
  }
  return false;
}

export function compareComputedStyles(reference: ComputedStyleSnapshot[], generated: ComputedStyleSnapshot[]): StyleComparisonReport {
  const used = new Set<number>();
  let propertyCount = 0, matchingProperties = 0, matched = 0;
  const mismatches: StyleComparisonReport["mismatches"] = [];
  for (const expected of reference) {
    let bestIndex = -1, bestScore = 0;
    generated.forEach((candidate, index) => {
      if (used.has(index)) return;
      const normalizeIdentity = (value: string) => value.toLowerCase().replace(/^sg-/, "");
      const identityScore = expected.id && candidate.id && normalizeIdentity(expected.id) === normalizeIdentity(candidate.id) ? 1.5 : 0;
      const score = identityScore + classSimilarity(expected.classes, candidate.classes) + (expected.tag === candidate.tag ? 0.35 : 0);
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    });
    if (bestIndex < 0 || bestScore < 0.35) continue;
    used.add(bestIndex); matched += 1;
    const actual = generated[bestIndex];
    for (const property of STYLE_PROPERTIES) {
      propertyCount += 1;
      const left = expected.styles[property] ?? "", right = actual.styles[property] ?? "";
      if (valuesEqual(property, left, right)) matchingProperties += 1;
      else if (mismatches.length < 100) mismatches.push({ key: `${expected.selector} ↔ ${actual.selector}`, property, reference: left, generated: right });
    }
    for (const property of ["x", "y", "width", "height"] as const) {
      propertyCount += 1;
      if (Math.abs(expected.rect[property] - actual.rect[property]) <= 1) matchingProperties += 1;
      else if (mismatches.length < 100) mismatches.push({ key: `${expected.selector} ↔ ${actual.selector}`, property: `rect.${property}`, reference: String(expected.rect[property]), generated: String(actual.rect[property]) });
    }
  }
  return { matched, referenceCount: reference.length, generatedCount: generated.length, propertyCount, matchingProperties, rate: propertyCount ? Number((matchingProperties / propertyCount).toFixed(4)) : 0, mismatches };
}

async function comparePixels(reference: Buffer, generated: Buffer, threshold: number, artifactDir?: string, telemetry?: BrowserExecutionTelemetry): Promise<PixelDiffReport> {
  const startedAt = performance.now();
  const a = PNG.sync.read(reference), b = PNG.sync.read(generated);
  const width = Math.min(a.width, b.width), height = Math.min(a.height, b.height);
  const diff = new PNG({ width, height });
  const differentPixels = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1, includeAA: false });
  const totalPixels = width * height;
  const report: PixelDiffReport = { width, height, differentPixels, totalPixels, diffRate: Number((differentPixels / totalPixels).toFixed(6)), passed: differentPixels / totalPixels <= threshold, threshold };
  if (telemetry) telemetry.timing.pixelDiffMs += elapsed(startedAt);
  if (artifactDir) {
    const artifactStartedAt = performance.now();
    const dir = resolve(artifactDir); await mkdir(dir, { recursive: true });
    report.referenceImagePath = resolve(dir, "reference.png");
    report.generatedImagePath = resolve(dir, "generated.png");
    report.diffImagePath = resolve(dir, "diff.png");
    await Promise.all([writeFile(report.referenceImagePath, reference), writeFile(report.generatedImagePath, generated), writeFile(report.diffImagePath, PNG.sync.write(diff))]);
    if (telemetry) telemetry.timing.artifactWriteMs += elapsed(artifactStartedAt);
  }
  return report;
}

function sourceUnstyledHookClasses(htmlPath: string): Set<string> {
  let html = "";
  try { html = readFileSync(htmlPath, "utf8"); } catch { return new Set(); }
  let css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join("\n");
  for (const match of html.matchAll(/<link\b[^>]*rel=["'][^"']*stylesheet[^"']*["'][^>]*href=["']([^"']+)["']/gi)) {
    if (/^[a-z]+:/i.test(match[1])) continue;
    try { css += `\n${readFileSync(resolve(basename(htmlPath) === htmlPath ? "." : htmlPath.slice(0, -basename(htmlPath).length), match[1].split(/[?#]/)[0]), "utf8")}`; } catch { /* missing local stylesheet */ }
  }
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const styled = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]));
  const used = new Set<string>();
  for (const match of html.matchAll(/\bclass=["']([^"']+)["']/gi)) for (const name of match[1].split(/\s+/)) if (name) used.add(name);
  for (const match of html.matchAll(/classList\.(?:add|remove|toggle|contains|replace)\(\s*["']([A-Za-z_][\w-]*)["']/g)) used.add(match[1]);
  return new Set([...used].filter((name) => !styled.has(name)));
}

function applySourceUnstyledExemptions(reference: BrowserSnapshot, generated: BrowserSnapshot, staticHooks = new Set<string>()): SelectorCoverageReport {
  const report = generated.selectorCoverage;
  const sourceByClass = new Map(reference.classEvidence.map((item) => [item.className, item]));
  const generatedByClass = new Map(generated.classEvidence.map((item) => [item.className, item]));
  const newlyExempt = report.unmatchedClasses.flatMap((issue) => {
    const generatedClass = issue.selector.replace(/^\./, "");
    const sourceClass = generatedClass.replace(/^sg-/, "");
    const source = sourceByClass.get(sourceClass);
    const generatedEvidence = generatedByClass.get(generatedClass);
    const sourceAbsent = staticHooks.has(sourceClass) || Boolean(source && !source.hasSelector);
    if (!sourceAbsent || !generatedEvidence || generatedEvidence.hasSelector) return [];
    return [{ ...issue, reason: "source-unstyled-hook", evidence: { sourceClass, sourceClassUses: source?.count ?? 0, sourceSelectorAbsent: true, generatedSelectorAbsent: true } }];
  });
  for (const sourceClass of staticHooks) {
    const selector = `.sg-${sourceClass}`;
    if (newlyExempt.some((issue) => issue.selector === selector) || report.exemptClasses.some((issue) => issue.selector === selector)) continue;
    newlyExempt.push({ selector, count: 0, examples: [], reason: "source-unstyled-hook", evidence: { sourceClass, sourceClassUses: sourceByClass.get(sourceClass)?.count ?? 0, sourceSelectorAbsent: true, generatedSelectorAbsent: true } });
  }
  if (!newlyExempt.length) return report;
  const exemptSelectors = new Set(newlyExempt.map((issue) => issue.selector));
  const unmatchedClasses = report.unmatchedClasses.filter((issue) => !exemptSelectors.has(issue.selector));
  const exemptClasses = [...report.exemptClasses, ...newlyExempt];
  const exemptUses = exemptClasses.reduce((total, issue) => total + issue.count, 0);
  const unmatchedUses = unmatchedClasses.reduce((total, issue) => total + issue.count, 0);
  const requiredSgClassUses = report.sgClassUses - exemptUses;
  const inactiveUses = report.inactiveClasses.reduce((total, issue) => total + issue.count, 0);
  return {
    ...report,
    passed: unmatchedClasses.length === 0,
    requiredSgClassUses,
    matchedSgClassUses: requiredSgClassUses - unmatchedUses,
    coverageRate: requiredSgClassUses ? (requiredSgClassUses - unmatchedUses) / requiredSgClassUses : 1,
    activeMatchRate: requiredSgClassUses ? (requiredSgClassUses - unmatchedUses - inactiveUses) / requiredSgClassUses : 1,
    unmatchedClasses,
    exemptClasses,
  };
}

async function evaluateBrowserQualityOnPages(
  referencePage: Page,
  generatedPage: Page,
  htmlPath: string,
  examplePath: string,
  options: BrowserQualityOptions,
  scenario?: Scenario,
  telemetry?: BrowserExecutionTelemetry,
  trackers?: { reference: RuntimeErrorTracker; generated: RuntimeErrorTracker },
): Promise<BrowserQualityReport> {
  const pixelThreshold = options.pixelThreshold ?? 0.02;
  const selectorThreshold = options.selectorCoverageThreshold ?? 1;
  const styleThreshold = options.styleThreshold ?? 0.98;
  try {
    const [reference, generated] = await Promise.all([
      collectBrowserSnapshot(referencePage, "body", resolve(htmlPath), true, scenario, "reference", telemetry, trackers?.reference, options.stabilityMode),
      collectBrowserSnapshot(generatedPage, "#mount", examplePath, true, scenario, "library", telemetry, trackers?.generated, options.stabilityMode),
    ]);
    const styles = compareComputedStyles(reference.styles, generated.styles);
    const pixels = await comparePixels(reference.screenshot, generated.screenshot, pixelThreshold, options.artifactDir, telemetry);
    const selectorCoverage = applySourceUnstyledExemptions(reference, generated, sourceUnstyledHookClasses(htmlPath));
    generated.selectorCoverage = selectorCoverage;
    const score = Number((styles.rate * 0.55 + (1 - pixels.diffRate) * 0.35 + selectorCoverage.coverageRate * 0.1).toFixed(4));
    const translationFidelity = {
      passed: selectorCoverage.coverageRate >= selectorThreshold && styles.rate >= styleThreshold && pixels.passed && generated.runtimeErrors.length === 0 && reference.runtimeErrors.length === 0,
      score,
      selectorCoverage: selectorCoverage.coverageRate,
      computedStyle: styles.rate,
      pixelDiff: pixels.diffRate,
    };
    const allResourceFailures = [...reference.resourceFailures, ...generated.resourceFailures];
    const requiredExternalFailures = allResourceFailures.filter((failure) => failure.required && failure.external);
    const externalAvailability = {
      passed: requiredExternalFailures.length === 0,
      requiredFailures: requiredExternalFailures.length,
      externalFailures: allResourceFailures.filter((failure) => failure.external).length,
    };
    const resourceReadinessPassed = allResourceFailures.filter((failure) => failure.required).length === 0;
    const stabilityPassed = generated.stabilityFailures.length === 0 && reference.stabilityFailures.length === 0;
    const passed = translationFidelity.passed && externalAvailability.passed && resourceReadinessPassed && stabilityPassed;
    return {
      available: true,
      reference: { ok: reference.ok, runtimeErrors: reference.runtimeErrors, stabilityFailures: reference.stabilityFailures, resourceFailures: reference.resourceFailures, selectorCoverage: reference.selectorCoverage, styles: reference.styles },
      generated: { ok: generated.ok, runtimeErrors: generated.runtimeErrors, stabilityFailures: generated.stabilityFailures, resourceFailures: generated.resourceFailures, selectorCoverage: generated.selectorCoverage, styles: generated.styles },
      selectorCoverage, styles, pixels, translationFidelity, externalAvailability, score, passed,
    };
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error), passed: false };
  }
}

async function evaluateBrowserQualityInBrowser(browser: Browser, htmlPath: string, libDir: string, options: BrowserQualityOptions = {}, scenario?: Scenario, telemetry?: BrowserExecutionTelemetry, resourceCache?: RunResourceCache): Promise<BrowserQualityReport> {
  const width = options.width ?? 1024, height = options.height ?? 768;
  let context;
  try {
    let startedAt = performance.now();
    context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
    if (telemetry) { telemetry.timing.contextCreateMs += elapsed(startedAt); telemetry.workload.contextsCreated += 1; telemetry.workload.viewportRuns += 1; }
    startedAt = performance.now();
    await initializeQualityContext(context);
    if (telemetry && resourceCache) await installRunResourceCache(context, resourceCache, telemetry);
    if (telemetry) telemetry.timing.contextInitMs += elapsed(startedAt);
    startedAt = performance.now();
    const [referencePage, generatedPage] = await Promise.all([context.newPage(), context.newPage()]);
    if (telemetry) { telemetry.timing.pageCreateMs += elapsed(startedAt); telemetry.workload.pagesCreated += 2; telemetry.workload.pagePairsCreatedInParallel += 1; }
    const example = await firstExample(libDir, telemetry);
    return await evaluateBrowserQualityOnPages(referencePage, generatedPage, htmlPath, example, options, scenario, telemetry);
  } finally {
    await context?.close();
  }
}

export async function evaluateBrowserQuality(htmlPath: string, libDir: string, options: BrowserQualityOptions = {}): Promise<BrowserQualityReport> {
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser(options.executablePath);
    return await evaluateBrowserQualityInBrowser(browser, htmlPath, libDir, options);
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error), passed: false };
  } finally {
    await browser?.close();
  }
}

function summarizeViewport(viewport: QualityViewport, report: BrowserQualityReport): BrowserViewportReport {
  const runtimeErrors = (report.reference?.runtimeErrors.length ?? 0) + (report.generated?.runtimeErrors.length ?? 0);
  const stabilityFailures = (report.reference?.stabilityFailures.length ?? 0) + (report.generated?.stabilityFailures.length ?? 0);
  const resourceFailures = [
    ...(report.reference?.resourceFailures ?? []).map((failure) => ({ ...failure, role: "reference" as const })),
    ...(report.generated?.resourceFailures ?? []).map((failure) => ({ ...failure, role: "library" as const })),
  ];
  return {
    ...viewport,
    available: report.available,
    error: report.error,
    runtimeErrors,
    stabilityFailures,
    resourceFailures,
    translationFidelity: report.translationFidelity,
    externalAvailability: report.externalAvailability,
    selectorCoverage: report.selectorCoverage && {
      passed: report.selectorCoverage.passed,
      coverageRate: report.selectorCoverage.coverageRate,
      activeMatchRate: report.selectorCoverage.activeMatchRate,
      unmatchedClasses: report.selectorCoverage.unmatchedClasses,
      exemptClasses: report.selectorCoverage.exemptClasses,
      mismatchHints: report.selectorCoverage.mismatchHints,
    },
    styles: report.styles && {
      rate: report.styles.rate,
      matched: report.styles.matched,
      referenceCount: report.styles.referenceCount,
      generatedCount: report.styles.generatedCount,
      propertyCount: report.styles.propertyCount,
      matchingProperties: report.styles.matchingProperties,
      mismatches: report.styles.mismatches,
    },
    pixels: report.pixels,
    score: report.score,
    passed: report.passed === true,
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const limit = Math.max(1, Math.min(items.length || 1, Math.floor(concurrency) || 1));
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

function summarizeMatrix(viewports: QualityViewport[], reports: BrowserQualityReport[]): { primary: BrowserQualityReport; matrix: BrowserQualityMatrixReport; worstSelectorCoverage?: SelectorCoverageReport } {
  const entries = viewports.map((viewport, index) => summarizeViewport(viewport, reports[index]));
  const primary = reports[0] ?? { available: false, error: "没有可用质量视口", passed: false };
  const score = entries.length ? Number(Math.min(...entries.map((entry) => entry.score ?? 0)).toFixed(4)) : 0;
  const worstEntry = entries.reduce((worst, entry) => (entry.score ?? 0) < (worst.score ?? 0) ? entry : worst, entries[0]);
  const worstSelectorEntry = entries.reduce((worst, entry) => (entry.selectorCoverage?.coverageRate ?? 0) < (worst.selectorCoverage?.coverageRate ?? 0) ? entry : worst, entries[0]);
  const worstStyle = entries.length ? Math.min(...entries.map((entry) => entry.styles?.rate ?? 0)) : 0;
  const worstPixel = entries.length ? Math.max(...entries.map((entry) => entry.pixels?.diffRate ?? 1)) : 1;
  const runtimeErrors = entries.reduce((sum, entry) => sum + entry.runtimeErrors, 0);
  const stabilityFailures = entries.reduce((sum, entry) => sum + entry.stabilityFailures, 0);
  const resourceFailures = entries.reduce((sum, entry) => sum + entry.resourceFailures.length, 0);
  const externalAvailabilityFailures = entries.reduce((sum, entry) => sum + (entry.externalAvailability?.requiredFailures ?? 0), 0);
  const matrix: BrowserQualityMatrixReport = {
    viewports: entries,
    passed: entries.length > 0 && entries.every((entry) => entry.passed),
    score,
    worstViewport: worstEntry?.id ?? "unknown",
    worstSelectorCoverage: worstSelectorEntry?.selectorCoverage?.coverageRate ?? 0,
    worstComputedStyle: worstStyle,
    worstPixelDiff: worstPixel,
    runtimeErrors,
    stabilityFailures,
    resourceFailures,
    externalAvailabilityFailures,
  };
  return { primary, matrix, worstSelectorCoverage: reports[entries.indexOf(worstSelectorEntry)]?.selectorCoverage };
}

async function evaluateBrowserQualityMatrixInternal(htmlPath: string, libDir: string, options: BrowserQualityMatrixOptions = {}, scenario?: Scenario, sharedBrowser?: Browser, telemetry?: BrowserExecutionTelemetry, resourceCache?: RunResourceCache): Promise<{ primary: BrowserQualityReport; matrix: BrowserQualityMatrixReport; worstSelectorCoverage?: SelectorCoverageReport }> {
  const viewports = options.viewports?.length ? options.viewports : DEFAULT_QUALITY_VIEWPORTS;
  let browser: Browser | undefined = sharedBrowser;
  const ownsBrowser = !sharedBrowser;
  try {
    if (!browser) browser = await launchBrowser(options.executablePath);
    const reports = await mapWithConcurrency(viewports, options.concurrency ?? 1, async (viewport, index) => {
      const artifactDir = options.artifactDir
        ? index === 0 ? options.artifactDir : resolve(options.artifactDir, viewport.id)
        : undefined;
      return evaluateBrowserQualityInBrowser(browser as Browser, htmlPath, libDir, {
        ...options,
        width: viewport.width,
        height: viewport.height,
        artifactDir,
      }, scenario, telemetry, resourceCache);
    });
    return summarizeMatrix(viewports, reports);
  } catch (error) {
    const primary: BrowserQualityReport = { available: false, error: error instanceof Error ? error.message : String(error), passed: false };
    return {
      primary,
      matrix: { viewports: [], passed: false, score: 0, worstViewport: "unavailable", worstSelectorCoverage: 0, worstComputedStyle: 0, worstPixelDiff: 1, runtimeErrors: 0, stabilityFailures: 0, resourceFailures: 0, externalAvailabilityFailures: 0 },
    };
  } finally {
    if (ownsBrowser) await browser?.close();
  }
}

export async function evaluateBrowserQualityMatrix(htmlPath: string, libDir: string, options: BrowserQualityMatrixOptions = {}): Promise<{ primary: BrowserQualityReport; matrix: BrowserQualityMatrixReport; worstSelectorCoverage?: SelectorCoverageReport }> {
  return evaluateBrowserQualityMatrixInternal(htmlPath, libDir, options);
}

export async function evaluateScenarioBrowserQualityMatrix(htmlPath: string, libDir: string, scenario: Scenario, options: BrowserQualityMatrixOptions = {}): Promise<{ primary: BrowserQualityReport; matrix: BrowserQualityMatrixReport; worstSelectorCoverage?: SelectorCoverageReport }> {
  return evaluateBrowserQualityMatrixInternal(htmlPath, libDir, options, scenario);
}

export async function evaluateBrowserQualitySuite(htmlPath: string, libDir: string, scenarios: Scenario[], options: BrowserQualityMatrixOptions = {}): Promise<BrowserQualitySuiteReport> {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 1));
  const telemetry = createBrowserTelemetry("shared-browser", concurrency, options.resourceCache ?? "off", options.stabilityMode ?? "fixed");
  const totalStartedAt = performance.now();
  let browser: Browser | undefined;
  const resourceCache: RunResourceCache | undefined = options.resourceCache === "run-local" ? new Map() : undefined;
  try {
    let startedAt = performance.now();
    browser = await launchBrowser(options.executablePath);
    telemetry.timing.launchMs = elapsed(startedAt);
    telemetry.workload.browserLaunches = 1;
    startedAt = performance.now();
    const initial = await evaluateBrowserQualityMatrixInternal(htmlPath, libDir, options, undefined, browser, telemetry, resourceCache);
    const initialMatrixMs = elapsed(startedAt);
    const scenarioEvaluations: BrowserQualitySuiteReport["scenarios"] = [];
    startedAt = performance.now();
    for (const scenario of scenarios) {
      telemetry.workload.scenarioMatrices += 1;
      const artifactDir = options.artifactDir ? resolve(options.artifactDir, "scenarios", scenario.id) : undefined;
      const evaluation = await evaluateBrowserQualityMatrixInternal(htmlPath, libDir, { ...options, artifactDir }, scenario, browser, telemetry, resourceCache);
      scenarioEvaluations.push({ scenarioId: scenario.id, label: scenario.label, evaluation });
    }
    return { initial, scenarios: scenarioEvaluations, phaseTiming: { initialMatrixMs, scenarioMatricesMs: elapsed(startedAt) }, telemetry };
  } finally {
    const closeStartedAt = performance.now();
    await browser?.close();
    telemetry.timing.closeMs = elapsed(closeStartedAt);
    telemetry.timing.totalMs = elapsed(totalStartedAt);
  }
}



export async function evaluateLibrarySelectorCoverage(libDir: string, options: Pick<BrowserQualityOptions, "width" | "height" | "executablePath"> = {}): Promise<{ available: boolean; error?: string; coverage?: SelectorCoverageReport; runtimeErrors?: string[] }> {
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser(options.executablePath);
    const context = await browser.newContext({ viewport: { width: options.width ?? 1024, height: options.height ?? 768 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
    await initializeQualityContext(context);
    const page = await context.newPage();
    const example = await firstExample(libDir);
    const snapshot = await collectBrowserSnapshot(page, "#mount", example, false);
    return { available: true, coverage: snapshot.selectorCoverage, runtimeErrors: snapshot.runtimeErrors };
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await browser?.close();
  }
}
