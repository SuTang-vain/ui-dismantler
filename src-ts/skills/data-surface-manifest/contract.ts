export type DataSurfaceShapeKind = "collection" | "record" | "scalar" | "unknown";
export type DataSurfaceItemKind = "record" | "scalar" | "mixed" | "unknown";

export interface DataSurfaceLibrary {
  readonly sourceRoot: string;
  readonly framework: "vue-sfc";
}

export interface DataSurfaceApiSource {
  readonly responsibilityId: string;
  readonly method: string;
  readonly path: string;
  readonly requestPath?: string;
  readonly responsePath: string;
  readonly bodyHash: string;
  readonly reviewed: true;
  readonly transportPrefixes: readonly string[];
}

export interface DataSurfaceStaticSource {
  readonly binding: string;
  readonly valueHash: string;
}

export interface DataSurfaceStateInitialSource {
  readonly binding: string;
  readonly valueHash: string;
}

export interface DataSurfaceSource {
  readonly primary: "reviewed-api-fixture" | "module-static-binding";
  readonly api?: DataSurfaceApiSource;
  readonly static?: DataSurfaceStaticSource;
  readonly stateInitial?: DataSurfaceStateInitialSource;
}

export interface DataSurfaceShape {
  readonly kind: DataSurfaceShapeKind;
  readonly itemKind: DataSurfaceItemKind;
  readonly cardinality: number | null;
  readonly evidence: readonly string[];
}

export interface DataSurfaceField {
  readonly path: string;
  readonly consumers: readonly string[];
  readonly evidence: readonly ("rendered-field" | "fixture-shape" | "static-shape" | "state-shape")[];
}

export interface DataSurfaceConsumer {
  readonly componentId: string;
  readonly componentName: string;
  readonly componentFile: string;
  readonly targetBinding: string;
  readonly responsePath?: string;
  readonly renderedFields: readonly string[];
}

export interface DataSurfaceInjection {
  readonly kind: "state-binding" | "component-static-binding";
  readonly target: string;
  readonly sourcePath?: string;
  readonly reviewed: boolean;
}

export interface DataSurfaceReference {
  readonly fromPath: string;
  readonly target: string;
  readonly kind: "static-expression";
  readonly resolved: boolean;
}

export interface DataSurfaceEvidence {
  readonly source: string;
  readonly detail: string;
  readonly confidence: "high" | "medium" | "low";
}

export interface DataSurface {
  readonly id: string;
  readonly owner: {
    readonly componentId: string;
    readonly componentName: string;
    readonly componentFile: string;
  };
  readonly source: DataSurfaceSource;
  readonly shape: DataSurfaceShape;
  readonly fields: readonly DataSurfaceField[];
  readonly consumers: readonly DataSurfaceConsumer[];
  readonly injection: DataSurfaceInjection;
  readonly references: readonly DataSurfaceReference[];
  readonly evidence: readonly DataSurfaceEvidence[];
  readonly unresolved: readonly string[];
  readonly reviewRequired: boolean;
}

export interface DataSurfaceManifestUnresolved {
  readonly owner?: string;
  readonly source?: string;
  readonly reason: string;
}

export interface DataSurfaceManifest {
  readonly schemaVersion: "1.0";
  readonly kind: "data-surface-manifest";
  readonly library: DataSurfaceLibrary;
  readonly surfaces: readonly DataSurface[];
  readonly unresolved: readonly DataSurfaceManifestUnresolved[];
  readonly metrics: {
    readonly surfaces: number;
    readonly apiSurfaces: number;
    readonly staticSurfaces: number;
    readonly reviewedFixtures: number;
    readonly fields: number;
    readonly references: number;
    readonly unresolved: number;
  };
  readonly reviewRequired: boolean;
}
