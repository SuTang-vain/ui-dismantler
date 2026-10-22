# Roundtrip structure scoring

`npm run roundtrip` and `npm run quality` compare a reference page with a component
library in a real browser. Two structure modes exist because the project supports two
different migration strategies.

## Roots

Both trees are reduced to a content root before scoring. A container is descended when it
has exactly one element child, or when one child holds at least 60% of the subtree text.
Multi-root pages therefore keep every top-level branch; an empty decorative div can no
longer become the reference root and collapse the score to zero.

## `mimicry` (default)

```bash
node dist-ts/cli.js roundtrip page.html --lib lib
```

- matches children by class-name similarity (exact overlap + hyphen-suffix credit);
- computes `nodeMatchRate`, `classMatchRate`, then `structure = (nodeMatchRate + classMatchRate) / 2`;
- this is the historical metric and the one used by frozen case baselines and Gold regressions.
  It measures structural mimicry: a rebuild that keeps the same class vocabulary scores high,
  a rebuild from a different design system scores near zero.

## `semantic`

```bash
node dist-ts/cli.js roundtrip page.html --lib lib --structure-mode semantic
node dist-ts/cli.js quality page.html --lib lib --structure-mode semantic
```

- class matching stays primary;
- when a reference node has no class match, it may pair with a candidate whose visible text
  overlaps (sampled up to 40 strings, exact or long-substring, threshold 0.5);
- a text-anchored pair with a different tag earns half node credit, so nesting differences
  are not automatically errors;
- `structure` becomes `textAnchorCoverage`: the share of reference text nodes (≥6 chars,
  counted with multiplicity) that exist in the generated tree.

`textAnchorCoverage` is computed in both modes and reported next to the mimicry numbers, so
a semantic run remains auditable (`structureMode`, `textAnchors`, `textAnchorMatches`,
`semanticMatches`).

## What the modes do not change

Visual gates are independent of the structure mode. `computed-style`, `pixel-diff`,
`viewport-matrix`, `navigation-integrity`, `font-face-alignment`, `scenario-protocol`, and
`coverage` use the same thresholds in both modes. A semantic rebuild can pass structure and
still fail visual fidelity — that is the intended signal.

## Choosing a mode

| Situation | Mode |
|---|---|
| Generated library that preserves the source DOM vocabulary | `mimicry` |
| Agent-authored rebuild with its own design system | `semantic` |
| Frozen case regression (`test:gold`) | `mimicry` |
| Publishing a "content-equivalent migration" claim | `semantic` plus visual evidence |

Never lower the visual thresholds to make a semantic run pass. Report the two numbers
separately: structural/content equivalence from `roundtrip`, visual equivalence from the
browser matrix.
