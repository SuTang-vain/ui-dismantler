# Skill Kernel

## Status

Initial compatibility architecture. The Kernel introduces typed Skill and Task Profile contracts without changing existing analyzer, planner, generator, CLI serialization, or quality-report semantics.

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

## Initial Skills

- `source-structure`: delegates to `analyzeHtml` and returns the existing `Manifest` unchanged.
- `state-responsibility`: delegates to `analyzeSfcStateResponsibilities` and returns existing handler/state responsibility output unchanged.
- `auth-guard`: delegates to `analyzeSpaAuthGuardResponsibilities` and preserves storage/login/dynamic-route/guard evidence.
- `component-ownership`: delegates to `analyzeSfcVisualResponsibilities`, preserves the historical SFC graph, and projects component-owner nodes as a sidecar responsibility delta.
- `transport-proxy`: delegates to `analyzeTransportProxyResponsibilities`, preserving browser request prefixes while keeping upstream rewrites as audit-only evidence.
- `api-responsibility`: delegates to `analyzeApiFixtureResponsibilities` and preserves reviewed endpoint, response-flow, fixture, and template-consumer evidence.
- `spa-router`: delegates to `evaluateSpaRouterContract` and returns the existing `SpaRouterContractReport` unchanged.

The existing `analyze`, `plan`, and `spa-router` CLI commands dispatch through the default registry. Serialization, exit codes, lifecycle reporting, and quality thresholds remain unchanged.

## Task Profiles

The initial profiles are intentionally small:

- `source-page`: requires `source-structure`; may enable `state-responsibility`.
- `spa-application`: requires `source-structure`, `state-responsibility`, and `spa-router`; may enable `auth-guard` after review.
- `data-backed-spa`: adds `component-ownership`, `data-cardinality`, `transport-proxy`, `api-responsibility`, and `data-surface-manifest`; may enable `auth-guard` after review.

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

`data-surface-manifest` joins reviewed component ownership, cardinality, and API fixture artifacts. It describes source, shape, fields, consumers, injection boundaries, static references, evidence, and unresolved responsibilities. It does not emit entities, relations, stages, adapters, or runtime patches. `ui-dismantler` owns Manifest production; `sg-data-pack` remains an independent consumer that may convert a reviewed Manifest into a Data Pack.

The Manifest identity records `sourceHash`, `fixtureHash`, `configurationHash`, their hash kinds, optional `sourceCommit`, the producer Skill versions, and optional explicitly supplied `generatedAt`. If no timestamp is supplied, canonical serialization is byte-stable for identical inputs. A deliverable Manifest may not retain `<external-source>` as its source root.

The standalone commands are:

```text
ui-dismantler data-surface <sfc-visual.graph.json> [--cardinality <data-cardinality.graph.json>] [--api <api-fixture.graph.json>] --out <data-surface.manifest.json> --source-root <frozen-source-root>
ui-dismantler data-surface-validate <data-surface.manifest.json>
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
