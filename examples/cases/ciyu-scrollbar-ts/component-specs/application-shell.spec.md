# ApplicationShell Specification

## Overview
- **Target file:** `src/components/ApplicationShell.ts`
- **Source selector:** `#app`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 app-shell 视图：基本释义 典故出处 关联词 测一测 白月光和朱砂痣 bai yue guang he zhu sha zhi 中性 文学意象 网络热词 喻指人生遗憾旧人，难忘的两种情愫。 核心信息 典型例句 核心信息
- **Parent:** root
- **Dependencies:** None

## DOM Structure
- Preserve the source subtree rooted at `#app`.

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
- click: #nav > span:nth-child(1) → .nav .n class.toggle(on=on)
- click: #nav > span:nth-child(1) → .panel class.toggle(on=on)
- click: #nav > span:nth-child(1) → .gnd structure.remove-node
- click: #nav > span:nth-child(1) → #lines content.set(innerHTML=)
- click: #nav > span:nth-child(1) → #lines structure.append
- click: #nav > span:nth-child(2) → .nav .n class.toggle(on=on)
- click: #nav > span:nth-child(2) → .panel class.toggle(on=on)
- click: #nav > span:nth-child(2) → .gnd structure.remove-node
- click: #nav > span:nth-child(2) → #lines content.set(innerHTML=)
- click: #nav > span:nth-child(2) → #lines structure.append
- click: #nav > span:nth-child(3) → .nav .n class.toggle(on=on)
- click: #nav > span:nth-child(3) → .panel class.toggle(on=on)

## Per-State Content
- Covers: `click|#nav > span:nth-child(1)|home`
- Covers: `click|#nav > span:nth-child(2)|story`
- Covers: `click|#nav > span:nth-child(3)|graph-p`
- Covers: `click|#nav > span:nth-child(4)|quiz`

## Mutation Targets
- Mutates: `.nav .n`
- Mutates: `.panel`
- Mutates: `.gnd`
- Mutates: `#lines`

## State Transitions
- .nav .n: class.toggle `on` → `on`
- .panel: class.toggle `on` → `on`
- .gnd: structure.remove-node
- #lines: content.set `innerHTML` → ``
- #lines: structure.append

## Assets & Data
- Data dependency: `CENTER`
- Data dependency: `NODES`
- Data dependency: `COLORS`
- Data contract: `NODES`

## Text Content (verbatim)
- 基本释义 典故出处 关联词 测一测 白月光和朱砂痣 bai yue guang he zhu sha zhi 中性 文学意象 网络热词 喻指人生遗憾旧人，难忘的两种情愫。 核心信息 典型例句 核心信息 字面义月光皎洁，痣色赤红 引申义纯白遗憾，刻骨深情 出处摘要《红玫瑰与白玫瑰》 使用语境形容难忘的情感执念 详细释义指

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
- Estimated lines: 108
- Budget: 150
- Status: READY
