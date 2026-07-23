# StorySource Specification

## Overview
- **Target file:** `src/components/StorySource.ts`
- **Source selector:** `div.story-r`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 story-source 视图：出处原文（点高亮看注解） 民国·张爱玲《红玫瑰与白玫瑰》 娶红玫瑰，红成蚊子血，白为白月光；娶白玫瑰，白成饭粘子，红为朱砂痣。 未得之人纯白难忘，所得之人刻骨铭心。
- **Parent:** `panel-story`
- **Dependencies:** `panel-story`

## DOM Structure
- Preserve the source subtree rooted at `div.story-r`.

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
- click: div.text > span:nth-child(1) → #pt content.set(textContent)
- click: div.text > span:nth-child(1) → #pd content.set(textContent)
- click: div.text > span:nth-child(1) → #pop class.add(on=on)
- click: div.text > span:nth-child(2) → #pt content.set(textContent)
- click: div.text > span:nth-child(2) → #pd content.set(textContent)
- click: div.text > span:nth-child(2) → #pop class.add(on=on)

## Per-State Content
- Covers: `click|div.text > span:nth-child(1)|script-assignment`
- Covers: `click|div.text > span:nth-child(2)|script-assignment`

## Mutation Targets
- Mutates: `#pt`
- Mutates: `#pd`
- Mutates: `#pop`

## State Transitions
- #pt: content.set `textContent`
- #pd: content.set `textContent`
- #pop: class.add `on` → `on`

## Assets & Data
- Data dependency: `NOTE`

## Text Content (verbatim)
- 出处原文（点高亮看注解） 民国·张爱玲《红玫瑰与白玫瑰》 娶红玫瑰，红成蚊子血，白为白月光；娶白玫瑰，白成饭粘子，红为朱砂痣。 未得之人纯白难忘，所得之人刻骨铭心。

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
- Estimated lines: 106
- Budget: 150
- Status: READY
