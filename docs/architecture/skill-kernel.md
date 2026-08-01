# Skill Kernel

## Status

The compatibility Kernel is stable enough for controlled Skill increments. It introduces typed Skill and Task Profile contracts without changing existing analyzer, planner, generator, CLI serialization, or quality-report semantics. The first evaluation Skill now formalizes component-library validation without changing the historical validator output.

The architecture name intentionally uses no generational version suffix. Machine-readable contracts retain independent semantic versions such as `contractVersion: "1.0"` for compatibility checks.

## Boundaries

- **Core** owns contracts, registration, dependency resolution, execution dispatch, artifacts, evaluation runtime, and evidence infrastructure.
- **Skill** contributes one reusable dismantling capability through declared inputs, outputs, stages, dependencies, quality gates, and side effects.
- **Adapter** provides framework-specific evidence under a Skill.
- **Task Profile** composes Skills for a dismantling task type.
- **Case** remains validation evidence and must never become a Skill rule.

## Output preservation

Registry `execute()` returns the wrapped algorithm output directly. It does not add an envelope, rewrite JSON, reinterpret quality status, or lower thresholds.

`executeWithEvidence()` is an explicitly separate API. It returns:

```text
{
  output: <original output>,
  evidence: <SkillExecutionEvidence>
}
```

Failures throw `SkillExecutionError` with failed execution evidence. Existing CLI commands use `execute()` and therefore preserve their current public outputs.

## Registered Skills

- `source-structure`: delegates to `analyzeHtml` and returns the existing `Manifest` unchanged.
- `state-responsibility`: delegates to `analyzeSfcStateResponsibilities` and returns existing handler/state responsibility output unchanged.
- `auth-guard`: delegates to `analyzeSpaAuthGuardResponsibilities` and preserves storage/login/dynamic-route/guard evidence.
- `component-ownership`: delegates to `analyzeSfcVisualResponsibilities`, preserves the historical SFC graph, and projects component-owner nodes as a sidecar responsibility delta.
- `transport-proxy`: delegates to `analyzeTransportProxyResponsibilities`, preserving browser request prefixes while keeping upstream rewrites as audit-only evidence.
- `api-responsibility`: delegates to `analyzeApiFixtureResponsibilities` and preserves reviewed endpoint, response-flow, fixture, and template-consumer evidence.
- `spa-router`: delegates to `evaluateSpaRouterContract` and returns the existing `SpaRouterContractReport` unchanged.
- `component-library-validation`: delegates to `validateLibrary` and returns the existing `ValidationReport` unchanged; package-boundary verification remains a separate reviewed check.
- `primitive-dom`: delegates to `compilePrimitiveDom` for every reviewed component owner and preserves source-node, style-rule, interaction-binding, unsupported-node, and review-reason provenance.

The existing `analyze`, `plan`, and `spa-router` CLI commands dispatch through the default registry. Serialization, exit codes, lifecycle reporting, and quality thresholds remain unchanged.

The generic Profile entry points are explicit and review-gated:

- `profile-plan <profile.config.json> --out <profile.plan.json>` validates provider contracts and writes a deterministic execution plan.
- `profile-run <profile.config.json> --out <profile.report.json>` executes the reviewed plan and records per-Skill raw output, evidence, artifacts, and graph deltas.

The configuration only supplies source paths, configuration objects, or reviewed graph artifacts. It does not define business entities or generate Data Packs; that boundary remains documented in `docs/architecture/data-boundary.md`.

## Task Profiles

The registered profiles remain intentionally small:

- `source-page`: requires `source-structure`; may enable `state-responsibility`.
- `spa-application`: requires `source-structure`, `state-responsibility`, and `spa-router`; may enable `auth-guard` after review.
- `data-backed-spa`: adds `component-ownership`, `data-cardinality`, `transport-proxy`, `api-responsibility`, and `data-surface-manifest`; may enable `auth-guard` after review.
- `component-library`: requires `component-library-validation` and validates an existing generated library without importing demo fixtures or business data.
- `primitive-dom`: resolves `component-ownership` and compiles its reviewed component template structures through the explicit `sfc-visual-responsibility-graph` artifact binding.

A Profile resolves Skill dependencies and quality gates. `ProfileExecutionPlanner` keeps composition reviewable, while `ProfileExecutor` runs only a fully reviewed plan and maps explicit provider paths plus reviewed artifact bindings into each Skill input.


## Execution Context and artifact binding

`SkillExecutionContext` executes a Skill through the Registry, publishes its original output under every declared output contract, retains execution evidence, and optionally stores a responsibility delta.

`SkillInputBinding` connects a downstream input path to an upstream artifact contract and optional output path. The first reviewed binding is:

```text
component-ownership
  produces sfc-visual-responsibility-graph
    .components
      -> api-responsibility input.components
```

Bindings are explicit and reviewed. The Context does not infer fields from names. Profile-level execution is performed only by `ProfileExecutor` after the complete plan passes review; the Context remains responsible for one Skill execution at a time.

## Responsibility graph sidecar

Historical graphs remain authoritative outputs. Skills may additionally implement `projectResponsibilityGraph()` and emit a `ResponsibilityGraphDelta` containing normalized nodes, edges, unresolved evidence, and review state.

`ResponsibilityGraphStore` accumulates deltas and produces a unified snapshot. Conflicting nodes with the same ID are blocking errors rather than silent overwrites. Initial projections are:

- `component-ownership`: component-owner nodes and proven child-component edges.
- `api-responsibility`: API responsibility nodes and `component -> consumes-api` edges.

The sidecar graph does not replace `SfcVisualResponsibilityGraph` or `ApiFixtureResponsibilityGraph`.

`data-cardinality` consumes the reviewed component list from `component-ownership` and emits a dedicated cardinality graph plus sidecar delta. It preserves static array, slice-limit, and template-repeat evidence without re-parsing a case or introducing component-name rules. Unresolved repeated data references remain review-required.

`data-surface-manifest` joins reviewed component ownership, cardinality, and API fixture artifacts. It describes source, shape, fields, consumers, injection boundaries, static references, component props, runtime/store bindings, evidence, and unresolved responsibilities. It does not emit entities, relations, stages, adapters, or runtime patches. `ui-dismantler` owns Manifest production; `sg-data-pack` remains an independent consumer that may convert a reviewed Manifest into a Data Pack.

The Manifest separates two kinds of review evidence:

- `unresolved` / `review.blockers`: evidence gaps that block a reviewed Data Surface or downstream Data Pack generation;
- `review.policyNotices`: non-blocking contract notices, such as project-level router/store response flows that are intentionally outside component data-surface ownership.

This distinction prevents framework-wide audit guidance from inflating component-data blockers. A project-level response flow is not promoted to a business-data surface merely because it consumes an API.

The Manifest identity records `sourceHash`, `fixtureHash`, `configurationHash`, their hash kinds, optional `sourceCommit`, the producer Skill versions, and optional explicitly supplied `generatedAt`. If no timestamp is supplied, canonical serialization is byte-stable for identical inputs. A deliverable Manifest may not retain `<external-source>` as its source root.

The standalone commands are:

```text
ui-dismantler data-surface <sfc-visual.graph.json> [--cardinality <data-cardinality.graph.json>] [--api <api-fixture.graph.json>] --out <data-surface.manifest.json> --source-root <frozen-source-root>
ui-dismantler data-surface-validate <data-surface.manifest.json> [--require-ready]
```

If `--cardinality` is omitted, the command executes the registered `data-cardinality` Skill against the reviewed SFC components. If `--api` is omitted, it consumes `sfc-visual.graph.apiFixtures`. The command remains an emitter/validator only: it does not invoke `sg-data-pack`, write `data.json`, patch a component library, or alter existing CLI command output.

## Dependency policy

- Required dependencies are resolved in deterministic topological order.
- Missing required dependencies and cycles are blocking errors.
- Optional dependencies are declared for planning evidence but are not auto-enabled.
- Project, component, function, class, visible-text, and route-name allowlists are prohibited.
- Compatibility wrappers may declare planning dependencies before their internal algorithms are physically decomposed; the limitation must remain documented until shared source contracts replace direct raw inputs.

## Migration sequence

1. Keep wrapper output identity under regression.
2. Add execution evidence through the separate evidence API.
3. Use Task Profiles to review capability composition.
4. Expand reviewed artifact bindings and responsibility projections without replacing historical graphs.
5. Register data-surface, lifecycle, and visual capabilities as orthogonal Skills.
6. Move shared source/AST helpers under Core one family at a time.
7. Introduce framework Adapters only where structural evidence proves ownership.

## Profile execution planning

`ProfileExecutionPlanner` converts a resolved Task Profile into a reviewable execution plan without automatically running the whole task. It evaluates:

- reviewed external input providers;
- required versus optional input contracts;
- required Skill dependency readiness;
- existing artifact contracts;
- reviewed artifact-to-input bindings;
- downstream blockers caused by an unavailable upstream Skill.

The first complete plan is `data-backed-spa`. With reviewed providers for `html-path`, `project-source-root`, `sfc-script-source`, and `spa-router-contract-config`, the plan can connect `component-ownership.components` to `api-responsibility.components` and mark every step ready. Missing or unreviewed inputs remain explicit blockers.

`ProfileExecutor` consumes that reviewed plan and preserves four separate result channels for every Skill:

- raw output;
- `SkillExecutionEvidence`;
- published artifact references;
- optional `ResponsibilityGraphDelta`.

External providers must declare an explicit input path and value; contract names are never converted into object fields by naming heuristics. A blocked plan executes no Skill. A runtime failure records the failing Skill evidence and blocks all remaining downstream execution. Each execution receives a fresh Context by default so artifacts do not leak across Profile runs.

## Target source layout

The intended structure is:

```text
src-ts/
├── core/
│   ├── skills/
│   │   ├── contract.ts
│   │   ├── registry.ts
│   │   ├── evidence.ts
│   │   └── execution-context.ts
│   ├── profiles/
│   │   ├── contract.ts
│   │   ├── registry.ts
│   │   ├── execution-plan.ts
│   │   └── executor.ts
│   ├── artifacts/
│   │   ├── contract.ts
│   │   ├── binding.ts
│   │   ├── registry.ts
│   │   └── store.ts
│   ├── responsibility/
│   │   ├── graph.ts
│   │   └── store.ts
│   ├── source/       # created when shared file/import/source-location code is migrated
│   ├── ast/          # created when shared AST walking/static-value code is migrated
│   └── evaluation/   # created when browser/runtime evaluation is physically extracted
├── skills/
├── adapters/
└── profiles/
```

Three deliberate differences from a simpler proposed tree are retained:

1. Profiles remain under `core/profiles`, not `core/skills`, because task composition is not a Skill capability.
2. The normalized graph is named `responsibility`, not generic `graph`, so it is not confused with router, layout, dependency, or ECharts graphs.
3. `source`, `ast`, `evaluation`, and framework adapter directories are created only when real implementations move into them; empty architectural placeholders are not committed.

Current Skill modules remain single files while they contain one wrapper and one projector. `data-surface-manifest` uses a directory because its contract, deterministic builder, responsibility projector, and Skill wrapper are independent implementation units. A Skill moves to its own directory when it gains multiple implementation units, for example:

```text
skills/component-ownership/
├── skill.ts
├── projector.ts
└── contracts.ts
```

This avoids directory ceremony while preserving the long-term modular boundary.

Profiles are added only when their required capabilities exist. `admin-dashboard` and `canvas` are therefore target Profiles, not empty current declarations.

## Component library production boundary

Skill execution and component production are related but separate layers. The production layer consumes reviewed outputs from Skills and materializes a publishable component library without changing the raw Skill outputs.

```text
ComponentPlan / PrimitiveDomCompilation / reviewed files
  → ComponentLibraryBuildPlan
  → Materializer
  → Runtime Smoke
  → component-library-validation
  → existing Roundtrip / Gold+ gates
```

The production implementation is under `src-ts/production/component-library/`:

- `contract.ts` defines file provenance, publishability, smoke, identity, and review state;
- `planner.ts` freezes source files into a deterministic plan with content hashes;
- `materializer.ts` writes only safe relative paths and preserves examples/fixtures as non-publishable files;
- `smoke.ts` checks runtime loading, mount, rendered nodes, console/runtime errors, local resources, and optional cleanup;
- `pipeline.ts` writes `ComponentLibraryBuildReport` and invokes existing static validation and optional quality gates.

This is an orchestration boundary, not a new case-specific Skill. The first implementation accepts reviewed generated files so that old planners and generators can be adapted incrementally. `primitive-dom-build-plan` projects executable static Primitive DOM evidence into a runnable plan; `component-plan-build-plan` preserves missing DOM/style evidence as an explicit review blocker instead of inventing a component; `visual-target-build-plan` consumes legacy Visual Target owners and scoped source styles while preserving the source plan's review-only status. `component-build-enrich` projects State Responsibility and Data Surface evidence as explicit metadata-only bindings; values and unreviewed expressions never enter the publishable runtime. The production layer also has an `eval`-free state-transition executor for auditable literal assignment, boolean toggle, and numeric increment/decrement evidence; it does not activate runtime materialization by itself. Reviewed component-prop collection bindings may additionally materialize a constrained `v-for`/`in`/`of` loop against caller-owned `mount(..., { data })` values. Conditional regions are lifted only when the Primitive graph identity matches the Build Plan, the directive is a supported `v-if`/`v-show`, and every condition dependency is present in reviewed initial state. A plain `v-model` may update reviewed scalar state and rerender dependent DOM; modifiers and model paths without reviewed initial state remain blocked. State evidence is owner-scoped for multi-component plans: each `componentId` receives an isolated initial-state slice and handler resolution never falls through to another component with the same handler name. Unsupported branch chains and expressions remain blocked. A projection may attach an explicit Quality contract, allowing the same build to proceed through Runtime Smoke, structural validation, reviewed scenario state, and optional visual Gold+ gates. Reviewed API surfaces materialize only an external adapter contract keyed by Data Surface id. Endpoint and fixture values never enter the publishable runtime; caller-owned runtime options provide values, and Runtime Smoke verifies adapter presence plus reviewed shape, cardinality, and fields. Static business bindings, unknown runtime bindings, unknown collection expressions, and unresolved cardinality remain blocked. A plan with unresolved evidence is blocked before materialization.
