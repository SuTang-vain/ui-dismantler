# ApplicationShell Specification

## Overview
- **Target file:** `src/components/ApplicationShell.ts`
- **Source selector:** `#app`
- **Source instances:** 1
- **Interaction model:** static
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
- 初始渲染与源页面一致

## Per-State Content
N/A (static component)

## Assets & Data
- Data contract: `NODES`
- Data contract: `rels`
- Data contract: `QS`

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
- Estimated lines: 106
- Budget: 150
- Status: READY
