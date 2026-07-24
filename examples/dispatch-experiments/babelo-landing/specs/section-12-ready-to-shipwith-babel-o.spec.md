# ReadyToShipwithBabelO Specification

## Overview
- **Target file:** `src/components/ReadyToShipwithBabelO.ts`
- **Source selector:** `#cta`
- **Source instances:** 1
- **Interaction model:** combined
- **Responsibility:** 复现 content-section 视图：Ready to shipwith BabeL-O?
- **Parent:** root
- **Dependencies:** None

## DOM Structure
- Preserve the source subtree rooted at `#cta`.

## Computed Styles
- Token: `--bg`
- Token: `--surface`
- Token: `--surface-2`
- Token: `--card`
- Token: `--text`
- Token: `--text-2`
- Token: `--text-3`
- Token: `--accent`
- Token: `--accent-soft`
- Token: `--accent-2`
- Token: `--c-red`
- Token: `--c-red-soft`
- Token: `--c-orange`
- Token: `--c-orange-soft`
- Token: `--c-purple`
- Token: `--c-purple-soft`
- Token: `--c-pink`
- Token: `--c-pink-soft`
- Token: `--grad-warm`
- Token: `--grad-warm-soft`
- Token: `--grad-text`
- Token: `--grad-band`
- Token: `--line`
- Token: `--line-2`

## States & Behaviors
- click: #installChip2 > button:nth-child(4)
- click: div.cta-cta > a:nth-child(2)
- scroll-call: div.cta-inner > h2:nth-child(2)
- click: #installChip2 → #installChip2 class.add(copied=copied)
- click: #installChip2 → #installChip2 class.remove(copied=copied)

## Per-State Content
- Covers: `click|#installChip2 > button:nth-child(4)|semantic-control`
- Covers: `click|div.cta-cta > a:nth-child(2)|semantic-control`
- Covers: `scroll-call|div.cta-inner > h2:nth-child(2)|script-assignment`
- Covers: `click|#installChip2|script-assignment`

## Mutation Targets
- Mutates: `#installChip2`

## State Transitions
- #installChip2: class.add `copied` → `copied`
- #installChip2: class.remove `copied` → `copied`

## Assets & Data
- Data dependency: `a`
- Data dependency: `callHandlers`

## Text Content (verbatim)
- Ready to shipwith BabeL-O?

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(max-width:980px)`
- `(max-width:640px)`
- `(prefers-reduced-motion: reduce)`

## Complexity Budget
- Estimated lines: 141
- Budget: 150
- Status: READY
