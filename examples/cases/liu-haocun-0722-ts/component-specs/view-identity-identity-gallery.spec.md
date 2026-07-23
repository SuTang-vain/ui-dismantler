# IdentityGallery Specification

## Overview
- **Target file:** `src/components/IdentityGallery.ts`
- **Source selector:** `#photoCard`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 identity-gallery 视图的结构、样式与状态
- **Parent:** `panel-view-identity`
- **Dependencies:** `panel-view-identity`

## DOM Structure
- Preserve the source subtree rooted at `#photoCard`.

## Computed Styles
- Token: `--primary`
- Token: `--primary-dark`
- Token: `--primary-soft`
- Token: `--bg`
- Token: `--card`
- Token: `--text`
- Token: `--sub`
- Token: `--weak`
- Token: `--line`
- Token: `--shadow`
- Token: `rgba(255, 213, 226, 0.72)`
- Token: `#f8faff`
- Token: `rgba(100, 135, 250, 0.14)`
- Token: `rgba(255, 213, 226, 0.6)`
- Token: `rgba(255, 255, 255, 0.82)`
- Token: `rgba(100, 135, 250, 0.28)`
- Token: `rgba(255, 255, 255, 0.96)`
- Token: `rgba(30, 31, 36, 0.84)`
- Token: `rgba(30, 31, 36, 0.48)`
- Token: `rgba(255, 255, 255, 0.2)`
- Token: `rgba(30, 31, 36, 0.42)`
- Token: `rgba(30, 31, 36, 0.04)`
- Token: `rgba(100, 135, 250, 0.1)`
- Token: `rgba(100, 135, 250, 0.18)`

## States & Behaviors
- click: .arrow → #view-identity content.set(innerHTML)

## Per-State Content
- Covers: `click|.arrow|script-assignment`

## Mutation Targets
- Mutates: `#view-identity`

## State Transitions
- #view-identity: content.set `innerHTML`

## Assets & Data
- Data dependency: `galleries`
- Data dependency: `tags`
- Data dependency: `facts`
- Data contract: `galleries`
- Data contract: `facts`
- Data contract: `tags`

## Text Content (verbatim)
None

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(prefers-reduced-motion: reduce)`
- `(prefers-reduced-motion: reduce)`

## Complexity Budget
- Estimated lines: 116
- Budget: 150
- Status: READY
