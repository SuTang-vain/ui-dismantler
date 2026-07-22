# StoryOrigins Specification

## Overview
- **Target file:** `src/components/StoryOrigins.ts`
- **Source selector:** `div.story-l`
- **Source instances:** 1
- **Interaction model:** static
- **Responsibility:** 复现 story-origins 视图：词条典故渊源 源张氏小说独创意象文学概念诞生 张爱玲书中创设白月光、朱砂痣情感意象。 义双意象各有深意情愫对照阐释 白月光喻纯粹遗憾，朱砂痣喻刻骨深情。 传网络广泛传播走红成为流行热词 经网络传唱普及
- **Parent:** `panel-story`
- **Dependencies:** `panel-story`

## DOM Structure
- Preserve the source subtree rooted at `div.story-l`.

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
- 词条典故渊源 源张氏小说独创意象文学概念诞生 张爱玲书中创设白月光、朱砂痣情感意象。 义双意象各有深意情愫对照阐释 白月光喻纯粹遗憾，朱砂痣喻刻骨深情。 传网络广泛传播走红成为流行热词 经网络传唱普及，成为大众常用情感表述。

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
- Estimated lines: 105
- Budget: 150
- Status: READY
