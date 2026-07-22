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
}

export interface Interaction {
  trigger: string;
  event: string;
  action: string;
  target?: string;
  source: "html-attribute" | "event-listener" | "semantic-control";
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
  action: "click" | "input" | "key" | "wait";
  target?: ScenarioTarget;
  value?: string;
  commit?: boolean;
  key?: string;
  code?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
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
}

export interface Scenario {
  id: string;
  label?: string;
  candidate?: boolean;
  covers?: string[];
  notes?: string[];
  viewport?: { width: number; height: number };
  steps: ScenarioStep[];
  assertions: ScenarioAssertion[];
}

export interface ScenarioDocument {
  schemaVersion: "1.0";
  generatedFrom?: string;
  candidatePolicy?: string;
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
}

export interface SelectorCoverageReport {
  passed: boolean;
  sgElements: number;
  sgClassUses: number;
  matchedSgClassUses: number;
  coverageRate: number;
  unmatchedClasses: SelectorCoverageIssue[];
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
  differentPixels: number;
  totalPixels: number;
  diffRate: number;
  passed: boolean;
  threshold: number;
  diffImagePath?: string;
  referenceImagePath?: string;
  generatedImagePath?: string;
}

export interface BrowserQualityReport {
  available: boolean;
  error?: string;
  reference?: {
    ok: boolean;
    runtimeErrors: string[];
    selectorCoverage: SelectorCoverageReport;
    styles: ComputedStyleSnapshot[];
  };
  generated?: {
    ok: boolean;
    runtimeErrors: string[];
    selectorCoverage: SelectorCoverageReport;
    styles: ComputedStyleSnapshot[];
  };
  selectorCoverage?: SelectorCoverageReport;
  styles?: StyleComparisonReport;
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
