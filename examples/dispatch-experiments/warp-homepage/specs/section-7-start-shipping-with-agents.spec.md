# StartShippingWithAgents Specification

## Overview
- **Target file:** `src/components/StartShippingWithAgents.ts`
- **Source selector:** `#home-agent-cta`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 content-section 视图：Start shipping with agents
- **Parent:** root
- **Dependencies:** None

## DOM Structure
- Preserve the source subtree rooted at `#home-agent-cta`.

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
- click: div.flex.flex-col.gap-\5b var\28 --space-xl\29 \5d  > div:nth-child(2) > a:nth-child(1)
- click: div.flex.flex-col.gap-\5b var\28 --space-xl\29 \5d  > div:nth-child(2) > a:nth-child(2)

## Per-State Content
- Covers: `click|div.flex.flex-col.gap-\5b var\28 --space-xl\29 \5d  > div:nth-child(2) > a:nth-child(1)|semantic-control`
- Covers: `click|div.flex.flex-col.gap-\5b var\28 --space-xl\29 \5d  > div:nth-child(2) > a:nth-child(2)|semantic-control`

## Mutation Targets
N/A

## State Transitions
N/A

## Assets & Data
None

## Text Content (verbatim)
- Start shipping with agents

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
- Estimated lines: 95
- Budget: 150
- Status: READY
