# DefinitionHero Specification

## Overview
- **Target file:** `src/components/DefinitionHero.ts`
- **Source selector:** `div.home-l`
- **Source instances:** 1
- **Interaction model:** static
- **Responsibility:** 复现 definition-hero 视图：白月光和朱砂痣 bai yue guang he zhu sha zhi 中性 文学意象 网络热词 喻指人生遗憾旧人，难忘的两种情愫。
- **Parent:** `panel-home`
- **Dependencies:** `panel-home`

## DOM Structure
- Preserve the source subtree rooted at `div.home-l`.

## Computed Styles
- Token: `--primary`
- Token: `--primary-d`
- Token: `--primary-l`
- Token: `--bg-white`
- Token: `--bg-gray`
- Token: `--t1`
- Token: `--t2`
- Token: `--t3`
- Token: `--line`
- Token: `--sd-md`
- Token: `--green`
- Token: `--orange`
- Token: `--red`
- Token: `--r-s`
- Token: `--r-m`
- Token: `--r-l`
- Token: `rgba(0,0,0,0.1)`
- Token: `#e9edf7`
- Token: `#f1f3f9`
- Token: `rgba(0,0,0,0.05)`
- Token: `rgba(0,0,0,0.04)`
- Token: `rgba(100,135,250,0.35)`
- Token: `#fff`
- Token: `rgba(100,135,250,0.38)`

## States & Behaviors
- 初始渲染与源页面一致

## Per-State Content
N/A (static component)

## Assets & Data
- Data contract: `NODES`
- Data contract: `rels`
- Data contract: `QS`

## Text Content (verbatim)
- 白月光和朱砂痣 bai yue guang he zhu sha zhi 中性 文学意象 网络热词 喻指人生遗憾旧人，难忘的两种情愫。

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(max-width:520px)`
- `(min-width:396px) and (max-width:520px)`
- `(max-width:330px)`

## Complexity Budget
- Estimated lines: 103
- Budget: 150
- Status: READY
