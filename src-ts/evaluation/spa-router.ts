import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { open, readFile, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { chromium, type Browser, type BrowserContext, type BrowserServer, type Locator, type Page, type Request } from "playwright-core";
import { compareComputedStyles, comparePixels, COMPUTED_STYLE_PROPERTIES } from "./browser.js";
import type { ComputedStyleSnapshot, JsonValue, PixelDiffReport, QualityViewport, StyleComparisonReport } from "../types.js";

export interface SpaRouterFixture {
  /** Exact URL pathname. Kept optional so host-wide fixtures can be expressed explicitly. */
  path?: string;
  /**
   * `transport-suffix` matches a reviewed source endpoint after a runtime transport prefix
   * such as `/dev-api`. Segment boundaries are enforced; arbitrary substring matching is not.
   */
  pathMode?: "exact" | "transport-suffix";
  /** Exact hostname, or a leading-wildcard hostname such as `*.example.com`. */
  hostname?: string;
  method?: string;
  /** Optional Playwright resource type guard, for example `image`, `stylesheet`, or `fetch`. */
  resourceType?: string;
  /** Case-insensitive exact request-header constraints. */
  requestHeaders?: Record<string, string>;
  /** Query constraints. `subset` permits unrelated query keys; `exact` requires the complete query multimap. */
  query?: Record<string, string | string[]>;
  queryMode?: "subset" | "exact";
  status?: number;
  headers?: Record<string, string>;
  /** JSON or raw text response body. Mutually exclusive with bodyBase64. */
  body?: JsonValue;
  /** Base64-encoded binary response body. Mutually exclusive with body. */
  bodyBase64?: string;
}

export type SpaRouterRequestClassification =
  | "non-blocking-telemetry"
  | "non-blocking-configured-host"
  | "blocking-required"
  | "blocking-current-dom-image"
  | "ignored-stale-image";

export type SpaRouterRequestClassificationCounts = Record<SpaRouterRequestClassification, number>;

export interface SpaRouterCanvasStabilityTelemetry {
  /** Time spent reading and hashing raster pixels inside the browser. */
  canvasScanMs: number;
  /** Canvas candidates inspected across stability samples. */
  canvasSamples: number;
  /** Cached signatures reused because no drawing invalidation occurred. */
  canvasCacheHits: number;
  /** Stable raster hashes that changed after a drawing invalidation. */
  canvasSignatureChanges: number;
  /** Coalesced 2D/WebGL drawing batches that invalidated a canvas between samples. */
  canvasInvalidations: number;
  /** Reviewed ZRender canvas targets discovered in the capture scope. */
  animationTargetSamples: number;
  /** ZRender targets with a completed frame-drain certificate at capture time. */
  animationCompletedSamples: number;
  /** Samples that still observed at least one active ZRender target. */
  animationPendingSamples: number;
  /** Version-specific completion transitions observed by the runner. */
  animationCompletionSignals: number;
  /** Completion signals attributable to an ECharts host (`_echarts_instance_`). */
  echartsCompletionSignals: number;
  /** Completion signals attributable to standalone ZRender canvases. */
  zrenderCompletionSignals: number;
}

export type SpaRouterRoleValue = string | { default?: string; reference?: string; generated?: string };

export interface SpaRouterStep {
  action: "click" | "dblclick" | "hover" | "input" | "key" | "back" | "forward" | "reload" | "wait";
  target?: SpaRouterRoleValue;
  value?: string;
  key?: string;
  ms?: number;
}

export interface SpaRouterAssertion {
  path?: SpaRouterRoleValue;
  search?: SpaRouterRoleValue;
  hash?: SpaRouterRoleValue;
  visibleText?: string;
  visibleSelector?: SpaRouterRoleValue;
  absentText?: string;
  absentExactText?: string;
  absentSelector?: SpaRouterRoleValue;
  selectorCount?: { target: SpaRouterRoleValue; count: number };
  inputValue?: { target: SpaRouterRoleValue; value: string };
}

export type SpaRouterRoleSelector = SpaRouterRoleValue;

export interface SpaRouterVisualStyleTarget {
  id: string;
  selector: SpaRouterRoleSelector;
}

export interface SpaRouterReviewedSetupState {
  /** Reviewed setup equivalence class, for example an authenticated admin session. */
  stateKey: string;
  /** Number of leading scenario steps that construct the reusable state. */
  checkpointStepCount: number;
  /** Route loaded in a fresh isolated BrowserContext after restoring storage state. */
  resumePath: SpaRouterRoleValue;
  /** Reviewed proof that permits consumers to start before the owner finishes visual capture. */
  checkpointAssertions?: SpaRouterAssertion;
}

export interface SpaRouterScenarioVisualState {
  /** Reviewed viewport ids for this route state. Omit to execute on every configured viewport. */
  viewports?: string[];
  /** Reviewed resource classification used only for conservative capture scheduling. */
  resourceProfile?: "dom" | "canvas";
  /** Scroll alignment target; capture remains viewport-wide unless screenshotRegion is also supplied. */
  screenshotAnchor?: SpaRouterRoleSelector;
  /** Reviewed visual responsibility region. When supplied, pixels are captured only inside this element. */
  screenshotRegion?: SpaRouterRoleSelector;
  styleTargets?: SpaRouterVisualStyleTarget[];
  /**
   * Reviewed declaration that multiple scenarios end in the same visual state.
   * Reuse still requires identical capture selectors, viewport, role, final route,
   * successful assertions, and a previously stable capture.
   */
  reuseStateKey?: string;
}

export interface SpaRouterScenario {
  id: string;
  entryPath: string;
  steps: SpaRouterStep[];
  assertions: SpaRouterAssertion;
  /** Explicit, reviewed permission to reuse a storage-state checkpoint in a fresh BrowserContext. */
  setupState?: SpaRouterReviewedSetupState;
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
  /** Maximum simultaneous target captures after navigation; defaults to visualConcurrency * 2. */
  visualCaptureConcurrency?: number;
  /** Maximum simultaneous Canvas/ECharts captures; defaults to visualCaptureConcurrency. */
  visualCanvasConcurrency?: number;
  /** Maximum simultaneous PNG comparisons; defaults to visualConcurrency. */
  visualPixelConcurrency?: number;
  /** Per-action locator timeout. Execution failures are reported on the scenario instead of aborting the full matrix. */
  actionTimeoutMs?: number;
  browserShutdown?: "graceful" | "fast-kill";
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
  nonBlockingNetworkHosts?: string[];
  ignoredStateKeys?: string[];
  /** strict compares raw History API transitions; semantic compares user-observable route state after each step. */
  navigationComparison?: "strict" | "semantic";
  /** Canonical route aliases applied after each target is normalized relative to its own base URL. */
  semanticRouteAliases?: Record<string, string>;
  fixtures?: SpaRouterFixture[];
  scenarios: SpaRouterScenario[];
  /** Explicitly enables route-state visual replay for scenarios that declare `visual`. */
  visualMatrix?: SpaRouterVisualMatrixConfig;
  execution?: SpaRouterExecutionConfig;
}

export interface SpaRouterSetupArtifactIdentity {
  sourceCommit: string;
  fixtureHash: string;
  configHash: string;
}

export interface SpaRouterSetupArtifactCompatibility {
  compatible: boolean;
  mismatches: Array<"source-commit" | "fixture-hash" | "config-hash">;
}

export interface SpaRouterTransition {
  method: "pushState" | "replaceState" | "popstate" | "hashchange";
  target: string;
  state: string;
}

export interface SpaRouterStepRoute {
  stepIndex: number;
  action: SpaRouterStep["action"];
  route: string;
}

export interface SpaRouterScenarioTiming {
  queueWaitMs: number;
  contextCreateMs: number;
  instrumentationMs: number;
  routeRegistrationMs: number;
  pageCreateMs: number;
  navigationMs: number;
  initialSettleMs: number;
  setupPrefixStepsMs: number;
  remainingStepsMs: number;
  checkpointStorageMs: number;
  checkpointVerificationMs: number;
  assertionMs: number;
  visualCaptureMs: number;
  contextCloseMs: number;
  totalMs: number;
  steps: Array<{ stepIndex: number; action: SpaRouterStep["action"]; durationMs: number; setupPrefix: boolean }>;
}


export interface SpaRouterVisualStabilityTelemetry {
  resourceReadinessMs: number;
  signatureScanMs: number;
  networkProbeMs: number;
  samples: number;
  stableFrameSamples: number;
  mutationBlockedSamples: number;
  resizeBlockedSamples: number;
  canvasBlockedSamples: number;
  layoutBlockedSamples: number;
  networkBlockedSamples: number;
}

export interface SpaRouterVisualCaptureTiming {
  captureQueueWaitMs: number;
  canvasQueueWaitMs: number;
  preAnchorStabilityMs: number;
  anchorMs: number;
  postAnchorStabilityMs: number;
  computedStyleMs: number;
  screenshotMs: number;
  totalMs: number;
}

export interface SpaRouterVisualViewportTiming {
  queueWaitMs: number;
  referenceTargetMs: number;
  generatedTargetMs: number;
  contextCreateMs: number;
  navigationMs: number;
  initialSettleMs: number;
  scenarioStepsMs: number;
  assertionMs: number;
  contextCloseMs: number;
  captureQueueWaitMs: number;
  canvasQueueWaitMs: number;
  preAnchorStabilityMs: number;
  anchorMs: number;
  postAnchorStabilityMs: number;
  computedStyleMs: number;
  screenshotMs: number;
  pixelQueueWaitMs: number;
  pixelCompareMs: number;
  totalMs: number;
}

export interface SpaRouterVisualSchedulerTelemetry {
  configuredViewportConcurrency: number;
  configuredCaptureConcurrency: number;
  configuredCanvasConcurrency: number;
  configuredPixelConcurrency: number;
  maxActiveViewports: number;
  maxActiveContexts: number;
  maxActiveCaptures: number;
  maxActiveCanvasCaptures: number;
  maxActivePixelComparisons: number;
  viewportQueueWaitMs: number;
  captureQueueWaitMs: number;
  canvasQueueWaitMs: number;
  pixelQueueWaitMs: number;
}

export interface SpaRouterSetupOwnerTiming {
  ownerRuns: number;
  totalMs: number;
  contextCreateMs: number;
  instrumentationMs: number;
  routeRegistrationMs: number;
  pageCreateMs: number;
  navigationMs: number;
  initialSettleMs: number;
  setupPrefixStepsMs: number;
  checkpointStorageMs: number;
  checkpointVerificationMs: number;
  assertionMs: number;
  visualCaptureMs: number;
}

export interface SpaRouterScenarioResult {
  id: string;
  passed: boolean;
  entryUrl: string;
  finalUrl: string;
  transitions: SpaRouterTransition[];
  stepRoutes: SpaRouterStepRoute[];
  runtimeErrors: string[];
  unmockedApiRequests: string[];
  requiredNetworkFailures: string[];
  nonBlockingNetworkFailures: string[];
  assertionFailures: string[];
  durationMs: number;
  timing: SpaRouterScenarioTiming;
  setupStateKey?: string;
  setupStateReused?: boolean;
  setupStepsSkipped?: number;
  setupCheckpointPublished?: boolean;
}

export interface SpaRouterTargetReport {
  baseUrl: string;
  passed: boolean;
  scenariosPassed: number;
  scenariosTotal: number;
  runtimeErrors: number;
  unmockedApiRequests: number;
  requiredNetworkFailures: number;
  nonBlockingNetworkFailures: number;
  setupStateReusedRuns: number;
  setupStepsSkipped: number;
  setupCheckpointsPublished: number;
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
  | "step-route-count-mismatch"
  | "step-route-mismatch"
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
  referenceRegion: string | null;
  generatedRegion: string | null;
  referenceRegionRect: SpaRouterCaptureRect | null;
  generatedRegionRect: SpaRouterCaptureRect | null;
  runtimeErrors: number;
  unmockedApiRequests: number;
  requiredNetworkFailures: number;
  requiredNetworkFailureDetails: string[];
  nonBlockingNetworkFailureDetails: string[];
  stabilityFailures: string[];
  adaptiveWaitMs: number;
  preAnchorWaitMs: number;
  postAnchorWaitMs: number;
  postAnchorSkipped: boolean;
  visualStateReused: boolean;
  referenceVisualStateReuseKey: string | null;
  generatedVisualStateReuseKey: string | null;
  referenceSetupStateReused: boolean;
  generatedSetupStateReused: boolean;
  referenceSetupStepsSkipped: number;
  generatedSetupStepsSkipped: number;
  canvas: SpaRouterCanvasStabilityTelemetry;
  stability: SpaRouterVisualStabilityTelemetry;
  timing: SpaRouterVisualViewportTiming;
  requestClassifications: SpaRouterRequestClassificationCounts;
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
  requiredNetworkFailures: number;
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
  preAnchorWaitMs: number;
  postAnchorWaitMs: number;
  postAnchorSkippedRuns: number;
  visualStateReusedRuns: number;
  setupStateReusedTargetRuns: number;
  setupStepsSkipped: number;
  canvas: SpaRouterCanvasStabilityTelemetry;
  stability: SpaRouterVisualStabilityTelemetry;
  timing: SpaRouterVisualViewportTiming;
  scheduler: SpaRouterVisualSchedulerTelemetry;
  requestClassifications: SpaRouterRequestClassificationCounts;
}

export interface SpaRouterActiveHandleSnapshot {
  totalHandles: number;
  totalBlockingHandles: number;
  standardIoHandles: number;
  handlesByType: Record<string, number>;
  resourcesByType: Record<string, number>;
  requestsByType: Record<string, number>;
}

export interface SpaRouterExecutionTelemetry {
  contractTargetRuns: number;
  visualViewportRuns: number;
  visualTargetRuns: number;
  visualTargetReusedRuns: number;
  visualTargetFreshRuns: number;
  visualStabilityFailures: number;
  visualAdaptiveWaitMs: number;
  visualPreAnchorWaitMs: number;
  visualPostAnchorWaitMs: number;
  visualPostAnchorSkippedRuns: number;
  visualStateReusedRuns: number;
  contractSetupStateReusedRuns: number;
  contractSetupStepsSkipped: number;
  visualSetupStateReusedRuns: number;
  visualSetupStepsSkipped: number;
  contractSetupOwnerTiming: SpaRouterSetupOwnerTiming;
  visualCanvas: SpaRouterCanvasStabilityTelemetry;
  visualStability: SpaRouterVisualStabilityTelemetry;
  visualRunTiming: SpaRouterVisualViewportTiming;
  visualScheduler: SpaRouterVisualSchedulerTelemetry;
  visualRequestClassifications: SpaRouterRequestClassificationCounts;
  contractConcurrency: number;
  visualConcurrency: number;
  browserShutdownMode: "graceful" | "profiled-graceful" | "fast-kill" | "graceful-fallback";
  fastShutdownUsed: boolean;
  fastShutdownConfirmed: boolean;
  fastShutdownLockAcquired: boolean;
  fastShutdownLockWaitMs: number;
  activeHandlesBeforeClose: SpaRouterActiveHandleSnapshot;
  activeHandlesAfterClose: SpaRouterActiveHandleSnapshot;
  timing: {
    browserLaunchMs: number;
    contractMs: number;
    comparisonMs: number;
    visualMatrixMs: number;
    browserCloseMs: number;
    browserDisconnectMs: number;
    browserProcessCloseMs: number;
    reportReadyMs: number;
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
  requiredNetworkFailures: number;
  nonBlockingNetworkFailures: number;
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

export interface SpaRouterCaptureRect { x: number; y: number; width: number; height: number; }

type SpaRouterTargetRole = "single" | "reference" | "generated";
interface SpaRouterVisualCapture {
  screenshot: Buffer;
  styles: ComputedStyleSnapshot[];
  anchor: string | null;
  region: string | null;
  regionRect: SpaRouterCaptureRect | null;
  failures: string[];
  stabilityFailures: string[];
  adaptiveWaitMs: number;
  preAnchorWaitMs: number;
  postAnchorWaitMs: number;
  postAnchorSkipped: boolean;
  canvas: SpaRouterCanvasStabilityTelemetry;
  stability: SpaRouterVisualStabilityTelemetry;
  timing: SpaRouterVisualCaptureTiming;
  reusedStateKey?: string;
  requestClassifications: SpaRouterRequestClassificationCounts;
}
interface SpaRouterScenarioExecution {
  result: SpaRouterScenarioResult;
  visual?: SpaRouterVisualCapture;
  visualStateReused?: boolean;
}
type SpaRouterStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
interface CachedSpaSetupState {
  storageState: SpaRouterStorageState;
  checkpointRoute: string;
  reusable: boolean;
}
type SpaSetupStateCache = Map<string, Promise<CachedSpaSetupState>>;

interface SpaRouterTargetEvaluation {
  report: SpaRouterTargetReport;
  executions: Map<string, SpaRouterScenarioExecution>;
  setupStateCache: SpaSetupStateCache;
}

const REQUEST_CLASSIFICATIONS: SpaRouterRequestClassification[] = [
  "non-blocking-telemetry",
  "non-blocking-configured-host",
  "blocking-required",
  "blocking-current-dom-image",
  "ignored-stale-image",
];

function emptyRequestClassificationCounts(): SpaRouterRequestClassificationCounts {
  return Object.fromEntries(REQUEST_CLASSIFICATIONS.map((classification) => [classification, 0])) as SpaRouterRequestClassificationCounts;
}

function countRequestClassifications(classifications: Iterable<SpaRouterRequestClassification>): SpaRouterRequestClassificationCounts {
  const counts = emptyRequestClassificationCounts();
  for (const classification of classifications) counts[classification] += 1;
  return counts;
}

function addRequestClassificationCounts(...entries: SpaRouterRequestClassificationCounts[]): SpaRouterRequestClassificationCounts {
  const totals = emptyRequestClassificationCounts();
  for (const entry of entries) for (const classification of REQUEST_CLASSIFICATIONS) totals[classification] += entry[classification] ?? 0;
  return totals;
}

function emptyCanvasStabilityTelemetry(): SpaRouterCanvasStabilityTelemetry {
  return {
    canvasScanMs: 0, canvasSamples: 0, canvasCacheHits: 0, canvasSignatureChanges: 0, canvasInvalidations: 0,
    animationTargetSamples: 0, animationCompletedSamples: 0, animationPendingSamples: 0,
    animationCompletionSignals: 0, echartsCompletionSignals: 0, zrenderCompletionSignals: 0,
  };
}

function addCanvasStabilityTelemetry(...entries: SpaRouterCanvasStabilityTelemetry[]): SpaRouterCanvasStabilityTelemetry {
  const total = emptyCanvasStabilityTelemetry();
  for (const entry of entries) {
    total.canvasScanMs = Number((total.canvasScanMs + entry.canvasScanMs).toFixed(3));
    total.canvasSamples += entry.canvasSamples;
    total.canvasCacheHits += entry.canvasCacheHits;
    total.canvasSignatureChanges += entry.canvasSignatureChanges;
    total.canvasInvalidations += entry.canvasInvalidations;
    total.animationTargetSamples += entry.animationTargetSamples;
    total.animationCompletedSamples += entry.animationCompletedSamples;
    total.animationPendingSamples += entry.animationPendingSamples;
    total.animationCompletionSignals += entry.animationCompletionSignals;
    total.echartsCompletionSignals += entry.echartsCompletionSignals;
    total.zrenderCompletionSignals += entry.zrenderCompletionSignals;
  }
  return total;
}

function emptyVisualStabilityTelemetry(): SpaRouterVisualStabilityTelemetry {
  return {
    resourceReadinessMs: 0, signatureScanMs: 0, networkProbeMs: 0, samples: 0, stableFrameSamples: 0,
    mutationBlockedSamples: 0, resizeBlockedSamples: 0, canvasBlockedSamples: 0, layoutBlockedSamples: 0, networkBlockedSamples: 0,
  };
}

function addVisualStabilityTelemetry(...entries: SpaRouterVisualStabilityTelemetry[]): SpaRouterVisualStabilityTelemetry {
  const total = emptyVisualStabilityTelemetry();
  for (const entry of entries) {
    for (const key of Object.keys(total) as Array<keyof SpaRouterVisualStabilityTelemetry>) {
      total[key] = Number((total[key] + entry[key]).toFixed(3));
    }
  }
  return total;
}

function emptyVisualCaptureTiming(): SpaRouterVisualCaptureTiming {
  return { captureQueueWaitMs: 0, canvasQueueWaitMs: 0, preAnchorStabilityMs: 0, anchorMs: 0, postAnchorStabilityMs: 0, computedStyleMs: 0, screenshotMs: 0, totalMs: 0 };
}

function addVisualCaptureTiming(...entries: SpaRouterVisualCaptureTiming[]): SpaRouterVisualCaptureTiming {
  const total = emptyVisualCaptureTiming();
  for (const entry of entries) for (const key of Object.keys(total) as Array<keyof SpaRouterVisualCaptureTiming>) total[key] = Number((total[key] + entry[key]).toFixed(3));
  return total;
}

function emptyVisualViewportTiming(): SpaRouterVisualViewportTiming {
  return {
    queueWaitMs: 0, referenceTargetMs: 0, generatedTargetMs: 0, contextCreateMs: 0, navigationMs: 0, initialSettleMs: 0,
    scenarioStepsMs: 0, assertionMs: 0, contextCloseMs: 0, captureQueueWaitMs: 0, canvasQueueWaitMs: 0,
    preAnchorStabilityMs: 0, anchorMs: 0, postAnchorStabilityMs: 0, computedStyleMs: 0, screenshotMs: 0,
    pixelQueueWaitMs: 0, pixelCompareMs: 0, totalMs: 0,
  };
}

function addVisualViewportTiming(...entries: SpaRouterVisualViewportTiming[]): SpaRouterVisualViewportTiming {
  const total = emptyVisualViewportTiming();
  for (const entry of entries) for (const key of Object.keys(total) as Array<keyof SpaRouterVisualViewportTiming>) total[key] = Number((total[key] + entry[key]).toFixed(3));
  return total;
}

interface SemaphoreLease { waitMs: number; release: () => void; }

class AuditedSemaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  maxActive = 0;
  totalWaitMs = 0;

  constructor(readonly capacity: number) {}

  async acquire(): Promise<SemaphoreLease> {
    const startedAt = performance.now();
    if (this.active < this.capacity) this.active += 1;
    else await new Promise<void>((resolveWaiter) => this.waiting.push(resolveWaiter));
    this.maxActive = Math.max(this.maxActive, this.active);
    const waitMs = Number((performance.now() - startedAt).toFixed(3));
    this.totalWaitMs = Number((this.totalWaitMs + waitMs).toFixed(3));
    let released = false;
    return {
      waitMs,
      release: () => {
        if (released) return;
        released = true;
        const next = this.waiting.shift();
        if (next) next();
        else this.active -= 1;
      },
    };
  }
}

class SpaVisualResourceScheduler {
  readonly capture: AuditedSemaphore;
  readonly canvas: AuditedSemaphore;
  readonly pixel: AuditedSemaphore;
  private activeViewports = 0;
  private activeContexts = 0;
  maxActiveViewports = 0;
  maxActiveContexts = 0;
  viewportQueueWaitMs = 0;

  constructor(readonly viewportConcurrency: number, captureConcurrency: number, canvasConcurrency: number, pixelConcurrency: number) {
    this.capture = new AuditedSemaphore(captureConcurrency);
    this.canvas = new AuditedSemaphore(canvasConcurrency);
    this.pixel = new AuditedSemaphore(pixelConcurrency);
  }

  viewportStarted(queueWaitMs: number): void {
    this.viewportQueueWaitMs = Number((this.viewportQueueWaitMs + queueWaitMs).toFixed(3));
    this.activeViewports += 1;
    this.maxActiveViewports = Math.max(this.maxActiveViewports, this.activeViewports);
  }
  viewportFinished(): void { this.activeViewports = Math.max(0, this.activeViewports - 1); }
  contextOpened(): void { this.activeContexts += 1; this.maxActiveContexts = Math.max(this.maxActiveContexts, this.activeContexts); }
  contextClosed(): void { this.activeContexts = Math.max(0, this.activeContexts - 1); }

  async acquireCapture(profile: "dom" | "canvas"): Promise<{ captureWaitMs: number; canvasWaitMs: number; release: () => void }> {
    const canvasLease = profile === "canvas" ? await this.canvas.acquire() : undefined;
    const captureLease = await this.capture.acquire();
    return {
      captureWaitMs: captureLease.waitMs,
      canvasWaitMs: canvasLease?.waitMs ?? 0,
      release: () => { captureLease.release(); canvasLease?.release(); },
    };
  }

  telemetry(): SpaRouterVisualSchedulerTelemetry {
    return {
      configuredViewportConcurrency: this.viewportConcurrency,
      configuredCaptureConcurrency: this.capture.capacity,
      configuredCanvasConcurrency: this.canvas.capacity,
      configuredPixelConcurrency: this.pixel.capacity,
      maxActiveViewports: this.maxActiveViewports,
      maxActiveContexts: this.maxActiveContexts,
      maxActiveCaptures: this.capture.maxActive,
      maxActiveCanvasCaptures: this.canvas.maxActive,
      maxActivePixelComparisons: this.pixel.maxActive,
      viewportQueueWaitMs: this.viewportQueueWaitMs,
      captureQueueWaitMs: this.capture.totalWaitMs,
      canvasQueueWaitMs: this.canvas.totalWaitMs,
      pixelQueueWaitMs: this.pixel.totalWaitMs,
    };
  }
}

function emptyVisualSchedulerTelemetry(config: SpaRouterContractConfig): SpaRouterVisualSchedulerTelemetry {
  const viewport = config.execution?.visualConcurrency ?? 1;
  return {
    configuredViewportConcurrency: viewport,
    configuredCaptureConcurrency: config.execution?.visualCaptureConcurrency ?? viewport * 2,
    configuredCanvasConcurrency: config.execution?.visualCanvasConcurrency ?? config.execution?.visualCaptureConcurrency ?? viewport * 2,
    configuredPixelConcurrency: config.execution?.visualPixelConcurrency ?? viewport,
    maxActiveViewports: 0, maxActiveContexts: 0, maxActiveCaptures: 0, maxActiveCanvasCaptures: 0, maxActivePixelComparisons: 0,
    viewportQueueWaitMs: 0, captureQueueWaitMs: 0, canvasQueueWaitMs: 0, pixelQueueWaitMs: 0,
  };
}

function emptySetupOwnerTiming(): SpaRouterSetupOwnerTiming {
  return { ownerRuns: 0, totalMs: 0, contextCreateMs: 0, instrumentationMs: 0, routeRegistrationMs: 0, pageCreateMs: 0, navigationMs: 0, initialSettleMs: 0, setupPrefixStepsMs: 0, checkpointStorageMs: 0, checkpointVerificationMs: 0, assertionMs: 0, visualCaptureMs: 0 };
}

function summarizeSetupOwnerTiming(...reports: SpaRouterTargetReport[]): SpaRouterSetupOwnerTiming {
  const total = emptySetupOwnerTiming();
  for (const result of reports.flatMap((report) => report.results).filter((item) => item.setupCheckpointPublished)) {
    total.ownerRuns += 1;
    for (const key of ["totalMs", "contextCreateMs", "instrumentationMs", "routeRegistrationMs", "pageCreateMs", "navigationMs", "initialSettleMs", "setupPrefixStepsMs", "checkpointStorageMs", "checkpointVerificationMs", "assertionMs", "visualCaptureMs"] as const) {
      total[key] = Number((total[key] + result.timing[key]).toFixed(3));
    }
  }
  return total;
}

const DEFAULT_VISUAL_VIEWPORTS: QualityViewport[] = [
  { id: "desktop", label: "Desktop", width: 1024, height: 768 },
  { id: "tablet", label: "Tablet", width: 768, height: 1024 },
  { id: "mobile", label: "Mobile", width: 390, height: 844 },
];
const NAVIGATION_FAILURE_REASONS = new Set<SpaRouterComparisonFailureReason>([
  "missing-reference-scenario", "missing-generated-scenario", "transition-count-mismatch", "transition-method-mismatch",
  "transition-target-mismatch", "transition-state-mismatch", "step-route-count-mismatch", "step-route-mismatch", "final-route-mismatch",
]);

function countByType(names: string[]): Record<string, number> {
  return names.reduce<Record<string, number>>((counts, name) => { counts[name] = (counts[name] ?? 0) + 1; return counts; }, {});
}

function classifyHandleName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("timer") || lower.includes("timeout") || lower.includes("immediate")) return "timer";
  if (lower.includes("server") || lower.includes("tcpserver")) return "server";
  if (lower.includes("socket") || lower.includes("tcp")) return "socket";
  if (lower.includes("pipe")) return "pipe";
  if (lower.includes("child")) return "child-process";
  if (lower.includes("fs") || lower.includes("file")) return "filesystem";
  return name || "unknown";
}

function activeHandleSnapshot(): SpaRouterActiveHandleSnapshot {
  const nodeProcess = process as typeof process & {
    _getActiveHandles?: () => unknown[];
    _getActiveRequests?: () => unknown[];
    getActiveResourcesInfo?: () => string[];
  };
  const handles = (nodeProcess._getActiveHandles?.() ?? []).map((handle) => {
    const candidate = handle as { constructor?: { name?: string }; fd?: number };
    if (handle === process.stdin || handle === process.stdout || handle === process.stderr || [0, 1, 2].includes(candidate.fd ?? -1)) return "stdio";
    return classifyHandleName(candidate.constructor?.name ?? "unknown");
  });
  const requests = (nodeProcess._getActiveRequests?.() ?? []).map((request) => classifyHandleName((request as { constructor?: { name?: string } })?.constructor?.name ?? "unknown"));
  const resources = (nodeProcess.getActiveResourcesInfo?.() ?? []).map(classifyHandleName);
  const standardIoHandles = handles.filter((name) => name === "stdio").length;
  return { totalHandles: handles.length, totalBlockingHandles: handles.length - standardIoHandles, standardIoHandles, handlesByType: countByType(handles), resourcesByType: countByType(resources), requestsByType: countByType(requests) };
}

const FAST_SHUTDOWN_LOCK_PATH = resolve(tmpdir(), "ui-dismantler-playwright-fast-shutdown.lock");
const sleep = (ms: number): Promise<void> => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function withFastShutdownLock<T>(worker: () => Promise<T>): Promise<{ acquired: boolean; waitMs: number; value?: T }> {
  const startedAt = performance.now();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let handle;
    try {
      handle = await open(FAST_SHUTDOWN_LOCK_PATH, "wx");
      await handle.writeFile(`${process.pid}\n`, "utf8");
      try { return { acquired: true, waitMs: Number((performance.now() - startedAt).toFixed(3)), value: await worker() }; }
      finally { await handle.close().catch(() => undefined); await unlink(FAST_SHUTDOWN_LOCK_PATH).catch(() => undefined); }
    } catch (error) {
      await handle?.close().catch(() => undefined);
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") return { acquired: false, waitMs: Number((performance.now() - startedAt).toFixed(3)) };
      let stale = false;
      try {
        const info = await stat(FAST_SHUTDOWN_LOCK_PATH);
        stale = Date.now() - info.mtimeMs > 30_000;
        if (!stale) {
          const owner = Number((await readFile(FAST_SHUTDOWN_LOCK_PATH, "utf8")).trim());
          if (Number.isInteger(owner) && owner > 0) { try { process.kill(owner, 0); } catch { stale = true; } }
        }
      } catch { stale = true; }
      if (stale) await unlink(FAST_SHUTDOWN_LOCK_PATH).catch(() => undefined);
      else await sleep(50);
    }
  }
  return { acquired: false, waitMs: Number((performance.now() - startedAt).toFixed(3)) };
}

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

async function launchSpaBrowser(executablePath?: string, forceServer = false): Promise<{ browser: Browser; server?: BrowserServer }> {
  const launchOptions = { executablePath: chromePath(executablePath), headless: true };
  if (forceServer || process.env.UI_DISMANTLER_BROWSER_SHUTDOWN_PROFILE === "1") {
    const server = await chromium.launchServer(launchOptions);
    const browser = await chromium.connect(server.wsEndpoint());
    return { browser, server };
  }
  return { browser: await chromium.launch(launchOptions) };
}

async function terminateBrowserServerFast(server: BrowserServer): Promise<boolean> {
  const child = server.process();
  if (child.exitCode !== null || child.signalCode !== null) return true;
  const exited = new Promise<boolean>((resolveExit) => child.once("exit", () => resolveExit(true)));
  child.kill("SIGKILL");
  child.unref();
  const confirmed = await Promise.race([exited, new Promise<boolean>((resolveTimeout) => setTimeout(() => resolveTimeout(false), 1000))]);
  if (!confirmed) { await server.kill(); const streams = [child.stdin, child.stdout, child.stderr]; for (const stream of streams) stream?.destroy(); return false; }
  // The browser server owns these child stdio streams. Destroy them only after
  // the owned Chromium process has exited so fast shutdown cannot affect an
  // unrelated process or hide a still-running browser.
  for (const stream of [child.stdin, child.stdout, child.stderr]) stream?.destroy();
  // launchServer also owns a Playwright WebSocket listener. The public
  // BrowserServer API does not expose that listener; close the version-guarded
  // internal hook after the browser process is confirmed dead.
  const internal = server as BrowserServer & { _disconnectForTest?: () => Promise<void> };
  if (typeof internal._disconnectForTest === "function") {
    await Promise.race([internal._disconnectForTest().catch(() => undefined), new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 500))]);
  }
  return true;
}

function targetUrl(baseUrl: string, path: string): string { return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).href; }
function routeOf(value: string): string { const url = new URL(value); return `${url.pathname}${url.search}${url.hash}`; }
function semanticRouteOf(value: string, baseUrl: string, aliases: Record<string, string> = {}): string {
  const url = new URL(value, baseUrl), base = new URL(baseUrl);
  const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  let relativePath = url.pathname;
  if (relativePath === base.pathname || relativePath === basePath) relativePath = "/";
  else if (relativePath.startsWith(basePath)) relativePath = `/${relativePath.slice(basePath.length)}`;
  if (!relativePath.startsWith("/")) relativePath = `/${relativePath}`;
  const semanticHash = url.hash === "#/" ? "" : url.hash;
  const route = `${relativePath}${url.search}${semanticHash}`;
  return aliases[route] ?? route;
}
function valueForRole(value: SpaRouterRoleValue | undefined, role: SpaRouterTargetRole): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (role === "generated") return value.generated ?? value.default ?? value.reference;
  return value.reference ?? value.default ?? value.generated;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function sha256Json(value: unknown): string { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }

export function createSpaSetupArtifactIdentity(config: SpaRouterContractConfig, sourceCommit: string, targetRevision: SpaRouterRoleValue): SpaRouterSetupArtifactIdentity {
  const setupScenarios = config.scenarios.filter((scenario) => scenario.setupState).map((scenario) => ({
    id: scenario.id, entryPath: scenario.entryPath, steps: scenario.steps, assertions: scenario.assertions, setupState: scenario.setupState,
  }));
  return {
    sourceCommit,
    fixtureHash: sha256Json(config.fixtures ?? []),
    configHash: sha256Json({
      schemaVersion: config.schemaVersion, apiPrefix: config.apiPrefix ?? null, ignoredStateKeys: config.ignoredStateKeys ?? [],
      navigationComparison: config.navigationComparison ?? "strict", semanticRouteAliases: config.semanticRouteAliases ?? {},
      setupScenarios, targetRevision,
    }),
  };
}

export function compareSpaSetupArtifactIdentity(expected: SpaRouterSetupArtifactIdentity, actual: SpaRouterSetupArtifactIdentity): SpaRouterSetupArtifactCompatibility {
  const mismatches: SpaRouterSetupArtifactCompatibility["mismatches"] = [];
  if (expected.sourceCommit !== actual.sourceCommit) mismatches.push("source-commit");
  if (expected.fixtureHash !== actual.fixtureHash) mismatches.push("fixture-hash");
  if (expected.configHash !== actual.configHash) mismatches.push("config-hash");
  return { compatible: mismatches.length === 0, mismatches };
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
  for (const [name, value, maximum] of [
    ["contractConcurrency", config.execution?.contractConcurrency, 4],
    ["visualConcurrency", config.execution?.visualConcurrency, 4],
    ["visualCaptureConcurrency", config.execution?.visualCaptureConcurrency, 8],
    ["visualCanvasConcurrency", config.execution?.visualCanvasConcurrency, 8],
    ["visualPixelConcurrency", config.execution?.visualPixelConcurrency, 4],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > maximum)) throw new TypeError(`execution.${name} 必须是 1..${maximum} 的整数`);
  }
  if (config.execution?.actionTimeoutMs !== undefined && (!Number.isInteger(config.execution.actionTimeoutMs) || config.execution.actionTimeoutMs < 100 || config.execution.actionTimeoutMs > 30_000)) throw new TypeError("execution.actionTimeoutMs 必须是 100..30000 的整数");
  if (config.execution?.browserShutdown && !["graceful", "fast-kill"].includes(config.execution.browserShutdown)) throw new TypeError("execution.browserShutdown 必须是 graceful 或 fast-kill");
  for (const scenario of config.scenarios) {
    if (scenario.visual?.resourceProfile && !["dom", "canvas"].includes(scenario.visual.resourceProfile)) throw new TypeError(`scenario ${scenario.id} visual.resourceProfile 必须是 dom 或 canvas`);
  }
  if (config.navigationComparison && !["strict", "semantic"].includes(config.navigationComparison)) throw new TypeError("navigationComparison 必须是 strict 或 semantic");
  const configuredViewportIds = new Set((config.visualMatrix?.viewports ?? []).map((viewport) => viewport.id));
  for (const scenario of config.scenarios) {
    const scopedViewports = scenario.visual?.viewports ?? [];
    if (scopedViewports.some((id) => !id || (configuredViewportIds.size > 0 && !configuredViewportIds.has(id)))) throw new TypeError(`scenario ${scenario.id} visual.viewports 必须引用 visualMatrix 中已配置的 viewport id`);
    if (new Set(scopedViewports).size !== scopedViewports.length) throw new TypeError(`scenario ${scenario.id} visual.viewports 不能包含重复 id`);
    if (scenario.visual?.reuseStateKey !== undefined && !scenario.visual.reuseStateKey.trim()) throw new TypeError(`scenario ${scenario.id} visual.reuseStateKey 不能为空`);
    if (scenario.setupState) {
      if (!scenario.setupState.stateKey.trim()) throw new TypeError(`scenario ${scenario.id} setupState.stateKey 不能为空`);
      if (!Number.isInteger(scenario.setupState.checkpointStepCount) || scenario.setupState.checkpointStepCount < 1 || scenario.setupState.checkpointStepCount > scenario.steps.length) throw new TypeError(`scenario ${scenario.id} setupState.checkpointStepCount 必须落在 1..steps.length`);
      if (!valueForRole(scenario.setupState.resumePath, mode.mode === "single" ? "single" : "reference") || (mode.mode === "reference-generated" && !valueForRole(scenario.setupState.resumePath, "generated"))) throw new TypeError(`scenario ${scenario.id} setupState.resumePath 必须为双端提供可解析路由`);
    }
  }
  for (const fixture of config.fixtures ?? []) {
    if (!fixture.path && !fixture.hostname) throw new TypeError("SPA Router fixture 必须至少声明 path 或 hostname");
    if (fixture.path && !fixture.path.startsWith("/")) throw new TypeError(`SPA Router fixture path 必须以 / 开头: ${fixture.path}`);
    if (fixture.pathMode && !["exact", "transport-suffix"].includes(fixture.pathMode)) throw new TypeError(`SPA Router fixture pathMode 无效: ${fixture.pathMode}`);
    if (fixture.pathMode && !fixture.path) throw new TypeError("SPA Router fixture 声明 pathMode 时必须同时声明 path");
    if (fixture.hostname && /[:/]/.test(fixture.hostname)) throw new TypeError(`SPA Router fixture hostname 只能包含主机名: ${fixture.hostname}`);
    if (fixture.queryMode && !["subset", "exact"].includes(fixture.queryMode)) throw new TypeError(`SPA Router fixture queryMode 无效: ${fixture.queryMode}`);
    if (fixture.queryMode && !fixture.query) throw new TypeError("SPA Router fixture 声明 queryMode 时必须同时声明 query");
    const hasBody = fixture.body !== undefined, hasBinaryBody = fixture.bodyBase64 !== undefined;
    if (hasBody === hasBinaryBody) throw new TypeError("SPA Router fixture 必须且只能声明 body 或 bodyBase64");
    if (fixture.bodyBase64 !== undefined && (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(fixture.bodyBase64))) throw new TypeError("SPA Router fixture bodyBase64 不是合法 Base64");
    if (fixture.requestHeaders && Object.entries(fixture.requestHeaders).some(([name, value]) => !name.trim() || typeof value !== "string")) throw new TypeError("SPA Router fixture requestHeaders 必须是非空 header 名到字符串值的映射");
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
  canvas: SpaRouterCanvasStabilityTelemetry;
  telemetry: SpaRouterVisualStabilityTelemetry;
  token: VisualStabilityToken;
  requestClassifications: SpaRouterRequestClassificationCounts;
}
interface VisualStabilityToken {
  mutationCount: number;
  resizeCount: number;
  canvasInvalidations: number;
  scrollX: number;
  scrollY: number;
}
interface RequestActivity {
  active: Set<Request>;
  lastActivityAt: number;
}

async function readVisualStabilityToken(page: Page): Promise<VisualStabilityToken> {
  return page.evaluate(() => {
    const host = globalThis as typeof globalThis & {
      __uiDismantlerSpaStability?: { mutationCount: number; resizeCount: number };
      __uiDismantlerSpaCanvas?: { invalidations: number };
    };
    return {
      mutationCount: host.__uiDismantlerSpaStability?.mutationCount ?? 0,
      resizeCount: host.__uiDismantlerSpaStability?.resizeCount ?? 0,
      canvasInvalidations: host.__uiDismantlerSpaCanvas?.invalidations ?? 0,
      scrollX,
      scrollY,
    };
  });
}

function sameVisualStabilityToken(left: VisualStabilityToken, right: VisualStabilityToken): boolean {
  return left.mutationCount === right.mutationCount
    && left.resizeCount === right.resizeCount
    && left.canvasInvalidations === right.canvasInvalidations
    && left.scrollX === right.scrollX
    && left.scrollY === right.scrollY;
}

async function initializeVisualStabilityTracking(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    type StabilityState = { lastMutationAt: number; lastResizeAt: number; mutationCount: number; resizeCount: number };
    type CanvasCacheEntry = { version: number; width: number; height: number; hash: number | string };
    type CanvasState = {
      versions: WeakMap<HTMLCanvasElement, number>;
      dirty: WeakSet<HTMLCanvasElement>;
      observedVersions: WeakMap<HTMLCanvasElement, number>;
      cache: WeakMap<HTMLCanvasElement, CanvasCacheEntry>;
      lastInvalidatedAt: WeakMap<HTMLCanvasElement, number>;
      completedVersions: WeakMap<HTMLCanvasElement, number>;
      invalidations: number;
      lastInvalidationAt: number;
    };
    const host = globalThis as typeof globalThis & { __uiDismantlerSpaStability?: StabilityState; __uiDismantlerSpaCanvas?: CanvasState };
    const state: StabilityState = { lastMutationAt: performance.now(), lastResizeAt: performance.now(), mutationCount: 0, resizeCount: 0 };
    const canvasState: CanvasState = {
      versions: new WeakMap(), dirty: new WeakSet(), observedVersions: new WeakMap(), cache: new WeakMap(), lastInvalidatedAt: new WeakMap(), completedVersions: new WeakMap(), invalidations: 0, lastInvalidationAt: performance.now(),
    };
    host.__uiDismantlerSpaStability = state;
    host.__uiDismantlerSpaCanvas = canvasState;
    const invalidateCanvas = (candidate: unknown): void => {
      const canvas = (candidate as { canvas?: unknown } | null)?.canvas;
      if (!(canvas instanceof HTMLCanvasElement)) return;
      // Probe/offscreen canvases created by the quality runner must not keep the
      // reviewed page in a permanently dirty state.
      if (!canvas.isConnected) return;
      if (canvasState.dirty.has(canvas)) return;
      canvasState.dirty.add(canvas);
      canvasState.versions.set(canvas, (canvasState.versions.get(canvas) ?? 0) + 1);
      canvasState.invalidations += 1;
      canvasState.lastInvalidationAt = performance.now();
      canvasState.lastInvalidatedAt.set(canvas, canvasState.lastInvalidationAt);
    };
    const patchDrawingMethods = (prototype: object | undefined, methods: string[]): void => {
      if (!prototype) return;
      for (const method of methods) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
        const native = descriptor?.value;
        if (typeof native !== "function" || (native as { __uiDismantlerCanvasPatched?: boolean }).__uiDismantlerCanvasPatched) continue;
        const wrapped = function(this: unknown, ...args: unknown[]): unknown {
          const result = native.apply(this, args);
          invalidateCanvas(this);
          return result;
        };
        Object.defineProperty(wrapped, "__uiDismantlerCanvasPatched", { value: true });
        Object.defineProperty(prototype, method, { ...descriptor, value: wrapped });
      }
    };
    patchDrawingMethods(globalThis.CanvasRenderingContext2D?.prototype, [
      "clearRect", "fillRect", "strokeRect", "fill", "stroke", "drawImage", "putImageData", "fillText", "strokeText", "reset",
    ]);
    patchDrawingMethods(globalThis.WebGLRenderingContext?.prototype, ["clear", "drawArrays", "drawElements"]);
    patchDrawingMethods(globalThis.WebGL2RenderingContext?.prototype, ["clear", "drawArrays", "drawElements", "blitFramebuffer"]);
    for (const property of ["width", "height"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property);
      if (!descriptor?.set || !descriptor.get) continue;
      const nativeSet = descriptor.set, nativeGet = descriptor.get;
      Object.defineProperty(HTMLCanvasElement.prototype, property, {
        ...descriptor,
        get: nativeGet,
        set(this: HTMLCanvasElement, value: number) { nativeSet.call(this, value); invalidateCanvas({ canvas: this }); },
      });
    }
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

function configuredHostMatches(hostname: string, configuredHost: string): boolean {
  const expected = configuredHost.toLowerCase();
  return expected.startsWith("*.") ? hostname.endsWith(expected.slice(1)) : hostname === expected || hostname.endsWith(`.${expected}`);
}

export function classifySpaRouterNetworkRequest(
  input: { url: string; resourceType: string; domImageReferenced?: boolean },
  config: Pick<SpaRouterContractConfig, "nonBlockingNetworkHosts"> = {},
): SpaRouterRequestClassification {
  let url: URL | null = null;
  try { url = new URL(input.url); } catch { /* malformed URLs remain blocking */ }
  const hostname = url?.hostname.toLowerCase() ?? "";
  const knownTelemetry = ["www.google-analytics.com", "www.googletagmanager.com", "google-analytics.com", "doubleclick.net", "segment.io", "sentry.io", "hotjar.com"];
  const exactGoogleCollect = Boolean(url && (hostname === "www.google.com" || hostname === "google.com") && url.pathname === "/g/collect");
  if (exactGoogleCollect || knownTelemetry.some((host) => hostname === host || hostname.endsWith(`.${host}`))) return "non-blocking-telemetry";
  if ((config.nonBlockingNetworkHosts ?? []).some((host) => configuredHostMatches(hostname, host))) return "non-blocking-configured-host";
  if (input.resourceType === "image") return input.domImageReferenced === false ? "ignored-stale-image" : "blocking-current-dom-image";
  return "blocking-required";
}

async function visibleBlockingRequests(page: Page, requestActivity: RequestActivity, config: SpaRouterContractConfig): Promise<{ blocking: Request[]; classifications: Map<string, SpaRouterRequestClassification> }> {
  const candidates = [...requestActivity.active];
  const imageCandidates = candidates.filter((request) => request.resourceType() === "image");
  const referencedImageUrls = imageCandidates.length
    ? new Set(await page.evaluate(() => [...document.images].map((image) => image.currentSrc || image.src)))
    : new Set<string>();
  const classifications = new Map<string, SpaRouterRequestClassification>();
  const blocking: Request[] = [];
  for (const request of candidates) {
    const classification = classifySpaRouterNetworkRequest({
      url: request.url(),
      resourceType: request.resourceType(),
      domImageReferenced: request.resourceType() === "image" ? referencedImageUrls.has(request.url()) : undefined,
    }, config);
    classifications.set(`${request.method()}|${request.resourceType()}|${request.url()}`, classification);
    if (classification === "blocking-required" || classification === "blocking-current-dom-image") blocking.push(request);
  }
  return { blocking, classifications };
}

async function settleVisual(page: Page, requestActivity: RequestActivity, config: SpaRouterContractConfig, timeoutMs = 1800, scopeSelector?: string): Promise<VisualStabilityResult> {
  const startedAt = Date.now(), quietWindowMs = 120;
  const telemetry = emptyVisualStabilityTelemetry();
  await page.evaluate((selector) => {
    const host = globalThis as typeof globalThis & { __uiDismantlerSpaVisualScope?: { selector: string; state: { lastMutationAt: number; lastResizeAt: number }; disconnect: () => void } };
    host.__uiDismantlerSpaVisualScope?.disconnect();
    let scope: Element | null = null;
    try { scope = selector ? document.querySelector(selector) : document.documentElement; } catch { scope = document.documentElement; }
    const state = { lastMutationAt: performance.now(), lastResizeAt: performance.now() };
    const mutationObserver = new MutationObserver(() => { state.lastMutationAt = performance.now(); });
    const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => { state.lastResizeAt = performance.now(); });
    if (scope) {
      mutationObserver.observe(scope, { subtree: true, childList: true, attributes: true, characterData: true });
      resizeObserver?.observe(scope);
    }
    host.__uiDismantlerSpaVisualScope = { selector: selector ?? "", state, disconnect: () => { mutationObserver.disconnect(); resizeObserver?.disconnect(); } };
  }, scopeSelector ?? "");
  const observedClassifications = new Map<string, SpaRouterRequestClassification>();
  const resourceReadinessStartedAt = performance.now();
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.status !== "loaded") await Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, 1200))]);
    const visibleImages = [...document.images].filter((image) => {
      const style = getComputedStyle(image), rect = image.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
    });
    await Promise.all(visibleImages.map(async (image) => {
      await Promise.race([
        (async () => {
          if (!image.complete) await new Promise<void>((done) => { image.addEventListener("load", () => done(), { once: true }); image.addEventListener("error", () => done(), { once: true }); });
          if (typeof image.decode === "function") await image.decode().catch(() => undefined);
        })(),
        new Promise<void>((done) => setTimeout(done, 1200)),
      ]);
    }));
  });
  telemetry.resourceReadinessMs = Number((performance.now() - resourceReadinessStartedAt).toFixed(3));
  const baselineToken = await readVisualStabilityToken(page);
  let canvasTelemetry = emptyCanvasStabilityTelemetry();
  const deadline = Date.now() + timeoutMs;
  let previousSignature = "", stableSamples = 0;
  let lastBlockingRequests: Request[] = [];
  let lastState = { mutationQuiet: false, resizeQuiet: false, canvasQuiet: false, layoutStable: false, networkQuiet: false };
  while (Date.now() < deadline) {
    const signatureStartedAt = performance.now();
    const sample = await page.evaluate((quietMs) => {
      type CanvasCacheEntry = { version: number; width: number; height: number; hash: number | string };
      const host = globalThis as typeof globalThis & {
        __uiDismantlerSpaVisualScope?: { selector: string; state: { lastMutationAt: number; lastResizeAt: number } };
        __uiDismantlerSpaCanvas?: {
          versions: WeakMap<HTMLCanvasElement, number>;
          dirty: WeakSet<HTMLCanvasElement>;
          observedVersions: WeakMap<HTMLCanvasElement, number>;
          cache: WeakMap<HTMLCanvasElement, CanvasCacheEntry>;
          lastInvalidatedAt: WeakMap<HTMLCanvasElement, number>;
          completedVersions: WeakMap<HTMLCanvasElement, number>;
          lastInvalidationAt: number;
        };
      };
      const now = performance.now(), scoped = host.__uiDismantlerSpaVisualScope;
      let scope: Element = document.documentElement;
      if (scoped?.selector) { try { scope = document.querySelector(scoped.selector) ?? document.documentElement; } catch { scope = document.documentElement; } }
      const elements = [scope, ...[...scope.querySelectorAll("*")]];
      const elementSignature = elements.slice(0, 500).map((element) => {
        const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
        return [element.tagName, element.id, String(element.className), Math.round(rect.x * 10) / 10, Math.round(rect.y * 10) / 10, Math.round(rect.width * 10) / 10, Math.round(rect.height * 10) / 10, style.display, style.visibility, (element.textContent ?? "").length];
      });
      const canvasState = host.__uiDismantlerSpaCanvas;
      const canvasMetrics = {
        canvasScanMs: 0, canvasSamples: 0, canvasCacheHits: 0, canvasSignatureChanges: 0,
        animationTargetSamples: 0, animationCompletedSamples: 0, animationPendingSamples: 0,
        animationCompletionSignals: 0, echartsCompletionSignals: 0, zrenderCompletionSignals: 0,
      };
      let animationTargetsPending = 0;
      const canvasSignature = [...scope.querySelectorAll("canvas")].slice(0, 16).map((canvas) => {
        canvasMetrics.canvasSamples += 1;
        const version = canvasState?.versions.get(canvas) ?? 0;
        const priorObservedVersion = canvasState?.observedVersions.get(canvas);
        const isZrender = canvas.hasAttribute("data-zr-dom-id");
        const isEcharts = isZrender && Boolean(canvas.closest("[_echarts_instance_]"));
        const lastInvalidatedAt = canvasState?.lastInvalidatedAt.get(canvas) ?? canvasState?.lastInvalidationAt ?? now;
        const animationCompleted = isZrender && version > 0 && now - lastInvalidatedAt >= quietMs;
        if (isZrender) {
          canvasMetrics.animationTargetSamples += 1;
          if (animationCompleted) {
            canvasMetrics.animationCompletedSamples += 1;
            if (canvasState?.completedVersions.get(canvas) !== version) {
              canvasState?.completedVersions.set(canvas, version);
              canvasMetrics.animationCompletionSignals += 1;
              if (isEcharts) canvasMetrics.echartsCompletionSignals += 1; else canvasMetrics.zrenderCompletionSignals += 1;
            }
          } else animationTargetsPending += 1;
        }
        canvasState?.observedVersions.set(canvas, version);
        canvasState?.dirty.delete(canvas);
        // A reviewed ZRender frame-drain certificate proves that the changed
        // version is no longer being animated, so it is safe to hash now. A
        // generic Canvas still keeps the conservative one-sample dirty marker.
        if (priorObservedVersion !== undefined && priorObservedVersion !== version && !animationCompleted) return [canvas.width, canvas.height, "dirty", version];
        const cached = canvasState?.cache.get(canvas);
        if (cached && cached.version === version && cached.width === canvas.width && cached.height === canvas.height) {
          canvasMetrics.canvasCacheHits += 1;
          return [canvas.width, canvas.height, cached.hash];
        }
        const scanStartedAt = performance.now();
        try {
          const probe = document.createElement("canvas"); probe.width = 32; probe.height = 32;
          const context = probe.getContext("2d", { willReadFrequently: true });
          let hash: number | string = 0;
          if (context && canvas.width > 0 && canvas.height > 0) {
            context.drawImage(canvas, 0, 0, probe.width, probe.height);
            const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
            let value = 2166136261;
            for (let index = 0; index < pixels.length; index += 1) value = Math.imul(value ^ pixels[index], 16777619);
            hash = value >>> 0;
          }
          if (cached && cached.hash !== hash) canvasMetrics.canvasSignatureChanges += 1;
          canvasState?.cache.set(canvas, { version, width: canvas.width, height: canvas.height, hash });
          return [canvas.width, canvas.height, hash];
        } catch {
          const hash = "unreadable";
          if (cached && cached.hash !== hash) canvasMetrics.canvasSignatureChanges += 1;
          canvasState?.cache.set(canvas, { version, width: canvas.width, height: canvas.height, hash });
          return [canvas.width, canvas.height, hash];
        } finally { canvasMetrics.canvasScanMs += performance.now() - scanStartedAt; }
      });
      if (animationTargetsPending > 0) canvasMetrics.animationPendingSamples += 1;
      const signature = JSON.stringify({ elements: elementSignature, canvases: canvasSignature });
      return {
        signature,
        mutationQuiet: Boolean(scoped && now - scoped.state.lastMutationAt >= quietMs),
        resizeQuiet: Boolean(scoped && now - scoped.state.lastResizeAt >= quietMs),
        canvasQuiet: !canvasState || now - canvasState.lastInvalidationAt >= quietMs,
        canvasMetrics,
      };
    }, quietWindowMs);
    telemetry.signatureScanMs = Number((telemetry.signatureScanMs + performance.now() - signatureStartedAt).toFixed(3));
    telemetry.samples += 1;
    canvasTelemetry = addCanvasStabilityTelemetry(canvasTelemetry, { ...sample.canvasMetrics, canvasInvalidations: 0 });
    stableSamples = sample.signature === previousSignature ? stableSamples + 1 : 0;
    previousSignature = sample.signature;
    const networkProbeStartedAt = performance.now();
    const requestDecision = await visibleBlockingRequests(page, requestActivity, config);
    telemetry.networkProbeMs = Number((telemetry.networkProbeMs + performance.now() - networkProbeStartedAt).toFixed(3));
    lastBlockingRequests = requestDecision.blocking;
    for (const [key, classification] of requestDecision.classifications) observedClassifications.set(key, classification);
    const networkQuiet = lastBlockingRequests.length === 0;
    lastState = { mutationQuiet: sample.mutationQuiet, resizeQuiet: sample.resizeQuiet, canvasQuiet: sample.canvasQuiet, layoutStable: stableSamples >= 2, networkQuiet };
    telemetry.stableFrameSamples = stableSamples;
    if (!lastState.mutationQuiet) telemetry.mutationBlockedSamples += 1;
    if (!lastState.resizeQuiet) telemetry.resizeBlockedSamples += 1;
    if (!lastState.canvasQuiet) telemetry.canvasBlockedSamples += 1;
    if (!lastState.layoutStable) telemetry.layoutBlockedSamples += 1;
    if (!lastState.networkQuiet) telemetry.networkBlockedSamples += 1;
    if (lastState.mutationQuiet && lastState.resizeQuiet && lastState.canvasQuiet && lastState.layoutStable && lastState.networkQuiet) {
      await page.evaluate(() => (globalThis as typeof globalThis & { __uiDismantlerSpaVisualScope?: { disconnect: () => void } }).__uiDismantlerSpaVisualScope?.disconnect());
      const token = await readVisualStabilityToken(page);
      canvasTelemetry.canvasInvalidations = Math.max(0, token.canvasInvalidations - baselineToken.canvasInvalidations);
      return { stabilityFailures: [], adaptiveWaitMs: Date.now() - startedAt, canvas: canvasTelemetry, telemetry, token, requestClassifications: countRequestClassifications(observedClassifications.values()) };
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const stabilityFailures: string[] = [];
  if (!lastState.mutationQuiet) stabilityFailures.push("DOM mutation quiet window was not reached before visual capture");
  if (!lastState.resizeQuiet || !lastState.canvasQuiet || !lastState.layoutStable) stabilityFailures.push("DOM/layout/canvas signature did not remain stable for two consecutive samples before visual capture");
  if (!lastState.networkQuiet) {
    const pending = lastBlockingRequests.slice(0, 6).map((request) => `${request.resourceType()}:${request.method()} ${request.url()}`).join(" | ");
    stabilityFailures.push(`network quiet window was not reached before visual capture: active=${lastBlockingRequests.length}${pending ? `; pending=${pending}` : ""}`);
  }
  await page.evaluate(() => (globalThis as typeof globalThis & { __uiDismantlerSpaVisualScope?: { disconnect: () => void } }).__uiDismantlerSpaVisualScope?.disconnect());
  const token = await readVisualStabilityToken(page);
  canvasTelemetry.canvasInvalidations = Math.max(0, token.canvasInvalidations - baselineToken.canvasInvalidations);
  return { stabilityFailures, adaptiveWaitMs: Date.now() - startedAt, canvas: canvasTelemetry, telemetry, token, requestClassifications: countRequestClassifications(observedClassifications.values()) };
}

async function executeStep(page: Page, step: SpaRouterStep, role: SpaRouterTargetRole): Promise<void> {
  if (step.action === "wait") { await page.waitForTimeout(step.ms ?? 250); return; }
  if (step.action === "back") { await page.goBack({ waitUntil: "domcontentloaded" }); await settle(page); return; }
  if (step.action === "forward") { await page.goForward({ waitUntil: "domcontentloaded" }); await settle(page); return; }
  if (step.action === "reload") { await page.reload({ waitUntil: "domcontentloaded" }); await settle(page); return; }
  const target = valueForRole(step.target, role);
  if (!target) throw new TypeError(`${step.action} step 缺少 ${role} target`);
  const locator = page.locator(target).first();
  if (step.action === "click") await locator.click();
  else if (step.action === "dblclick") await locator.dblclick();
  else if (step.action === "hover") await locator.hover();
  else if (step.action === "input") await locator.fill(step.value ?? "");
  else if (step.action === "key") { await locator.focus(); await locator.press(step.key ?? "Enter"); }
  await settle(page);
}

async function locatorHasVisibleMatch(locator: Locator): Promise<boolean> {
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < Math.min(count, 100); index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

async function assertScenario(page: Page, assertion: SpaRouterAssertion, role: SpaRouterTargetRole): Promise<string[]> {
  const failures: string[] = [];
  const url = new URL(page.url());
  const expectedPath = valueForRole(assertion.path, role), expectedSearch = valueForRole(assertion.search, role), expectedHash = valueForRole(assertion.hash, role);
  if (expectedPath !== undefined && url.pathname !== expectedPath) failures.push(`path expected=${expectedPath} actual=${url.pathname}`);
  if (expectedSearch !== undefined && url.search !== expectedSearch) failures.push(`search expected=${expectedSearch} actual=${url.search}`);
  if (expectedHash !== undefined && url.hash !== expectedHash) failures.push(`hash expected=${expectedHash} actual=${url.hash}`);
  if (assertion.visibleText !== undefined && !(await locatorHasVisibleMatch(page.getByText(assertion.visibleText, { exact: false })))) failures.push(`visibleText missing=${assertion.visibleText}`);
  const visibleSelector = valueForRole(assertion.visibleSelector, role);
  if (visibleSelector !== undefined && !(await locatorHasVisibleMatch(page.locator(visibleSelector)))) failures.push(`visibleSelector missing=${visibleSelector}`);
  if (assertion.absentText !== undefined && await locatorHasVisibleMatch(page.getByText(assertion.absentText, { exact: false }))) failures.push(`absentText still visible=${assertion.absentText}`);
  if (assertion.absentExactText !== undefined && await locatorHasVisibleMatch(page.getByText(assertion.absentExactText, { exact: true }))) failures.push(`absentExactText still visible=${assertion.absentExactText}`);
  const absentSelector = valueForRole(assertion.absentSelector, role);
  if (absentSelector !== undefined && await locatorHasVisibleMatch(page.locator(absentSelector))) failures.push(`absentSelector still visible=${absentSelector}`);
  if (assertion.selectorCount !== undefined) {
    const target = valueForRole(assertion.selectorCount.target, role);
    if (!target) failures.push(`selectorCount missing ${role} target`);
    else {
      const count = await page.locator(target).count();
      if (count !== assertion.selectorCount.count) failures.push(`selectorCount ${target} expected=${assertion.selectorCount.count} actual=${count}`);
    }
  }
  if (assertion.inputValue !== undefined) {
    const target = valueForRole(assertion.inputValue.target, role);
    if (!target) failures.push(`inputValue missing ${role} target`);
    else {
      const value = await page.locator(target).first().inputValue().catch(() => "<missing>");
      if (value !== assertion.inputValue.value) failures.push(`inputValue ${target} expected=${assertion.inputValue.value} actual=${value}`);
    }
  }
  return failures;
}

async function waitForScenarioAssertion(page: Page, assertion: SpaRouterAssertion, role: SpaRouterTargetRole, timeoutMs = 3000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  let failures = await assertScenario(page, assertion, role);
  while (failures.length && Date.now() < deadline) {
    await page.waitForTimeout(50);
    failures = await assertScenario(page, assertion, role);
  }
  return failures;
}

async function normalizeScrollAnchor(page: Page, visual: SpaRouterScenarioVisualState, role: SpaRouterTargetRole): Promise<string | null> {
  const selector = valueForRole(visual.screenshotAnchor, role);
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

async function captureVisualState(
  page: Page,
  visual: SpaRouterScenarioVisualState,
  role: SpaRouterTargetRole,
  requestActivity: RequestActivity,
  config: SpaRouterContractConfig,
  stabilityTimeoutMs?: number,
  scheduler?: SpaVisualResourceScheduler,
): Promise<SpaRouterVisualCapture> {
  const startedAt = performance.now();
  const timing = emptyVisualCaptureTiming();
  const profile = visual.resourceProfile ?? "dom";
  const lease = scheduler ? await scheduler.acquireCapture(profile) : undefined;
  timing.captureQueueWaitMs = lease?.captureWaitMs ?? 0;
  timing.canvasQueueWaitMs = lease?.canvasWaitMs ?? 0;
  try {
    const stabilityScope = valueForRole(visual.screenshotRegion, role);
    let phaseStartedAt = performance.now();
    const preAnchorStability = await settleVisual(page, requestActivity, config, stabilityTimeoutMs, stabilityScope);
    timing.preAnchorStabilityMs = Number((performance.now() - phaseStartedAt).toFixed(3));

    phaseStartedAt = performance.now();
    const anchor = await normalizeScrollAnchor(page, visual, role);
    timing.anchorMs = Number((performance.now() - phaseStartedAt).toFixed(3));

    const postAnchorToken = await readVisualStabilityToken(page);
    const postAnchorSkipped = sameVisualStabilityToken(preAnchorStability.token, postAnchorToken) && requestActivity.active.size === 0;
    phaseStartedAt = performance.now();
    const postAnchorStability = postAnchorSkipped
      ? { stabilityFailures: [], adaptiveWaitMs: 0, canvas: emptyCanvasStabilityTelemetry(), telemetry: emptyVisualStabilityTelemetry(), token: postAnchorToken, requestClassifications: emptyRequestClassificationCounts() }
      : await settleVisual(page, requestActivity, config, stabilityTimeoutMs, stabilityScope);
    timing.postAnchorStabilityMs = Number((performance.now() - phaseStartedAt).toFixed(3));

    const stability = {
      stabilityFailures: [...preAnchorStability.stabilityFailures, ...postAnchorStability.stabilityFailures],
      adaptiveWaitMs: preAnchorStability.adaptiveWaitMs + postAnchorStability.adaptiveWaitMs,
      preAnchorWaitMs: preAnchorStability.adaptiveWaitMs,
      postAnchorWaitMs: postAnchorStability.adaptiveWaitMs,
      postAnchorSkipped,
      canvas: addCanvasStabilityTelemetry(preAnchorStability.canvas, postAnchorStability.canvas),
      telemetry: addVisualStabilityTelemetry(preAnchorStability.telemetry, postAnchorStability.telemetry),
      requestClassifications: addRequestClassificationCounts(preAnchorStability.requestClassifications, postAnchorStability.requestClassifications),
    };

    phaseStartedAt = performance.now();
    const targets = visual.styleTargets?.length ? visual.styleTargets : [{ id: "document-body", selector: "body" }];
    const failures: string[] = [];
    const styles: ComputedStyleSnapshot[] = [];
    for (const target of targets) {
      const selector = valueForRole(target.selector, role);
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
    timing.computedStyleMs = Number((performance.now() - phaseStartedAt).toFixed(3));

    const region = valueForRole(visual.screenshotRegion, role) ?? null;
    let regionRect: SpaRouterCaptureRect | null = null;
    if (region) {
      regionRect = await page.evaluate((selector) => {
        let element: Element | null = null;
        try { element = document.querySelector(selector); } catch { return null; }
        if (!element) return null;
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) return null;
        const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
        const width = Math.min(innerWidth - x, rect.right - x), height = Math.min(innerHeight - y, rect.bottom - y);
        if (width <= 0 || height <= 0) return null;
        return { x, y, width, height };
      }, region);
      if (!regionRect) failures.push(`screenshot region 未命中或不可见 selector=${region}`);
    }

    phaseStartedAt = performance.now();
    const screenshot = await page.screenshot({ type: "png", fullPage: false, animations: "disabled", ...(regionRect ? { clip: regionRect } : {}) });
    timing.screenshotMs = Number((performance.now() - phaseStartedAt).toFixed(3));
    timing.totalMs = Number((performance.now() - startedAt).toFixed(3));
    return {
      screenshot, styles, anchor, region, regionRect, failures: [...failures, ...stability.stabilityFailures],
      stabilityFailures: stability.stabilityFailures, adaptiveWaitMs: stability.adaptiveWaitMs,
      preAnchorWaitMs: stability.preAnchorWaitMs, postAnchorWaitMs: stability.postAnchorWaitMs,
      postAnchorSkipped: stability.postAnchorSkipped, canvas: stability.canvas, stability: stability.telemetry, timing,
      requestClassifications: stability.requestClassifications,
    };
  } finally {
    lease?.release();
  }
}

function fixtureHostnameMatches(actual: string, expected: string): boolean {
  const normalized = expected.toLowerCase();
  return normalized.startsWith("*.") ? actual.endsWith(normalized.slice(1)) : actual === normalized;
}

function fixtureQueryMatches(url: URL, fixture: SpaRouterFixture): boolean {
  if (!fixture.query) return true;
  const expectedKeys = Object.keys(fixture.query);
  for (const key of expectedKeys) {
    const expected = Array.isArray(fixture.query[key]) ? fixture.query[key] : [fixture.query[key]];
    const actual = url.searchParams.getAll(key);
    if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) return false;
  }
  if ((fixture.queryMode ?? "subset") === "exact") {
    const actualKeys = [...new Set(url.searchParams.keys())];
    if (actualKeys.length !== expectedKeys.length || actualKeys.some((key) => !expectedKeys.includes(key))) return false;
  }
  return true;
}

function fixtureRequestHeadersMatch(actual: Record<string, string>, expected: Record<string, string> | undefined): boolean {
  if (!expected) return true;
  const normalized = Object.fromEntries(Object.entries(actual).map(([name, value]) => [name.toLowerCase(), value]));
  return Object.entries(expected).every(([name, value]) => normalized[name.toLowerCase()] === value);
}

export function spaRouterFixturePathMatches(actualPath: string, fixture: Pick<SpaRouterFixture, "path" | "pathMode">): boolean {
  if (!fixture.path) return true;
  if ((fixture.pathMode ?? "exact") === "exact") return actualPath === fixture.path;
  const reviewedSuffix = fixture.path.startsWith("/") ? fixture.path : `/${fixture.path}`;
  return actualPath === reviewedSuffix || actualPath.endsWith(reviewedSuffix);
}

export function findSpaRouterFixture(
  config: Pick<SpaRouterContractConfig, "fixtures">,
  input: { url: string; method: string; resourceType: string; headers?: Record<string, string> },
): SpaRouterFixture | undefined {
  let url: URL;
  try { url = new URL(input.url); } catch { return undefined; }
  return (config.fixtures ?? []).find((fixture) => {
    if ((fixture.method ?? "GET").toUpperCase() !== input.method.toUpperCase()) return false;
    if (fixture.hostname && !fixtureHostnameMatches(url.hostname.toLowerCase(), fixture.hostname)) return false;
    if (!spaRouterFixturePathMatches(url.pathname, fixture)) return false;
    if (fixture.resourceType && fixture.resourceType !== input.resourceType) return false;
    if (!fixtureQueryMatches(url, fixture)) return false;
    if (!fixtureRequestHeadersMatch(input.headers ?? {}, fixture.requestHeaders)) return false;
    return true;
  });
}

function isNonBlockingNetworkRequest(request: Request, config: SpaRouterContractConfig): boolean {
  const classification = classifySpaRouterNetworkRequest({ url: request.url(), resourceType: request.resourceType() }, config);
  return classification === "non-blocking-telemetry" || classification === "non-blocking-configured-host";
}

interface ExecuteScenarioOptions {
  viewport?: QualityViewport;
  role?: SpaRouterTargetRole;
  captureVisual?: boolean;
  storageState?: SpaRouterStorageState;
  entryPathOverride?: string;
  skipStepCount?: number;
  setupStateKey?: string;
  setupStateReused?: boolean;
  setupCheckpointStepCount?: number;
  setupCheckpointAssertions?: SpaRouterAssertion;
  visualScheduler?: SpaVisualResourceScheduler;
  queueWaitMs?: number;
  onSetupCheckpoint?: (artifact: Omit<CachedSpaSetupState, "reusable">) => Promise<void> | void;
}

async function executeScenario(browser: Browser, baseUrl: string, config: SpaRouterContractConfig, scenario: SpaRouterScenario, options: ExecuteScenarioOptions = {}): Promise<SpaRouterScenarioExecution> {
  const startedAt = performance.now();
  let phaseStartedAt = performance.now();
  const phaseElapsed = (): number => Number((performance.now() - phaseStartedAt).toFixed(3));
  const timing: SpaRouterScenarioTiming = {
    queueWaitMs: options.queueWaitMs ?? 0,
    contextCreateMs: 0, instrumentationMs: 0, routeRegistrationMs: 0, pageCreateMs: 0, navigationMs: 0, initialSettleMs: 0,
    setupPrefixStepsMs: 0, remainingStepsMs: 0, checkpointStorageMs: 0, checkpointVerificationMs: 0, assertionMs: 0, visualCaptureMs: 0, contextCloseMs: 0, totalMs: 0, steps: [],
  };
  const viewport = options.viewport ?? { id: "contract", label: "Contract", width: 1024, height: 768 };
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce",
    ...(options.storageState ? { storageState: options.storageState } : {}),
  });
  timing.contextCreateMs = phaseElapsed();
  options.visualScheduler?.contextOpened();
  const runtimeErrors: string[] = [], unmockedApiRequests: string[] = [];
  let setupCheckpointPublished = false;
  let resultForTiming: SpaRouterScenarioResult | undefined;
  try {
    phaseStartedAt = performance.now();
    await initializeRouterTracking(context, config.ignoredStateKeys ?? []);
    if (options.captureVisual) await initializeVisualStabilityTracking(context);
    timing.instrumentationMs = phaseElapsed();
    phaseStartedAt = performance.now();
    await context.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url());
      const fixture = findSpaRouterFixture(config, { url: request.url(), method: request.method(), resourceType: request.resourceType(), headers: request.headers() });
      if (fixture) {
        const headers: Record<string, string> = { ...(fixture.headers ?? {}) };
        const contentTypeHeader = Object.keys(headers).find((key) => key.toLowerCase() === "content-type");
        if (!contentTypeHeader) headers["content-type"] = "application/json; charset=utf-8";
        const contentType = contentTypeHeader ? headers[contentTypeHeader] : headers["content-type"];
        const body = fixture.bodyBase64 !== undefined
          ? Buffer.from(fixture.bodyBase64, "base64")
          : typeof fixture.body === "string" && !/json/i.test(contentType) ? fixture.body : JSON.stringify(fixture.body);
        await route.fulfill({ status: fixture.status ?? 200, headers, body });
        return;
      }
      if (config.apiPrefix && url.pathname.startsWith(config.apiPrefix)) {
        unmockedApiRequests.push(`${request.method()} ${url.pathname}`);
        await route.fulfill({ status: 501, contentType: "application/json", body: JSON.stringify({ code: 501, message: "unmocked SPA router fixture" }) });
        return;
      }
      await route.continue();
    });
    timing.routeRegistrationMs = phaseElapsed();
    phaseStartedAt = performance.now();
    const page = await context.newPage();
    timing.pageCreateMs = phaseElapsed();
    page.setDefaultTimeout(config.execution?.actionTimeoutMs ?? 30_000);
    const requestActivity: RequestActivity = { active: new Set<Request>(), lastActivityAt: Date.now() };
    const requiredNetworkFailures: string[] = [], nonBlockingNetworkFailures: string[] = [];
    const requiredResourceTypes = new Set(["document", "script", "stylesheet", "xhr", "fetch"]);
    const recordNetworkFailure = (request: Request, detail: string): void => {
      const target = `${request.method()} ${request.resourceType()} ${request.url()} ${detail}`;
      const collection = requiredResourceTypes.has(request.resourceType()) && !isNonBlockingNetworkRequest(request, config) ? requiredNetworkFailures : nonBlockingNetworkFailures;
      if (!collection.includes(target)) collection.push(target);
    };
    page.on("response", (response) => {
      if (response.status() < 400) return;
      const request = response.request();
      if (config.apiPrefix && new URL(request.url()).pathname.startsWith(config.apiPrefix)) return;
      recordNetworkFailure(request, `HTTP ${response.status()}`);
    });
    page.on("request", (request) => { requestActivity.active.add(request); requestActivity.lastActivityAt = Date.now(); });
    page.on("requestfinished", (request) => { requestActivity.active.delete(request); requestActivity.lastActivityAt = Date.now(); });
    page.on("requestfailed", (request) => { requestActivity.active.delete(request); requestActivity.lastActivityAt = Date.now(); recordNetworkFailure(request, `FAILED ${request.failure()?.errorText ?? "unknown"}`); });
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error" && !/^Failed to load resource:/i.test(message.text())) runtimeErrors.push(message.text()); });
    const entryUrl = targetUrl(baseUrl, options.entryPathOverride ?? scenario.entryPath);
    phaseStartedAt = performance.now();
    await page.goto(entryUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    timing.navigationMs = phaseElapsed();
    phaseStartedAt = performance.now();
    await settle(page, 500);
    timing.initialSettleMs = phaseElapsed();
    const role = options.role ?? "single";
    const stepRoutes: SpaRouterStepRoute[] = [];
    const assertionFailures: string[] = [];
    const firstStep = Math.max(0, options.skipStepCount ?? 0);
    for (let stepIndex = firstStep; stepIndex < scenario.steps.length; stepIndex += 1) {
      const step = scenario.steps[stepIndex];
      try {
        phaseStartedAt = performance.now();
        await executeStep(page, step, role);
        const stepDurationMs = phaseElapsed();
        const setupPrefix = !options.setupStateReused && stepIndex < (options.setupCheckpointStepCount ?? 0);
        timing.steps.push({ stepIndex, action: step.action, durationMs: stepDurationMs, setupPrefix });
        if (setupPrefix) timing.setupPrefixStepsMs = Number((timing.setupPrefixStepsMs + stepDurationMs).toFixed(3));
        else timing.remainingStepsMs = Number((timing.remainingStepsMs + stepDurationMs).toFixed(3));
        if (!setupCheckpointPublished && options.onSetupCheckpoint && stepIndex + 1 === options.setupCheckpointStepCount) {
          if (options.setupCheckpointAssertions) {
            phaseStartedAt = performance.now();
            const checkpointFailures = await waitForScenarioAssertion(page, options.setupCheckpointAssertions, role);
            timing.checkpointVerificationMs = phaseElapsed();
            if (checkpointFailures.length) throw new Error(`setup checkpoint assertion failed: ${checkpointFailures.join("; ")}`);
          }
          phaseStartedAt = performance.now();
          await options.onSetupCheckpoint({ storageState: await context.storageState(), checkpointRoute: routeOf(page.url()) });
          timing.checkpointStorageMs = phaseElapsed();
          setupCheckpointPublished = true;
        }
        stepRoutes.push({ stepIndex, action: step.action, route: routeOf(page.url()) });
      } catch (error) {
        const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
        assertionFailures.push(`step[${stepIndex}] action=${step.action} failed: ${detail}`);
        break;
      }
    }
    phaseStartedAt = performance.now();
    assertionFailures.push(...await waitForScenarioAssertion(page, scenario.assertions, role, Math.min(config.execution?.actionTimeoutMs ?? 3000, 5000)));
    timing.assertionMs = phaseElapsed();
    const transitions = await page.evaluate(() => ([...((globalThis as typeof globalThis & { __uiDismantlerSpaTransitions?: SpaRouterTransition[] }).__uiDismantlerSpaTransitions ?? [])]));
    const uniqueRuntimeErrors = [...new Set(runtimeErrors)], uniqueUnmocked = [...new Set(unmockedApiRequests)];
    const uniqueRequiredNetworkFailures = [...new Set(requiredNetworkFailures)], uniqueNonBlockingNetworkFailures = [...new Set(nonBlockingNetworkFailures)];
    const result: SpaRouterScenarioResult = {
      id: scenario.id, passed: assertionFailures.length === 0 && uniqueRuntimeErrors.length === 0 && uniqueUnmocked.length === 0 && uniqueRequiredNetworkFailures.length === 0,
      entryUrl, finalUrl: page.url(), transitions, stepRoutes, runtimeErrors: uniqueRuntimeErrors, unmockedApiRequests: uniqueUnmocked,
      requiredNetworkFailures: uniqueRequiredNetworkFailures, nonBlockingNetworkFailures: uniqueNonBlockingNetworkFailures, assertionFailures,
      durationMs: Number((performance.now() - startedAt).toFixed(3)), timing,
      ...(options.setupStateKey ? {
        setupStateKey: options.setupStateKey, setupStateReused: options.setupStateReused ?? false,
        setupStepsSkipped: firstStep, setupCheckpointPublished,
      } : {}),
    };
    phaseStartedAt = performance.now();
    const visual = options.captureVisual && scenario.visual ? await captureVisualState(page, scenario.visual, role, requestActivity, config, config.visualMatrix?.stabilityTimeoutMs, options.visualScheduler) : undefined;
    timing.visualCaptureMs = phaseElapsed();
    resultForTiming = result;
    result.durationMs = timing.totalMs = Number((performance.now() - startedAt).toFixed(3));
    return { result, visual };
  } finally {
    phaseStartedAt = performance.now();
    try { await context.close(); }
    finally {
      timing.contextCloseMs = phaseElapsed();
      options.visualScheduler?.contextClosed();
      timing.totalMs = Number((performance.now() - startedAt).toFixed(3));
      if (resultForTiming) resultForTiming.durationMs = timing.totalMs;
    }
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number, queueWaitMs: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  const queuedAt = performance.now();
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex; nextIndex += 1;
      if (index >= items.length) return;
      const queueWaitMs = Number((performance.now() - queuedAt).toFixed(3));
      results[index] = await worker(items[index], index, queueWaitMs);
    }
  });
  await Promise.all(runners);
  return results;
}

function reviewedSetupStateCacheKey(scenario: SpaRouterScenario, baseUrl: string, role: SpaRouterTargetRole): string | undefined {
  const setup = scenario.setupState;
  if (!setup) return undefined;
  const checkpointStepCount = Math.max(0, Math.min(setup.checkpointStepCount, scenario.steps.length));
  const resumePath = valueForRole(setup.resumePath, role);
  if (!resumePath || checkpointStepCount === 0) return undefined;
  const prefix = scenario.steps.slice(0, checkpointStepCount).map((step) => ({
    action: step.action, target: valueForRole(step.target, role) ?? null, value: step.value ?? null, key: step.key ?? null, ms: step.ms ?? null,
  }));
  return JSON.stringify({ state: setup.stateKey, baseUrl, role, checkpointStepCount, resumePath, checkpointAssertions: setup.checkpointAssertions ?? null, prefix });
}

async function executeScenarioWithSetupStateReuse(
  browser: Browser,
  baseUrl: string,
  config: SpaRouterContractConfig,
  scenario: SpaRouterScenario,
  options: ExecuteScenarioOptions,
  cache: SpaSetupStateCache,
): Promise<SpaRouterScenarioExecution> {
  const role = options.role ?? "single";
  const setup = scenario.setupState;
  const cacheKey = reviewedSetupStateCacheKey(scenario, baseUrl, role);
  if (!setup || !cacheKey) return executeScenario(browser, baseUrl, config, scenario, options);
  const checkpointStepCount = Math.max(0, Math.min(setup.checkpointStepCount, scenario.steps.length));
  const resumePath = valueForRole(setup.resumePath, role);
  if (!resumePath) return executeScenario(browser, baseUrl, config, scenario, options);
  const existing = cache.get(cacheKey);
  if (existing) {
    const artifact = await existing.catch(() => undefined);
    if (artifact?.reusable) {
      return executeScenario(browser, baseUrl, config, scenario, {
        ...options, storageState: artifact.storageState, entryPathOverride: resumePath, skipStepCount: checkpointStepCount,
        setupStateKey: setup.stateKey, setupStateReused: true,
      });
    }
    cache.delete(cacheKey);
  }
  let checkpoint: CachedSpaSetupState | undefined;
  let resolveCheckpoint!: (artifact: CachedSpaSetupState) => void;
  let rejectCheckpoint!: (error: unknown) => void;
  const earlyRelease = Boolean(setup.checkpointAssertions);
  const checkpointPromise = new Promise<CachedSpaSetupState>((resolve, reject) => { resolveCheckpoint = resolve; rejectCheckpoint = reject; });
  let ownerPromise: Promise<SpaRouterScenarioExecution>;
  ownerPromise = executeScenario(browser, baseUrl, config, scenario, {
    ...options, setupStateKey: setup.stateKey, setupStateReused: false,
    setupCheckpointStepCount: checkpointStepCount, setupCheckpointAssertions: setup.checkpointAssertions,
    onSetupCheckpoint: (artifact) => {
      checkpoint = { ...artifact, reusable: true };
      if (earlyRelease) resolveCheckpoint(checkpoint);
    },
  });
  const artifactPromise = earlyRelease ? checkpointPromise : ownerPromise.then((execution) => {
    if (!checkpoint) throw new Error(`reviewed setup state ${setup.stateKey} did not reach checkpoint step ${checkpointStepCount}`);
    checkpoint.reusable = execution.result.passed;
    return checkpoint;
  });
  cache.set(cacheKey, artifactPromise);
  ownerPromise.then((execution) => {
    if (!checkpoint) rejectCheckpoint(new Error(`reviewed setup state ${setup.stateKey} did not reach checkpoint step ${checkpointStepCount}`));
    else checkpoint.reusable = execution.result.passed;
  }, rejectCheckpoint);
  try { return await ownerPromise; }
  catch (error) { cache.delete(cacheKey); throw error; }
}

interface CachedSpaVisualState {
  finalRoute: string;
  reusable: boolean;
  visual: SpaRouterVisualCapture;
}
type SpaVisualStateCache = Map<string, Promise<CachedSpaVisualState>>;

function reviewedVisualStateCacheKey(scenario: SpaRouterScenario, viewport: QualityViewport, role: SpaRouterTargetRole): string | undefined {
  const visual = scenario.visual;
  if (!visual?.reuseStateKey) return undefined;
  const captureIdentity = {
    state: visual.reuseStateKey,
    role,
    width: viewport.width,
    height: viewport.height,
    anchor: valueForRole(visual.screenshotAnchor, role) ?? null,
    region: valueForRole(visual.screenshotRegion, role) ?? null,
    styles: (visual.styleTargets ?? []).map((target) => [target.id, valueForRole(target.selector, role) ?? null]),
  };
  return JSON.stringify(captureIdentity);
}

async function executeScenarioWithVisualStateReuse(
  browser: Browser,
  baseUrl: string,
  config: SpaRouterContractConfig,
  scenario: SpaRouterScenario,
  options: { viewport: QualityViewport; role: SpaRouterTargetRole; captureVisual: boolean; visualScheduler?: SpaVisualResourceScheduler; queueWaitMs?: number },
  cache: SpaVisualStateCache,
  setupCache: SpaSetupStateCache,
): Promise<SpaRouterScenarioExecution> {
  const cacheKey = options.captureVisual ? reviewedVisualStateCacheKey(scenario, options.viewport, options.role) : undefined;
  if (!cacheKey) return executeScenarioWithSetupStateReuse(browser, baseUrl, config, scenario, options, setupCache);
  const cachedPromise = cache.get(cacheKey);
  if (!cachedPromise) {
    const ownerPromise = executeScenarioWithSetupStateReuse(browser, baseUrl, config, scenario, options, setupCache);
    cache.set(cacheKey, ownerPromise.then((execution) => {
      if (!execution.visual) throw new Error(`reviewed visual state ${scenario.visual?.reuseStateKey} did not produce a capture`);
      return {
        finalRoute: routeOf(execution.result.finalUrl),
        reusable: execution.result.passed && execution.visual.failures.length === 0 && execution.visual.stabilityFailures.length === 0,
        visual: execution.visual,
      };
    }));
    try { return await ownerPromise; }
    catch (error) { cache.delete(cacheKey); throw error; }
  }
  const execution = await executeScenarioWithSetupStateReuse(browser, baseUrl, config, scenario, { ...options, captureVisual: false }, setupCache);
  const cached = await cachedPromise.catch(() => undefined);
  if (!cached?.reusable || !execution.result.passed || cached.finalRoute !== routeOf(execution.result.finalUrl)) {
    return executeScenarioWithSetupStateReuse(browser, baseUrl, config, scenario, options, setupCache);
  }
  return {
    ...execution,
    visualStateReused: true,
    visual: {
      ...cached.visual,
      adaptiveWaitMs: 0,
      preAnchorWaitMs: 0,
      postAnchorWaitMs: 0,
      postAnchorSkipped: true,
      canvas: emptyCanvasStabilityTelemetry(),
      stability: emptyVisualStabilityTelemetry(),
      timing: emptyVisualCaptureTiming(),
      requestClassifications: emptyRequestClassificationCounts(),
      reusedStateKey: scenario.visual?.reuseStateKey,
    },
  };
}

async function evaluateTarget(browser: Browser, baseUrl: string, config: SpaRouterContractConfig, options: { role?: SpaRouterTargetRole; visualViewport?: QualityViewport } = {}): Promise<SpaRouterTargetEvaluation> {
  const concurrency = config.execution?.contractConcurrency ?? 1;
  const visualStateCache: SpaVisualStateCache = new Map();
  const setupStateCache: SpaSetupStateCache = new Map();
  const orderedExecutions = await mapWithConcurrency(config.scenarios, concurrency, async (scenario, _index, queueWaitMs) => {
    const captureVisual = Boolean(options.visualViewport && scenario.visual);
    if (!options.visualViewport) return executeScenarioWithSetupStateReuse(browser, baseUrl, config, scenario, { role: options.role, captureVisual, queueWaitMs }, setupStateCache);
    return executeScenarioWithVisualStateReuse(browser, baseUrl, config, scenario, { viewport: options.visualViewport, role: options.role ?? "single", captureVisual, queueWaitMs }, visualStateCache, setupStateCache);
  });
  const executions = new Map(config.scenarios.map((scenario, index) => [scenario.id, orderedExecutions[index]]));
  const results = [...executions.values()].map((execution) => execution.result);
  return {
    report: {
      baseUrl, passed: results.every((result) => result.passed),
      scenariosPassed: results.filter((result) => result.passed).length, scenariosTotal: results.length,
      runtimeErrors: results.reduce((sum, result) => sum + result.runtimeErrors.length, 0),
      unmockedApiRequests: results.reduce((sum, result) => sum + result.unmockedApiRequests.length, 0),
      requiredNetworkFailures: results.reduce((sum, result) => sum + result.requiredNetworkFailures.length, 0),
      nonBlockingNetworkFailures: results.reduce((sum, result) => sum + result.nonBlockingNetworkFailures.length, 0),
      setupStateReusedRuns: results.filter((result) => result.setupStateReused).length,
      setupStepsSkipped: results.reduce((sum, result) => sum + (result.setupStepsSkipped ?? 0), 0),
      setupCheckpointsPublished: results.filter((result) => result.setupCheckpointPublished).length,
      results,
    },
    executions, setupStateCache,
  };
}

function compareScenario(
  id: string,
  reference: SpaRouterScenarioResult | undefined,
  generated: SpaRouterScenarioResult | undefined,
  options: { mode?: "strict" | "semantic"; referenceBaseUrl?: string; generatedBaseUrl?: string; aliases?: Record<string, string> } = {},
): SpaRouterScenarioComparison {
  const failures: SpaRouterComparisonFailure[] = [];
  if (!reference) failures.push({ reason: "missing-reference-scenario", detail: `reference 缺少场景 ${id}` });
  if (!generated) failures.push({ reason: "missing-generated-scenario", detail: `generated 缺少场景 ${id}` });
  if (!reference || !generated) return { id, passed: false, reference, generated, failures };
  if (reference.assertionFailures.length) failures.push({ reason: "reference-assertion-failure", reference: reference.assertionFailures.join("; "), detail: `reference 场景断言失败: ${reference.assertionFailures.join("; ")}` });
  if (generated.assertionFailures.length) failures.push({ reason: "generated-assertion-failure", generated: generated.assertionFailures.join("; "), detail: `generated 场景断言失败: ${generated.assertionFailures.join("; ")}` });
  const comparisonMode = options.mode ?? "strict";
  if (comparisonMode === "strict") {
    if (reference.transitions.length !== generated.transitions.length) failures.push({ reason: "transition-count-mismatch", reference: reference.transitions.length, generated: generated.transitions.length, detail: `transition 数量 reference=${reference.transitions.length} generated=${generated.transitions.length}` });
    const totalTransitions = Math.max(reference.transitions.length, generated.transitions.length);
    for (let index = 0; index < totalTransitions; index += 1) {
      const expected = reference.transitions[index], actual = generated.transitions[index];
      if (!expected || !actual) continue;
      if (expected.method !== actual.method) failures.push({ reason: "transition-method-mismatch", transitionIndex: index, reference: expected.method, generated: actual.method, detail: `transition[${index}] method reference=${expected.method} generated=${actual.method}` });
      if (expected.target !== actual.target) failures.push({ reason: "transition-target-mismatch", transitionIndex: index, reference: expected.target, generated: actual.target, detail: `transition[${index}] target reference=${expected.target} generated=${actual.target}` });
      if (expected.state !== actual.state) failures.push({ reason: "transition-state-mismatch", transitionIndex: index, reference: expected.state, generated: actual.state, detail: `transition[${index}] state reference=${expected.state} generated=${actual.state}` });
    }
  } else {
    const referenceBaseUrl = options.referenceBaseUrl ?? reference.entryUrl, generatedBaseUrl = options.generatedBaseUrl ?? generated.entryUrl;
    if (reference.stepRoutes.length !== generated.stepRoutes.length) failures.push({ reason: "step-route-count-mismatch", reference: reference.stepRoutes.length, generated: generated.stepRoutes.length, detail: `step route 数量 reference=${reference.stepRoutes.length} generated=${generated.stepRoutes.length}` });
    const totalStepRoutes = Math.max(reference.stepRoutes.length, generated.stepRoutes.length);
    for (let index = 0; index < totalStepRoutes; index += 1) {
      const expected = reference.stepRoutes[index], actual = generated.stepRoutes[index];
      if (!expected || !actual) continue;
      const expectedRoute = semanticRouteOf(expected.route, referenceBaseUrl, options.aliases), actualRoute = semanticRouteOf(actual.route, generatedBaseUrl, options.aliases);
      if (expectedRoute !== actualRoute) failures.push({ reason: "step-route-mismatch", transitionIndex: index, reference: expectedRoute, generated: actualRoute, detail: `stepRoute[${index}] (${expected.action}) reference=${expectedRoute} generated=${actualRoute}` });
    }
  }
  const referenceRoute = comparisonMode === "semantic"
    ? semanticRouteOf(reference.finalUrl, options.referenceBaseUrl ?? reference.entryUrl, options.aliases)
    : routeOf(reference.finalUrl);
  const generatedRoute = comparisonMode === "semantic"
    ? semanticRouteOf(generated.finalUrl, options.generatedBaseUrl ?? generated.entryUrl, options.aliases)
    : routeOf(generated.finalUrl);
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
  const configuredViewports = visualConfig.viewports ?? DEFAULT_VISUAL_VIEWPORTS;
  const pixelThreshold = visualConfig.pixelThreshold ?? 0.02, styleThreshold = visualConfig.styleThreshold ?? 0.98;
  const viewportConcurrency = config.execution?.visualConcurrency ?? 1;
  const captureConcurrency = config.execution?.visualCaptureConcurrency ?? Math.min(8, viewportConcurrency * 2);
  const canvasConcurrency = config.execution?.visualCanvasConcurrency ?? captureConcurrency;
  const pixelConcurrency = config.execution?.visualPixelConcurrency ?? viewportConcurrency;
  const scheduler = new SpaVisualResourceScheduler(viewportConcurrency, captureConcurrency, canvasConcurrency, pixelConcurrency);
  let reusedTargetRuns = 0, freshTargetRuns = 0;
  const matrices: SpaRouterScenarioVisualMatrix[] = [];
  const visualStateCache: SpaVisualStateCache = new Map();
  const setupStateCache: SpaSetupStateCache = new Map([
    ...referenceEvaluation.setupStateCache.entries(), ...generatedEvaluation.setupStateCache.entries(),
  ]);
  for (const scenario of config.scenarios.filter((item) => item.visual)) {
    const scenarioStartedAt = performance.now();
    const viewports = scenario.visual?.viewports?.length ? configuredViewports.filter((viewport) => scenario.visual?.viewports?.includes(viewport.id)) : configuredViewports;
    if (!viewports.length) throw new TypeError(`scenario ${scenario.id} visual.viewports 没有匹配的 configured viewport`);
    const viewportResults = await mapWithConcurrency(viewports, viewportConcurrency, async (viewport, _index, queueWaitMs): Promise<SpaRouterVisualViewportResult> => {
      scheduler.viewportStarted(queueWaitMs);
      const viewportStartedAt = performance.now();
      try {
        const canReuse = Boolean(reusableViewport && viewport.width === reusableViewport.width && viewport.height === reusableViewport.height);
        const referenceReuse = canReuse ? referenceEvaluation.executions.get(scenario.id) : undefined;
        const generatedReuse = canReuse ? generatedEvaluation.executions.get(scenario.id) : undefined;
        const [reference, generated] = await Promise.all([
          referenceReuse?.visual ? Promise.resolve(referenceReuse) : executeScenarioWithVisualStateReuse(browser, referenceBaseUrl, config, scenario, { viewport, role: "reference", captureVisual: true, visualScheduler: scheduler }, visualStateCache, setupStateCache),
          generatedReuse?.visual ? Promise.resolve(generatedReuse) : executeScenarioWithVisualStateReuse(browser, generatedBaseUrl, config, scenario, { viewport, role: "generated", captureVisual: true, visualScheduler: scheduler }, visualStateCache, setupStateCache),
        ]);
        const referenceFresh = !referenceReuse?.visual, generatedFresh = !generatedReuse?.visual;
        reusedTargetRuns += Number(!referenceFresh) + Number(!generatedFresh);
        freshTargetRuns += Number(referenceFresh) + Number(generatedFresh);
        if (!reference.visual || !generated.visual) throw new Error(`场景 ${scenario.id} 的 visual capture 未生成`);
        const comparison = compareScenario(scenario.id, reference.result, generated.result, { mode: config.navigationComparison, referenceBaseUrl, generatedBaseUrl, aliases: config.semanticRouteAliases });
        const navigationFailures = comparison.failures.filter((failure) => NAVIGATION_FAILURE_REASONS.has(failure.reason));
        const styles = compareComputedStyles(reference.visual.styles, generated.visual.styles);
        const artifactDir = visualConfig.artifactDir ? resolve(visualConfig.artifactDir, scenario.id, viewport.id) : undefined;
        const pixelLease = await scheduler.pixel.acquire();
        const pixelStartedAt = performance.now();
        let pixels: PixelDiffReport;
        try { pixels = await comparePixels(reference.visual.screenshot, generated.visual.screenshot, pixelThreshold, artifactDir); }
        finally { pixelLease.release(); }
        const pixelCompareMs = Number((performance.now() - pixelStartedAt).toFixed(3));
        const nonNavigationComparisonFailures = comparison.failures.filter((failure) => !NAVIGATION_FAILURE_REASONS.has(failure.reason));
        const captureFailures = [
          ...reference.visual.failures.map((failure) => `reference visual: ${failure}`),
          ...generated.visual.failures.map((failure) => `generated visual: ${failure}`),
          ...reference.result.assertionFailures.map((failure) => `reference assertion: ${failure}`),
          ...generated.result.assertionFailures.map((failure) => `generated assertion: ${failure}`),
          ...nonNavigationComparisonFailures.map((failure) => `comparison ${failure.reason}: ${failure.detail}`),
        ];
        const runtimeErrors = reference.result.runtimeErrors.length + generated.result.runtimeErrors.length;
        const unmockedApiRequests = reference.result.unmockedApiRequests.length + generated.result.unmockedApiRequests.length;
        const requiredNetworkFailureDetails = [
          ...reference.result.requiredNetworkFailures.map((failure) => `reference: ${failure}`),
          ...generated.result.requiredNetworkFailures.map((failure) => `generated: ${failure}`),
        ];
        const nonBlockingNetworkFailureDetails = [
          ...reference.result.nonBlockingNetworkFailures.map((failure) => `reference: ${failure}`),
          ...generated.result.nonBlockingNetworkFailures.map((failure) => `generated: ${failure}`),
        ];
        const requiredNetworkFailures = requiredNetworkFailureDetails.length;
        const captureTiming = addVisualCaptureTiming(referenceFresh ? reference.visual.timing : emptyVisualCaptureTiming(), generatedFresh ? generated.visual.timing : emptyVisualCaptureTiming());
        const freshResults = [referenceFresh ? reference.result : undefined, generatedFresh ? generated.result : undefined].filter((item): item is SpaRouterScenarioResult => Boolean(item));
        const timing: SpaRouterVisualViewportTiming = {
          queueWaitMs,
          referenceTargetMs: referenceFresh ? reference.result.timing.totalMs : 0,
          generatedTargetMs: generatedFresh ? generated.result.timing.totalMs : 0,
          contextCreateMs: freshResults.reduce((sum, item) => sum + item.timing.contextCreateMs, 0),
          navigationMs: freshResults.reduce((sum, item) => sum + item.timing.navigationMs, 0),
          initialSettleMs: freshResults.reduce((sum, item) => sum + item.timing.initialSettleMs, 0),
          scenarioStepsMs: freshResults.reduce((sum, item) => sum + item.timing.setupPrefixStepsMs + item.timing.remainingStepsMs, 0),
          assertionMs: freshResults.reduce((sum, item) => sum + item.timing.assertionMs, 0),
          contextCloseMs: freshResults.reduce((sum, item) => sum + item.timing.contextCloseMs, 0),
          captureQueueWaitMs: captureTiming.captureQueueWaitMs,
          canvasQueueWaitMs: captureTiming.canvasQueueWaitMs,
          preAnchorStabilityMs: captureTiming.preAnchorStabilityMs,
          anchorMs: captureTiming.anchorMs,
          postAnchorStabilityMs: captureTiming.postAnchorStabilityMs,
          computedStyleMs: captureTiming.computedStyleMs,
          screenshotMs: captureTiming.screenshotMs,
          pixelQueueWaitMs: pixelLease.waitMs,
          pixelCompareMs,
          totalMs: Number((performance.now() - viewportStartedAt).toFixed(3)),
        };
        return {
          ...viewport, passed: comparison.passed && navigationFailures.length === 0 && captureFailures.length === 0 && styles.rate >= styleThreshold && pixels.passed,
          referenceFinalRoute: routeOf(reference.result.finalUrl), generatedFinalRoute: routeOf(generated.result.finalUrl),
          referenceAnchor: reference.visual.anchor, generatedAnchor: generated.visual.anchor,
          referenceRegion: reference.visual.region, generatedRegion: generated.visual.region, referenceRegionRect: reference.visual.regionRect, generatedRegionRect: generated.visual.regionRect,
          runtimeErrors, unmockedApiRequests, requiredNetworkFailures, requiredNetworkFailureDetails, nonBlockingNetworkFailureDetails, stabilityFailures: [...reference.visual.stabilityFailures, ...generated.visual.stabilityFailures], adaptiveWaitMs: reference.visual.adaptiveWaitMs + generated.visual.adaptiveWaitMs,
          preAnchorWaitMs: reference.visual.preAnchorWaitMs + generated.visual.preAnchorWaitMs, postAnchorWaitMs: reference.visual.postAnchorWaitMs + generated.visual.postAnchorWaitMs,
          postAnchorSkipped: reference.visual.postAnchorSkipped && generated.visual.postAnchorSkipped,
          visualStateReused: Boolean(reference.visualStateReused && generated.visualStateReused),
          referenceVisualStateReuseKey: reference.visual.reusedStateKey ?? null,
          generatedVisualStateReuseKey: generated.visual.reusedStateKey ?? null,
          referenceSetupStateReused: reference.result.setupStateReused ?? false,
          generatedSetupStateReused: generated.result.setupStateReused ?? false,
          referenceSetupStepsSkipped: reference.result.setupStepsSkipped ?? 0,
          generatedSetupStepsSkipped: generated.result.setupStepsSkipped ?? 0,
          canvas: addCanvasStabilityTelemetry(reference.visual.canvas, generated.visual.canvas),
          stability: addVisualStabilityTelemetry(reference.visual.stability, generated.visual.stability),
          timing,
          requestClassifications: addRequestClassificationCounts(reference.visual.requestClassifications, generated.visual.requestClassifications),
          durationMs: timing.totalMs, navigationPassed: navigationFailures.length === 0, navigationFailures, captureFailures, styles, pixels,
        };
      } finally {
        scheduler.viewportFinished();
      }
    });
    matrices.push({ scenarioId: scenario.id, passed: viewportResults.every((viewport) => viewport.passed), viewports: viewportResults, worstComputedStyle: Math.min(...viewportResults.map((viewport) => viewport.styles.rate)), worstPixelDiff: Math.max(...viewportResults.map((viewport) => viewport.pixels.diffRate)), durationMs: Number((performance.now() - scenarioStartedAt).toFixed(3)) });
  }
  const entries = matrices.flatMap((matrix) => matrix.viewports);
  return {
    passed: matrices.length > 0 && matrices.every((matrix) => matrix.passed), scenarios: matrices, scenarioCount: matrices.length, viewportRuns: entries.length,
    runtimeErrors: entries.reduce((sum, entry) => sum + entry.runtimeErrors, 0), unmockedApiRequests: entries.reduce((sum, entry) => sum + entry.unmockedApiRequests, 0), requiredNetworkFailures: entries.reduce((sum, entry) => sum + entry.requiredNetworkFailures, 0),
    navigationFailures: entries.reduce((sum, entry) => sum + entry.navigationFailures.length, 0), navigationMatchedRuns: entries.filter((entry) => entry.navigationPassed).length,
    stabilityFailures: entries.reduce((sum, entry) => sum + entry.stabilityFailures.length, 0), adaptiveWaitMs: entries.reduce((sum, entry) => sum + entry.adaptiveWaitMs, 0),
    preAnchorWaitMs: entries.reduce((sum, entry) => sum + entry.preAnchorWaitMs, 0), postAnchorWaitMs: entries.reduce((sum, entry) => sum + entry.postAnchorWaitMs, 0),
    postAnchorSkippedRuns: entries.filter((entry) => entry.postAnchorSkipped).length,
    visualStateReusedRuns: entries.filter((entry) => entry.visualStateReused).length,
    setupStateReusedTargetRuns: entries.reduce((sum, entry) => sum + Number(entry.referenceSetupStateReused) + Number(entry.generatedSetupStateReused), 0),
    setupStepsSkipped: entries.reduce((sum, entry) => sum + entry.referenceSetupStepsSkipped + entry.generatedSetupStepsSkipped, 0),
    canvas: addCanvasStabilityTelemetry(...entries.map((entry) => entry.canvas)),
    stability: addVisualStabilityTelemetry(...entries.map((entry) => entry.stability)),
    timing: addVisualViewportTiming(...entries.map((entry) => entry.timing)),
    scheduler: scheduler.telemetry(),
    requestClassifications: addRequestClassificationCounts(...entries.map((entry) => entry.requestClassifications)),
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
    { id: "resource-readiness", passed: target.unmockedApiRequests === 0 && target.requiredNetworkFailures === 0, detail: `unmockedApiRequests=${target.unmockedApiRequests}，requiredNetworkFailures=${target.requiredNetworkFailures}` },
    { id: "navigation-integrity", passed: assertionsPassed === target.scenariosTotal, detail: `source-only contract=${assertionsPassed}/${target.scenariosTotal}` },
  ];
}

function comparisonQualityGates(reference: SpaRouterTargetReport, generated: SpaRouterTargetReport, navigationIntegrity: SpaRouterNavigationIntegrityReport, visualMatrix?: SpaRouterVisualMatrixReport): SpaRouterQualityGate[] {
  const referenceAssertions = assertionPassCount(reference), generatedAssertions = assertionPassCount(generated);
  const gates: SpaRouterQualityGate[] = [
    { id: "scenario-protocol", passed: referenceAssertions === reference.scenariosTotal && generatedAssertions === generated.scenariosTotal, detail: `reference=${referenceAssertions}/${reference.scenariosTotal}，generated=${generatedAssertions}/${generated.scenariosTotal}` },
    { id: "visual-runtime", passed: reference.runtimeErrors + generated.runtimeErrors + (visualMatrix?.runtimeErrors ?? 0) === 0 && (visualMatrix?.stabilityFailures ?? 0) === 0, detail: `referenceRuntimeErrors=${reference.runtimeErrors}，generatedRuntimeErrors=${generated.runtimeErrors}，visualRuntimeErrors=${visualMatrix?.runtimeErrors ?? 0}，stabilityFailures=${visualMatrix?.stabilityFailures ?? 0}` },
    { id: "resource-readiness", passed: reference.unmockedApiRequests + generated.unmockedApiRequests + (visualMatrix?.unmockedApiRequests ?? 0) === 0 && reference.requiredNetworkFailures + generated.requiredNetworkFailures + (visualMatrix?.requiredNetworkFailures ?? 0) === 0, detail: `referenceUnmockedApi=${reference.unmockedApiRequests}，generatedUnmockedApi=${generated.unmockedApiRequests}，visualUnmockedApi=${visualMatrix?.unmockedApiRequests ?? 0}，requiredNetworkFailures=${reference.requiredNetworkFailures + generated.requiredNetworkFailures + (visualMatrix?.requiredNetworkFailures ?? 0)}` },
    { id: "navigation-integrity", passed: navigationIntegrity.passed, detail: `matched=${navigationIntegrity.matchedScenarios}/${navigationIntegrity.totalScenarios}，rate=${navigationIntegrity.rate}，failures=${navigationIntegrity.failures}` },
  ];
  if (visualMatrix) gates.splice(1, 0, { id: "scenario-viewport-matrix", passed: visualMatrix.passed, detail: `${visualMatrix.scenarios.filter((matrix) => matrix.passed).length}/${visualMatrix.scenarioCount} SPA route states 通过，viewportRuns=${visualMatrix.viewportRuns}，worstComputedStyle=${visualMatrix.worstComputedStyle}，worstPixelDiff=${visualMatrix.worstPixelDiff}` });
  return gates;
}

export async function evaluateSpaRouterContract(config: SpaRouterContractConfig, options: { executablePath?: string } = {}): Promise<SpaRouterContractReport> {
  const totalStartedAt = performance.now();
  const timing = { browserLaunchMs: 0, contractMs: 0, comparisonMs: 0, visualMatrixMs: 0, browserCloseMs: 0, browserDisconnectMs: 0, browserProcessCloseMs: 0, reportReadyMs: 0, totalMs: 0 };
  const elapsed = (startedAt: number): number => Number((performance.now() - startedAt).toFixed(3));
  const resolved = validateConfig(config);
  let phaseStartedAt = performance.now();
  const requestedFastShutdown = config.execution?.browserShutdown === "fast-kill";
  const launched = await launchSpaBrowser(options.executablePath, requestedFastShutdown);
  const browser = launched.browser;
  let allowFastShutdown = false;
  let fastShutdownConfirmed = false;
  let completedReport: SpaRouterContractReport | undefined;
  timing.browserLaunchMs = elapsed(phaseStartedAt);
  try {
    if (resolved.mode === "single") {
      phaseStartedAt = performance.now();
      const targetEvaluation = await evaluateTarget(browser, resolved.baseUrl, config), target = targetEvaluation.report;
      timing.contractMs = elapsed(phaseStartedAt);
      const qualityGates = singleQualityGates(target);
      const report: SpaRouterContractReport = {
        schemaVersion: "1.0", mode: "single", baseUrl: resolved.baseUrl, passed: qualityGates.every((gate) => gate.passed),
        scenariosPassed: target.scenariosPassed, scenariosTotal: target.scenariosTotal, runtimeErrors: target.runtimeErrors, unmockedApiRequests: target.unmockedApiRequests,
        results: target.results, requiredNetworkFailures: target.requiredNetworkFailures, nonBlockingNetworkFailures: target.nonBlockingNetworkFailures, navigationIntegrity: { passed: target.passed, rate: target.scenariosTotal ? target.scenariosPassed / target.scenariosTotal : 0, matchedScenarios: target.scenariosPassed, totalScenarios: target.scenariosTotal, failures: target.scenariosTotal - target.scenariosPassed },
        telemetry: { contractTargetRuns: target.scenariosTotal, visualViewportRuns: 0, visualTargetRuns: 0, visualTargetReusedRuns: 0, visualTargetFreshRuns: 0, visualStabilityFailures: 0, visualAdaptiveWaitMs: 0, visualPreAnchorWaitMs: 0, visualPostAnchorWaitMs: 0, visualPostAnchorSkippedRuns: 0, visualStateReusedRuns: 0, contractSetupStateReusedRuns: target.setupStateReusedRuns, contractSetupStepsSkipped: target.setupStepsSkipped, visualSetupStateReusedRuns: 0, visualSetupStepsSkipped: 0, contractSetupOwnerTiming: summarizeSetupOwnerTiming(target), visualCanvas: emptyCanvasStabilityTelemetry(), visualStability: emptyVisualStabilityTelemetry(), visualRunTiming: emptyVisualViewportTiming(), visualScheduler: emptyVisualSchedulerTelemetry(config), visualRequestClassifications: emptyRequestClassificationCounts(), contractConcurrency: config.execution?.contractConcurrency ?? 1, visualConcurrency: config.execution?.visualConcurrency ?? 1, browserShutdownMode: "graceful", fastShutdownUsed: false, fastShutdownConfirmed: false, fastShutdownLockAcquired: false, fastShutdownLockWaitMs: 0, activeHandlesBeforeClose: activeHandleSnapshot(), activeHandlesAfterClose: activeHandleSnapshot(), timing }, qualityGates,
      };
      timing.reportReadyMs = elapsed(totalStartedAt);
      allowFastShutdown = requestedFastShutdown && report.passed;
      completedReport = report;
      return report;
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
    const comparisons = scenarioIds.map((id) => compareScenario(id, referenceById.get(id), generatedById.get(id), { mode: config.navigationComparison, referenceBaseUrl: resolved.referenceBaseUrl, generatedBaseUrl: resolved.generatedBaseUrl, aliases: config.semanticRouteAliases }));
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
    const report: SpaRouterContractReport = {
      schemaVersion: "1.0", mode: "reference-generated", referenceBaseUrl: resolved.referenceBaseUrl, generatedBaseUrl: resolved.generatedBaseUrl,
      passed: qualityGates.every((gate) => gate.passed), scenariosPassed: comparisons.filter((comparison) => comparison.passed).length, scenariosTotal: comparisons.length,
      runtimeErrors: reference.runtimeErrors + generated.runtimeErrors + (visualMatrix?.runtimeErrors ?? 0), unmockedApiRequests: reference.unmockedApiRequests + generated.unmockedApiRequests + (visualMatrix?.unmockedApiRequests ?? 0), requiredNetworkFailures: reference.requiredNetworkFailures + generated.requiredNetworkFailures + (visualMatrix?.requiredNetworkFailures ?? 0), nonBlockingNetworkFailures: reference.nonBlockingNetworkFailures + generated.nonBlockingNetworkFailures,
      results: generated.results, reference, generated, comparisons, navigationIntegrity, visualMatrix,
      telemetry: {
        contractTargetRuns: reference.scenariosTotal + generated.scenariosTotal,
        visualViewportRuns: visualMatrix?.viewportRuns ?? 0,
        visualTargetRuns: visualMatrix?.targetRuns ?? 0,
        visualTargetReusedRuns: visualMatrix?.reusedTargetRuns ?? 0,
        visualTargetFreshRuns: visualMatrix?.freshTargetRuns ?? 0,
        visualStabilityFailures: visualMatrix?.stabilityFailures ?? 0,
        visualAdaptiveWaitMs: visualMatrix?.adaptiveWaitMs ?? 0,
        visualPreAnchorWaitMs: visualMatrix?.preAnchorWaitMs ?? 0,
        visualPostAnchorWaitMs: visualMatrix?.postAnchorWaitMs ?? 0,
        visualPostAnchorSkippedRuns: visualMatrix?.postAnchorSkippedRuns ?? 0,
        visualStateReusedRuns: visualMatrix?.visualStateReusedRuns ?? 0,
        contractSetupStateReusedRuns: reference.setupStateReusedRuns + generated.setupStateReusedRuns,
        contractSetupStepsSkipped: reference.setupStepsSkipped + generated.setupStepsSkipped,
        visualSetupStateReusedRuns: visualMatrix?.setupStateReusedTargetRuns ?? 0,
        visualSetupStepsSkipped: visualMatrix?.setupStepsSkipped ?? 0,
        contractSetupOwnerTiming: summarizeSetupOwnerTiming(reference, generated),
        visualCanvas: visualMatrix?.canvas ?? emptyCanvasStabilityTelemetry(),
        visualStability: visualMatrix?.stability ?? emptyVisualStabilityTelemetry(),
        visualRunTiming: visualMatrix?.timing ?? emptyVisualViewportTiming(),
        visualScheduler: visualMatrix?.scheduler ?? emptyVisualSchedulerTelemetry(config),
        visualRequestClassifications: visualMatrix?.requestClassifications ?? emptyRequestClassificationCounts(),
        contractConcurrency: config.execution?.contractConcurrency ?? 1,
        visualConcurrency: config.execution?.visualConcurrency ?? 1,
        browserShutdownMode: "graceful",
        fastShutdownUsed: false,
        fastShutdownConfirmed: false,
        fastShutdownLockAcquired: false,
        fastShutdownLockWaitMs: 0,
        activeHandlesBeforeClose: activeHandleSnapshot(),
        activeHandlesAfterClose: activeHandleSnapshot(),
        timing,
      },
      qualityGates,
    };
    timing.reportReadyMs = elapsed(totalStartedAt);
    allowFastShutdown = requestedFastShutdown && report.passed;
    completedReport = report;
    return report;
  } finally {
    const closeStartedAt = performance.now();
    const handlesBeforeClose = activeHandleSnapshot();
    if (completedReport) completedReport.telemetry.activeHandlesBeforeClose = handlesBeforeClose;
    let fastShutdownLockAcquired = false, fastShutdownLockWaitMs = 0;
    if (launched.server) {
      phaseStartedAt = performance.now();
      await browser.close();
      timing.browserDisconnectMs = elapsed(phaseStartedAt);
      phaseStartedAt = performance.now();
      if (requestedFastShutdown && allowFastShutdown) {
        const lock = await withFastShutdownLock(() => terminateBrowserServerFast(launched.server!));
        fastShutdownLockAcquired = lock.acquired; fastShutdownLockWaitMs = lock.waitMs;
        if (lock.acquired && lock.value !== undefined) fastShutdownConfirmed = lock.value;
        else await launched.server.close();
      } else await launched.server.close();
      timing.browserProcessCloseMs = elapsed(phaseStartedAt);
    } else {
      phaseStartedAt = performance.now();
      await browser.close();
      timing.browserProcessCloseMs = elapsed(phaseStartedAt);
    }
    timing.browserCloseMs = elapsed(closeStartedAt);
    timing.totalMs = elapsed(totalStartedAt);
    const handlesAfterClose = activeHandleSnapshot();
    if (completedReport) {
      completedReport.telemetry.fastShutdownUsed = Boolean(launched.server && requestedFastShutdown && allowFastShutdown && fastShutdownLockAcquired);
      completedReport.telemetry.fastShutdownConfirmed = fastShutdownConfirmed;
      completedReport.telemetry.fastShutdownLockAcquired = fastShutdownLockAcquired;
      completedReport.telemetry.fastShutdownLockWaitMs = fastShutdownLockWaitMs;
      completedReport.telemetry.activeHandlesAfterClose = handlesAfterClose;
      completedReport.telemetry.browserShutdownMode = completedReport.telemetry.fastShutdownUsed && fastShutdownConfirmed ? "fast-kill" : requestedFastShutdown ? "graceful-fallback" : launched.server ? "profiled-graceful" : "graceful";
    }
  }
}
