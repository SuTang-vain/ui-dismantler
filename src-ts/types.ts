export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface ThemeToken {
  name: string;
  value: string;
  original: string;
  usage: string[];
  roles: string[];
}

export interface ViewEvidence {
  signal: string;
  value?: string | number | boolean;
}

export interface AnalyzedView {
  id: string;
  type: string;
  structuralType: string;
  semanticType: string;
  confidence: number;
  evidence: ViewEvidence[];
  selector: string;
  details: Record<string, JsonValue>;
  componentCandidates?: AnalyzedView[];
}

export interface UIStateTransition {
  target: string;
  kind: "class" | "attribute" | "property" | "style" | "content" | "focus" | "structure";
  operation: "add" | "remove" | "replace" | "toggle" | "set" | "clear" | "append" | "remove-node" | "focus" | "blur" | "open" | "close";
  name?: string;
  value?: string | number | boolean | null;
  previousValue?: string | number | boolean | null;
  confidence: number;
  source: string;
}

export type InteractionResponsibility = "user-action" | "navigation-action" | "no-op-control" | "gesture-protocol" | "scroll-lifecycle" | "viewport-lifecycle" | "resource-lifecycle" | "custom-lifecycle";

export interface Interaction {
  trigger: string;
  event: string;
  action: string;
  target?: string;
  mutationTargets?: string[];
  stateMutations?: string[];
  stateTransitions?: UIStateTransition[];
  dataDependencies?: string[];
  analysis?: "attribute" | "semantic" | "regex" | "ast";
  responsibility?: InteractionResponsibility;
  /** @deprecated Read-only compatibility for manifests generated before responsibility was structured. */
  lifecycle?: boolean;
  confidence?: number;
  source: "html-attribute" | "event-listener" | "script-assignment" | "semantic-control";
  fingerprint: string;
}

export interface Manifest {
  schemaVersion: "1.0";
  meta: {
    source: string;
    title: string;
    templateId: string | null;
    vertical: string;
    profile: string;
    caseName: string;
    canvas: {
      pc: [number | null, number | null] | null;
      wise: [number | null, number | null] | null;
      extreme: [number | null, number | null] | null;
      frameSelector: string | null;
    };
  };
  theme: {
    tokens: ThemeToken[];
    gradients: Array<{ type: string; value: string }>;
  };
  structure: {
    tabs: Array<{ id: string; label: string; selector: string; target: string | null }>;
    views: AnalyzedView[];
    modals: Array<{ id: string; selector: string; role: string | null; closeSelector: string | null }>;
    landmarks: Array<{ tag: string; role: string | null; selector: string }>;
  };
  data: {
    contracts: DataContract[];
    members: JsonValue[];
    timeline: JsonValue[];
    works: JsonValue[];
    moreFacts: JsonValue[];
  };
  interactions: Interaction[];
  responsive: Array<{ query: string; minWidth: number | null; maxWidth: number | null }>;
  a11y: {
    hasLang: boolean;
    buttons: number;
    unlabeledButtons: number;
    images: number;
    imagesWithoutAlt: number;
    tabs: number;
    tabpanels: number;
    dialogs: number;
  };
  warnings: string[];
}

export interface DataContract {
  name: string;
  kind: "array" | "object";
  fields: Record<string, string>;
  count: number;
}

export interface ValidationResult {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

export interface ValidationReport {
  target: string;
  passed: number;
  failed: number;
  total: number;
  ok: boolean;
  results: ValidationResult[];
}

export interface RenderTree {
  tag: string;
  classes?: string[];
  text?: string;
  children?: RenderTree[];
}

export interface RenderResult {
  ok: boolean;
  error?: string;
  mode?: string;
  dom?: RenderTree;
  tree?: RenderTree;
  texts?: string[];
  nodeCount?: number;
  classCoverage?: {
    rate: number;
    totalClassUses: number;
    coveredClassUses: number;
    missingClasses: string[];
  };
  scenario?: ScenarioExecution;
  runtimeErrors?: string[];
  missingFiles?: string[];
  remoteResources?: string[];
  unsupportedModules?: string[];
  viewport?: { width: number; height: number };
}

export type ScenarioTarget = string | { reference?: string; library?: string; default?: string };

export interface ScenarioStep {
  action: "click" | "input" | "key" | "wheel" | "wait";
  target?: ScenarioTarget;
  value?: string;
  commit?: boolean;
  key?: string;
  code?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  deltaX?: number;
  deltaY?: number;
  ms?: number;
}

export interface ScenarioAssertion {
  target: ScenarioTarget;
  visible?: boolean;
  text?: string;
  textContains?: string;
  value?: string;
  focused?: boolean;
  classIncludes?: Array<string | ScenarioTarget>;
  classExcludes?: Array<string | ScenarioTarget>;
  attributes?: Record<string, string | null>;
  propertyRanges?: Record<string, { min?: number; max?: number }>;
}

export interface ScreenshotAnchorCandidate {
  target: ScenarioTarget;
  confidence: number;
  source: "state-transition" | "mutation-target";
  reason: string;
  reviewRequired: true;
}

export interface Scenario {
  id: string;
  label?: string;
  candidate?: boolean;
  critical?: boolean;
  equivalenceGroupId?: string;
  covers?: string[];
  notes?: string[];
  viewport?: { width: number; height: number };
  screenshotAnchor?: ScenarioTarget;
  screenshotAnchorCandidates?: ScreenshotAnchorCandidate[];
  steps: ScenarioStep[];
  assertions: ScenarioAssertion[];
}

export interface ScenarioCoverageWaiver {
  fingerprint: string;
  reason: string;
}

export interface InteractionEquivalenceGroup {
  id: string;
  signature: string;
  event: string;
  triggerShape: string;
  representativeFingerprint: string;
  memberFingerprints: string[];
  reason: string;
}

export interface ScenarioDocument {
  schemaVersion: "1.0";
  generatedFrom?: string;
  candidatePolicy?: string;
  equivalenceGroups?: InteractionEquivalenceGroup[];
  coverageWaivers?: ScenarioCoverageWaiver[];
  scenarios: Scenario[];
}

export interface ScenarioExecution {
  ok: boolean;
  id: string;
  label?: string;
  steps?: JsonValue[];
  assertions?: Array<{ passed: boolean; detail?: string }>;
}

export interface RoundtripScore {
  structure: {
    nodeMatchRate: number;
    nodeRecall: number;
    nodePrecision: number;
    redundancyPenalty: number;
    classMatchRate: number;
    refNodes: number;
    gotNodes: number;
    matchedNodes: number;
  };
  text: {
    textMatchRate: number;
    textPrecision: number;
    exactMatch: number;
    containMatch: number;
    refCount: number;
    gotCount: number;
    missing: string[];
    extra: string[];
  };
  classCoverage: RenderResult["classCoverage"];
  scores: { structure: number; text: number; overall: number };
  overall: number;
}

export interface SelectorCoverageIssue {
  selector: string;
  count: number;
  examples: string[];
  reason?: string;
  evidence?: {
    sourceClass: string;
    sourceClassUses: number;
    sourceSelectorAbsent: boolean;
    generatedSelectorAbsent: boolean;
  };
}

export interface SelectorCoverageReport {
  passed: boolean;
  sgElements: number;
  sgClassUses: number;
  requiredSgClassUses: number;
  matchedSgClassUses: number;
  coverageRate: number;
  unmatchedClasses: SelectorCoverageIssue[];
  exemptClasses: SelectorCoverageIssue[];
  inactiveClasses: SelectorCoverageIssue[];
  activeMatchRate: number;
  orphanSgSelectors: SelectorCoverageIssue[];
  mismatchHints: Array<{ domClass: string; cssSelector: string; reason: string }>;
}

export interface ComputedStyleSnapshot {
  key: string;
  tag: string;
  id: string;
  classes: string[];
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
}

export interface StyleComparisonReport {
  matched: number;
  referenceCount: number;
  generatedCount: number;
  propertyCount: number;
  matchingProperties: number;
  rate: number;
  mismatches: Array<{
    key: string;
    property: string;
    reference: string;
    generated: string;
  }>;
}

export interface PixelDiffReport {
  width: number;
  height: number;
  referenceWidth: number;
  referenceHeight: number;
  generatedWidth: number;
  generatedHeight: number;
  dimensionMismatch: boolean;
  differentPixels: number;
  totalPixels: number;
  diffRate: number;
  passed: boolean;
  threshold: number;
  diffImagePath?: string;
  referenceImagePath?: string;
  generatedImagePath?: string;
}

export type VisualResourceType = "image" | "stylesheet" | "background-image" | "mask-image" | "font";

export interface VisualResourceFailure {
  url: string;
  type: VisualResourceType;
  owner: string;
  pseudo?: "::before" | "::after";
  phase?: string;
  role?: "reference" | "library";
  state: "pending" | "timeout" | "http-error" | "request-failed" | "decode-error" | "font-loading";
  status?: number;
  failure?: string;
  elapsedMs?: number;
  required: boolean;
  external: boolean;
}

export interface TranslationFidelityReport {
  passed: boolean;
  score: number;
  selectorCoverage: number;
  computedStyle: number;
  pixelDiff: number;
}

export interface ExternalAvailabilityReport {
  passed: boolean;
  requiredFailures: number;
  externalFailures: number;
}

export type NavigationReferenceKind = "fragment" | "relative-url" | "external-url" | "mailto" | "tel" | "download" | "inert";

export interface NavigationReferenceSnapshot {
  selector: string;
  text: string;
  href: string;
  normalizedTarget: string;
  kind: NavigationReferenceKind;
  download: string | null;
  fragmentTargetExists: boolean | null;
}

export type NavigationTransitionMethod = "pushState" | "replaceState" | "popstate" | "hashchange";

export interface NavigationTransitionSnapshot {
  method: NavigationTransitionMethod;
  target: string;
  state: string;
}

export interface NavigationIntegrityIssue {
  index: number;
  reason: "count-mismatch" | "target-mismatch" | "kind-mismatch" | "download-mismatch" | "missing-fragment-target" | "transition-count-mismatch" | "transition-method-mismatch" | "transition-target-mismatch" | "transition-state-mismatch";
  reference?: NavigationReferenceSnapshot;
  generated?: NavigationReferenceSnapshot;
  referenceTransition?: NavigationTransitionSnapshot;
  generatedTransition?: NavigationTransitionSnapshot;
}

export interface NavigationIntegrityReport {
  passed: boolean;
  total: number;
  matched: number;
  rate: number;
  issues: NavigationIntegrityIssue[];
}

export interface FontFaceSnapshot {
  family: string;
  style: string;
  weight: string;
  stretch: string;
  display: string;
  status: "unloaded" | "loading" | "loaded" | "error";
  blocking: boolean;
}

export interface FontFaceAlignmentReport {
  passed: boolean;
  referenceFaces: number;
  generatedFaces: number;
  matchedFaces: number;
  blockingFaces: number;
  nonBlockingFaces: number;
  loadedFaces: number;
  fallbackFaces: number;
  failedFaces: number;
  blockingMissingFaces: number;
  nonBlockingMissingFaces: number;
  blockingStateMismatches: number;
  nonBlockingStateMismatches: number;
  missing: Array<{ role: "reference" | "library"; key: string }>;
}


export interface QualityViewport {
  id: string;
  label: string;
  width: number;
  height: number;
}

export interface BrowserViewportReport extends QualityViewport {
  available: boolean;
  error?: string;
  runtimeErrors: number;
  stabilityFailures: number;
  stabilityFailureDetails: Array<{ role: "reference" | "library"; message: string }>;
  resourceFailures: VisualResourceFailure[];
  translationFidelity?: TranslationFidelityReport;
  externalAvailability?: ExternalAvailabilityReport;
  navigationIntegrity?: NavigationIntegrityReport;
  fontFaceAlignment?: FontFaceAlignmentReport;
  selectorCoverage?: Pick<SelectorCoverageReport, "passed" | "coverageRate" | "activeMatchRate" | "unmatchedClasses" | "exemptClasses" | "mismatchHints">;
  styles?: Pick<StyleComparisonReport, "rate" | "matched" | "referenceCount" | "generatedCount" | "propertyCount" | "matchingProperties" | "mismatches">;
  pixels?: PixelDiffReport;
  score?: number;
  passed: boolean;
}

export interface BrowserQualityMatrixReport {
  viewports: BrowserViewportReport[];
  passed: boolean;
  score: number;
  worstViewport: string;
  worstSelectorCoverage: number;
  worstComputedStyle: number;
  worstPixelDiff: number;
  runtimeErrors: number;
  stabilityFailures: number;
  resourceFailures: number;
  nonBlockingResourceObservations: number;
  externalAvailabilityFailures: number;
  navigationFailures: number;
  worstNavigationIntegrity: number;
  fontAlignmentFailures: number;
  blockingFontStateMismatches: number;
  failedFontFaces: number;
}

export interface BrowserScenarioQualityMatrixReport extends BrowserQualityMatrixReport {
  scenarioId: string;
  label?: string;
}

export interface BrowserQualityReport {
  available: boolean;
  error?: string;
  reference?: {
    ok: boolean;
    runtimeErrors: string[];
    stabilityFailures: string[];
    resourceFailures: VisualResourceFailure[];
    selectorCoverage: SelectorCoverageReport;
    styles: ComputedStyleSnapshot[];
  };
  generated?: {
    ok: boolean;
    runtimeErrors: string[];
    stabilityFailures: string[];
    resourceFailures: VisualResourceFailure[];
    selectorCoverage: SelectorCoverageReport;
    styles: ComputedStyleSnapshot[];
  };
  selectorCoverage?: SelectorCoverageReport;
  styles?: StyleComparisonReport;
  translationFidelity?: TranslationFidelityReport;
  externalAvailability?: ExternalAvailabilityReport;
  navigationIntegrity?: NavigationIntegrityReport;
  fontFaceAlignment?: FontFaceAlignmentReport;
  pixels?: PixelDiffReport;
  score?: number;
  passed?: boolean;
}

export interface QualityThresholds {
  overall: number;
  structure: number;
  text: number;
  scenarioState: number;
  interactionCoverage: number | null;
  selectorCoverage: number;
  style: number;
  pixelDiff: number;
}
