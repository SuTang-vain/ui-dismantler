# DefinitionDetails Specification

## Overview
- **Target file:** `src/components/DefinitionDetails.ts`
- **Source selector:** `div.home-r`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 definition-details 视图：核心信息 典型例句 核心信息 字面义月光皎洁，痣色赤红 引申义纯白遗憾，刻骨深情 出处摘要《红玫瑰与白玫瑰》 使用语境形容难忘的情感执念 详细释义指代心底纯粹遗憾与刻骨难忘的旧人。 典型例句 每个人心
- **Parent:** `panel-home`
- **Dependencies:** `panel-home`

## DOM Structure
- Preserve the source subtree rooted at `div.home-r`.

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
- click: div.home-r > div:nth-child(1) > span:nth-child(1) → .ms class.toggle(on=on)
- click: div.home-r > div:nth-child(1) > span:nth-child(2) → .ms class.toggle(on=on)

## Per-State Content
- Covers: `click|div.home-r > div:nth-child(1) > span:nth-child(1)|script-assignment`
- Covers: `click|div.home-r > div:nth-child(1) > span:nth-child(2)|script-assignment`

## Mutation Targets
- Mutates: `.ms`

## State Transitions
- .ms: class.toggle `on` → `on`

## Assets & Data
None

## Text Content (verbatim)
- 核心信息 典型例句 核心信息 字面义月光皎洁，痣色赤红 引申义纯白遗憾，刻骨深情 出处摘要《红玫瑰与白玫瑰》 使用语境形容难忘的情感执念 详细释义指代心底纯粹遗憾与刻骨难忘的旧人。 典型例句 每个人心中都有专属的白月光和朱砂痣。 近义词念念不忘 · 意难平 · 旧情难忘 反义词释怀放下 · 过往云烟 · 心如止水

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
