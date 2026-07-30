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
- `data-backed-spa`: adds `component-ownership`, `transport-proxy`, and `api-responsibility`; may enable `auth-guard` after review.

A Profile resolves Skill dependencies and quality gates. It does not execute Skills because different capabilities currently consume different reviewed inputs.


## Execution Context and artifact binding

`SkillExecutionContext` executes a Skill through the Registry, publishes its original output under every declared output contract, retains execution evidence, and optionally stores a responsibility delta.

`SkillInputBinding` connects a downstream input path to an upstream artifact contract and optional output path. The first reviewed binding is:

```text
component-ownership
  produces sfc-visual-responsibility-graph
    .components
      -> api-responsibility input.components
```

Bindings are explicit and reviewed. The Context does not infer fields from names and does not execute an entire Profile automatically.

## Responsibility graph sidecar

Historical graphs remain authoritative outputs. Skills may additionally implement `projectResponsibilityGraph()` and emit a `ResponsibilityGraphDelta` containing normalized nodes, edges, unresolved evidence, and review state.

`ResponsibilityGraphStore` accumulates deltas and produces a unified snapshot. Conflicting nodes with the same ID are blocking errors rather than silent overwrites. Initial projections are:

- `component-ownership`: component-owner nodes and proven child-component edges.
- `api-responsibility`: API responsibility nodes and `component -> consumes-api` edges.

The sidecar graph does not replace `SfcVisualResponsibilityGraph` or `ApiFixtureResponsibilityGraph`.

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
