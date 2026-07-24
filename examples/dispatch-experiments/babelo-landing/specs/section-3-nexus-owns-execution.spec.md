# NexusOwnsExecution Specification

## Overview
- **Target file:** `src/components/NexusOwnsExecution.ts`
- **Source selector:** `#howScroll > article:nth-child(1)`
- **Source instances:** 1
- **Interaction model:** combined
- **Responsibility:** 复现 content-section 视图：Nexus owns execution
- **Parent:** root
- **Dependencies:** None

## DOM Structure
- Preserve the source subtree rooted at `#howScroll > article:nth-child(1)`.

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
- keydown: #howScroll → #howScroll property.set(scroll-position)
- wheel: #howScroll → #howScroll property.set(scrollLeft)

## Per-State Content
- Covers: `keydown|#howScroll|script-assignment`
- Covers: `wheel|#howScroll|script-assignment`

## Mutation Targets
- Mutates: `#howScroll`

## State Transitions
- #howScroll: property.set `scroll-position`
- #howScroll: property.set `scroll-position`
- #howScroll: property.set `scrollLeft`

## Assets & Data
None

## Text Content (verbatim)
- Nexus owns execution

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
- Estimated lines: 114
- Budget: 150
- Status: READY
