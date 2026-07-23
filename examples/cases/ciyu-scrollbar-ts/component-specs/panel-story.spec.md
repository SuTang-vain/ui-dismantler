# StoryPanel Specification

## Overview
- **Target file:** `src/components/StoryPanel.ts`
- **Source selector:** `#story`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 story-panel 视图：词条典故 出处原文 词条典故渊源 源张氏小说独创意象文学概念诞生 张爱玲书中创设白月光、朱砂痣情感意象。 义双意象各有深意情愫对照阐释 白月光喻纯粹遗憾，朱砂痣喻刻骨深情。 传网络广泛传播走红成为流行
- **Parent:** `application-shell`
- **Dependencies:** `application-shell`

## DOM Structure
- Preserve the source subtree rooted at `#story`.

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
- click: #story > div:nth-child(1) > span:nth-child(1) → .ms class.toggle(on=on)
- click: #story > div:nth-child(1) > span:nth-child(2) → .ms class.toggle(on=on)

## Per-State Content
- Covers: `click|#story > div:nth-child(1) > span:nth-child(1)|script-assignment`
- Covers: `click|#story > div:nth-child(1) > span:nth-child(2)|script-assignment`

## Mutation Targets
- Mutates: `.ms`

## State Transitions
- .ms: class.toggle `on` → `on`

## Assets & Data
None

## Text Content (verbatim)
- 词条典故 出处原文 词条典故渊源 源张氏小说独创意象文学概念诞生 张爱玲书中创设白月光、朱砂痣情感意象。 义双意象各有深意情愫对照阐释 白月光喻纯粹遗憾，朱砂痣喻刻骨深情。 传网络广泛传播走红成为流行热词 经网络传唱普及，成为大众常用情感表述。 出处原文（点高亮看注解） 民国·张爱玲《红玫瑰与白玫瑰》 娶红玫瑰，红成蚊

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
- Estimated lines: 101
- Budget: 150
- Status: READY
