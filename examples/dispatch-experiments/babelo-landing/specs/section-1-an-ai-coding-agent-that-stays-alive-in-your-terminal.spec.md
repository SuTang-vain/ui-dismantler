# HeroProfile Specification

## Overview
- **Target file:** `src/components/HeroProfile.ts`
- **Source selector:** `section.hero`
- **Source instances:** 1
- **Interaction model:** combined
- **Responsibility:** 复现 hero-profile 视图：An AI coding agent that stays alive in your terminal
- **Parent:** root
- **Dependencies:** None

## DOM Structure
- Preserve the source subtree rooted at `section.hero`.

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
- click: #installChip > button:nth-child(4)
- click: div.hero-cta > a:nth-child(2)
- click: #installChip → #installChip class.add(copied=copied)
- click: #installChip → #installChip class.remove(copied=copied)

## Per-State Content
- Covers: `click|#installChip > button:nth-child(4)|semantic-control`
- Covers: `click|div.hero-cta > a:nth-child(2)|semantic-control`
- Covers: `click|#installChip|script-assignment`

## Mutation Targets
- Mutates: `#installChip`

## State Transitions
- #installChip: class.add `copied` → `copied`
- #installChip: class.remove `copied` → `copied`

## Assets & Data
- Data dependency: `a`

## Text Content (verbatim)
- An AI coding agent that stays alive in your terminal

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
- Estimated lines: 143
- Budget: 150
- Status: READY
