# HeroProfile Specification

## Overview
- **Target file:** `src/components/HeroProfile.ts`
- **Source selector:** `#home-hero`
- **Source instances:** 1
- **Interaction model:** combined
- **Responsibility:** 复现 hero-profile 视图：From the terminal to the cloud, with any agent
- **Parent:** root
- **Dependencies:** None

## DOM Structure
- Preserve the source subtree rooted at `#home-hero`.

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
- click: a.self-stretch
- click: div.self-stretch > button:nth-child(2)
- click: #home-hero > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > a:nth-child(1)
- click: header.grid > div:nth-child(1) > div:nth-child(1) > button:nth-child(1)
- click: header.grid > div:nth-child(1) > div:nth-child(1) > button:nth-child(2)
- click: header.grid > div:nth-child(1) > div:nth-child(1) > button:nth-child(3)
- input: input.w-full
- click: div.h-10 > div:nth-child(2) > button:nth-child(1)
- click: div.space-y-1 > button:nth-child(1)
- click: button.story-reveal
- click: div.space-y-1 > button:nth-child(3)
- click: div.space-y-1 > button:nth-child(4)

## Per-State Content
- Covers: `click|a.self-stretch|semantic-control`
- Covers: `click|div.self-stretch > button:nth-child(2)|semantic-control`
- Covers: `click|#home-hero > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > a:nth-child(1)|semantic-control`
- Covers: `click|header.grid > div:nth-child(1) > div:nth-child(1) > button:nth-child(1)|semantic-control`
- Covers: `click|header.grid > div:nth-child(1) > div:nth-child(1) > button:nth-child(2)|semantic-control`
- Covers: `click|header.grid > div:nth-child(1) > div:nth-child(1) > button:nth-child(3)|semantic-control`
- Covers: `input|input.w-full|semantic-control`
- Covers: `click|div.h-10 > div:nth-child(2) > button:nth-child(1)|semantic-control`
- Covers: `click|div.space-y-1 > button:nth-child(1)|semantic-control`
- Covers: `click|button.story-reveal|semantic-control`
- Covers: `click|div.space-y-1 > button:nth-child(3)|semantic-control`
- Covers: `click|div.space-y-1 > button:nth-child(4)|semantic-control`
- Covers: `click|button.hover\3a bg-background\2f 35|semantic-control`
- Covers: `click|button.bg-primary|semantic-control`
- Covers: `click|div.mt-3 > div:nth-child(1) > button:nth-child(1)|semantic-control`
- Covers: `click|div.mt-3 > div:nth-child(2) > button:nth-child(1)|semantic-control`
- Covers: `click|div.mt-3 > button:nth-child(3)|semantic-control`
- Covers: `click|button.disabled\3a opacity-50|semantic-control`
- Covers: `click|div.shrink-0.absolute > button:nth-child(2)|semantic-control`
- Covers: `click|div.shrink-0.absolute > button:nth-child(3)|semantic-control`
- Covers: `click|div.shrink-0.absolute > button:nth-child(4)|semantic-control`
- Covers: `click|div.shrink-0.absolute > button:nth-child(5)|semantic-control`
- Covers: `click|div.shrink-0.absolute > button:nth-child(6)|semantic-control`
- Covers: `click|div.shrink-0.absolute > button:nth-child(7)|semantic-control`
- Covers: `click|div.shrink-0.absolute > button:nth-child(8)|semantic-control`
- Covers: `click|div.shrink-0.absolute > button:nth-child(9)|semantic-control`
- Covers: `click|button.size-\5b 34px\5d |semantic-control`

## Mutation Targets
N/A

## State Transitions
N/A

## Assets & Data
None

## Text Content (verbatim)
- From the terminal to the cloud, with any agent

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
- Estimated lines: 114
- Budget: 150
- Status: READY
