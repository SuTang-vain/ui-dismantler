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
- `transport-proxy`: delegates to `analyzeTransportProxyResponsibilities`, preserving browser request prefixes while keeping upstream rewrites as audit-only evidence.
- `api-responsibility`: delegates to `analyzeApiFixtureResponsibilities` and preserves reviewed endpoint, response-flow, fixture, and template-consumer evidence.
- `spa-router`: delegates to `evaluateSpaRouterContract` and returns the existing `SpaRouterContractReport` unchanged.

The existing `analyze`, `plan`, and `spa-router` CLI commands dispatch through the default registry. Serialization, exit codes, lifecycle reporting, and quality thresholds remain unchanged.

## Task Profiles

The initial profiles are intentionally small:

- `source-page`: requires `source-structure`; may enable `state-responsibility`.
- `spa-application`: requires `source-structure`, `state-responsibility`, and `spa-router`; may enable `auth-guard` after review.
- `data-backed-spa`: adds `transport-proxy` and `api-responsibility`; may enable `auth-guard` after review.

A Profile resolves Skill dependencies and quality gates. It does not execute Skills because different capabilities currently consume different reviewed inputs.

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
4. Continue registering data-surface, visual, and lifecycle capabilities as orthogonal Skills.
5. Move shared source/AST helpers under Core one family at a time.
6. Introduce framework Adapters only where structural evidence proves ownership.
