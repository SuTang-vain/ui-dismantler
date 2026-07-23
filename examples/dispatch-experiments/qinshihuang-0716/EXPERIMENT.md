# Component dispatch verification protocol

## Baseline

- Reference: `examples/cases/qinshihuang-0716-ts/original.html`
- Existing Gold+ control library: `examples/cases/qinshihuang-0716-ts/lib`
- Control result on 2026-07-23:
  - final overall: 0.9945
  - DOM: 0.998
  - visual: 0.9921
  - viewport matrix: 4/4
  - computed style worst: 0.9898
  - pixel diff worst: 0.007154
  - formal scenarios: 4/4

## Dispatch inputs

- `component-plan.json`
- `specs/*.spec.md`
- source page and manifest
- shared `types.ts` / `constants.ts`

## Acceptance

1. TypeScript build has no errors.
2. Every planned component has a corresponding module.
3. No component source file exceeds 150 lines without a recorded planning correction.
4. All generated JavaScript passes `node --check`.
5. Library validation passes 10/10.
6. Four initial viewports pass.
7. Four formal interaction scenarios pass.
8. Selector coverage is 1.0.
9. Worst computed-style score is at least 0.98.
10. Worst pixel diff is no more than 0.02.
11. Runtime errors are zero.

`plan.ready` is treated only as permission to dispatch; Gold+ determines whether the dispatched implementation is accepted.
