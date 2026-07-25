# WarpTerminalIsNowOpenSource Specification

## Overview
- **Target file:** `src/components/WarpTerminalIsNowOpenSource.ts`
- **Source selector:** `#open-source`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 content-section 视图：Warp Terminal is now open-source
- **Parent:** root
- **Dependencies:** None

## DOM Structure
- Preserve the source subtree rooted at `#open-source`.

## Computed Styles
- Token: `--sf-img-8`
- Token: `--sf-img-9`
- Token: `--sf-img-11`
- Token: `--sf-img-33`
- Token: `--sf-img-35`
- Token: `--sf-img-34`
- Token: `--font-sans`
- Token: `--font-serif`
- Token: `--font-mono`
- Token: `--color-red-50`
- Token: `--color-red-400`
- Token: `--color-red-500`
- Token: `--color-red-600`
- Token: `--color-red-700`
- Token: `--color-red-950`
- Token: `--color-amber-50`
- Token: `--color-amber-400`
- Token: `--color-amber-500`
- Token: `--color-amber-600`
- Token: `--color-amber-700`
- Token: `--color-amber-950`
- Token: `--color-yellow-500`
- Token: `--color-yellow-700`
- Token: `--color-green-500`

## States & Behaviors
- click: div.lg\3a absolute > a:nth-child(3)
- click: button.btn-wipe
- click: a.px-4

## Per-State Content
- Covers: `click|div.lg\3a absolute > a:nth-child(3)|semantic-control`
- Covers: `click|button.btn-wipe|semantic-control`
- Covers: `click|a.px-4|semantic-control`

## Mutation Targets
N/A

## State Transitions
N/A

## Assets & Data
None

## Text Content (verbatim)
- Warp Terminal is now open-source

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(hover:hover)`
- `(hover:hover)`
- `(forced-colors:active)`
- `(hover:hover)`
- `(prefers-reduced-motion:reduce)`
- `not all and (min-width:64rem)`
- `(min-width:40rem)`
- `(hover:hover)`
- `(min-width:48rem)`
- `(min-width:64rem)`
- `(hover:hover)`
- `(pointer:fine)`
- `(min-width:64rem)`
- `(hover:hover)`

## Complexity Budget
- Estimated lines: 96
- Budget: 150
- Status: READY
