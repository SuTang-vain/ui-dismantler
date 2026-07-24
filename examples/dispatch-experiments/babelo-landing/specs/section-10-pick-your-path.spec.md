# PickYourPath Specification

## Overview
- **Target file:** `src/components/PickYourPath.ts`
- **Source selector:** `#paths`
- **Source instances:** 1
- **Interaction model:** combined
- **Responsibility:** 复现 content-section 视图：Pick your path
- **Parent:** root
- **Dependencies:** None

## DOM Structure
- Preserve the source subtree rooted at `#paths`.

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
- click: div.paths-grid > article:nth-child(1) > a:nth-child(5)
- click: article.featured > a:nth-child(6)
- click: div.paths-grid > article:nth-child(3) > a:nth-child(5)

## Per-State Content
- Covers: `click|div.paths-grid > article:nth-child(1) > a:nth-child(5)|semantic-control`
- Covers: `click|article.featured > a:nth-child(6)|semantic-control`
- Covers: `click|div.paths-grid > article:nth-child(3) > a:nth-child(5)|semantic-control`

## Mutation Targets
N/A

## State Transitions
N/A

## Assets & Data
- Data dependency: `a`

## Text Content (verbatim)
- Pick your path

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
- Estimated lines: 104
- Budget: 150
- Status: READY
