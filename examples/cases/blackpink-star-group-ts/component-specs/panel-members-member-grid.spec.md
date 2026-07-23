# MemberGrid Specification

## Overview
- **Target file:** `src/components/MemberGrid.ts`
- **Source selector:** `div.member-grid`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 member-grid 视图：Jisoo 百度百科 Jisoo · 金智秀 主唱 · 视觉 在团 Je Jennie · 金珍妮 主唱 · 说唱 · 视觉 在团 Rö Rosé · 朴彩英 主唱 · 领舞 在团 Li Lisa ·
- **Parent:** `panel-panel-members`
- **Dependencies:** `panel-panel-members`

## DOM Structure
- Preserve the source subtree rooted at `div.member-grid`.

## Computed Styles
- Token: `--ink`
- Token: `--muted`
- Token: `--subtle`
- Token: `--line`
- Token: `--paper`
- Token: `--stage`
- Token: `--primary`
- Token: `--accent`
- Token: `--accent-2`
- Token: `--soft`
- Token: `--soft-pink`
- Token: `rgba(30, 31, 36, 0.06)`
- Token: `rgba(23, 24, 28, 0.10)`
- Token: `#fff`
- Token: `rgba(100, 135, 250, 0.25)`
- Token: `#FAFAFB`
- Token: `rgba(0,0,0,0.75)`
- Token: `rgba(0,0,0,0.5)`
- Token: `rgba(255,255,255,0.85)`
- Token: `rgba(255,255,255,0.2)`
- Token: `#2A2B33`
- Token: `rgba(30,31,36,0.55)`
- Token: `#FBFBFD`
- Token: `#F5F7FC`

## States & Behaviors
- click: div.member-grid

## Per-State Content
- Covers: `click|div.member-grid|script-assignment`

## Mutation Targets
N/A

## State Transitions
N/A

## Assets & Data
None

## Text Content (verbatim)
- Jisoo 百度百科 Jisoo · 金智秀 主唱 · 视觉 在团 Je Jennie · 金珍妮 主唱 · 说唱 · 视觉 在团 Rö Rosé · 朴彩英 主唱 · 领舞 在团 Li Lisa · Lalisa 主舞 · 说唱 · 副唱 在团

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(max-width: 500px)`
- `(max-width: 320px), (max-height: 380px)`
- `(max-width: 500px)`
- `(max-width: 320px), (max-height: 380px)`

## Complexity Budget
- Estimated lines: 103
- Budget: 150
- Status: READY
