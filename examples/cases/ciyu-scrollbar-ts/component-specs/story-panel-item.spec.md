# StoryPanelItem Specification

## Overview
- **Target file:** `src/components/StoryPanelItem.ts`
- **Source selector:** `div.story-l > div:nth-child(2)`
- **Source instances:** 3
- **Interaction model:** static
- **Responsibility:** 复现 repeated-item 视图：源张氏小说独创意象文学概念诞生 张爱玲书中创设白月光、朱砂痣情感意象。
- **Parent:** `panel-story`
- **Dependencies:** `panel-story`

## DOM Structure
- Preserve the source subtree rooted at `div.story-l > div:nth-child(2)`.
- Reuse this component for all source instances:
- `div.story-l > div:nth-child(2)`
- `div.story-l > div:nth-child(3)`
- `div.story-l > div:nth-child(4)`

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

## Mutation Targets
N/A

## State Transitions
N/A

## Assets & Data
None

## Text Content (verbatim)
- 源张氏小说独创意象文学概念诞生 张爱玲书中创设白月光、朱砂痣情感意象。

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
- Estimated lines: 79
- Budget: 150
- Status: READY
