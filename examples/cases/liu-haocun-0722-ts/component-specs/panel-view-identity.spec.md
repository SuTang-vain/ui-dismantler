# IdentityPanel Specification

## Overview
- **Target file:** `src/components/IdentityPanel.ts`
- **Source selector:** `#view-identity`
- **Source instances:** 1
- **Interaction model:** static
- **Responsibility:** 复现 identity-panel 视图的结构、样式与状态
- **Parent:** `application-shell`
- **Dependencies:** `application-shell`

## DOM Structure
- Preserve the source subtree rooted at `#view-identity`.

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
- 初始渲染与源页面一致

## Per-State Content
N/A (static component)

## Mutation Targets
N/A

## State Transitions
N/A

## Assets & Data
None

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
- Estimated lines: 74
- Budget: 150
- Status: READY
