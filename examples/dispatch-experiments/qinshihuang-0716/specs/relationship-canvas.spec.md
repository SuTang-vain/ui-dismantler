# RelationshipCanvas Specification

## Overview
- **Target file:** `src/components/RelationshipCanvas.ts`
- **Source selector:** `#graphWrap`
- **Source instances:** 1
- **Interaction model:** time-driven
- **Responsibility:** 编排关系图节点、布局、边渲染、标签与同步生命周期，不内联各几何算法
- **Parent:** `application-shell`
- **Dependencies:** `application-shell`

## DOM Structure
- Preserve the source subtree rooted at `#graphWrap`.

## Computed Styles
- Token: `--primary`
- Token: `--primary-hover`
- Token: `--primary-light`
- Token: `--primary-tint`
- Token: `--bg-white`
- Token: `--bg-dent`
- Token: `--text-main`
- Token: `--text-minor`
- Token: `--text-tiny`
- Token: `--border-light`
- Token: `--shadow-sm`
- Token: `--shadow-md`
- Token: `--shadow-lg`
- Token: `--radius-xs`
- Token: `--radius-sm`
- Token: `--radius-md`
- Token: `--radius-lg`
- Token: `--rel-family`
- Token: `--rel-ruler`
- Token: `--rel-ally`
- Token: `--rel-enemy`
- Token: `--rel-plot`
- Token: `rgba(30, 31, 36, 0.06)`
- Token: `rgba(30, 31, 36, 0.12)`

## States & Behaviors
- pointerdown: #graphWrap → #graphHint class.add(hide=hide)

## Per-State Content
- Covers: `pointerdown|#graphWrap|script-assignment`

## Mutation Targets
- Mutates: `#graphHint`

## State Transitions
- #graphHint: class.add `hide` → `hide`

## Assets & Data
None

## Text Content (verbatim)
- 宗亲 君臣 同僚 对立 点击头像查看人物详情，可拖动

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(min-width: 769px)`
- `(max-width: 768px)`
- `(max-width: 768px)`
- `(max-width: 480px)`

## Complexity Budget
- Estimated lines: 114
- Budget: 150
- Status: READY
