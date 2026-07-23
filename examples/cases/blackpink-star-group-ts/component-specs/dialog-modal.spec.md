# ModalDialog Specification

## Overview
- **Target file:** `src/components/ModalDialog.ts`
- **Source selector:** `#modal`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 dialog 视图：× 资料与说明 本卡片仅使用可核实的公开事实,具体年代、关系以官方与权威来源为准。 词条类型韩国女子演唱组合 · 四人编制 经纪机构YG Entertainment(韩国) 出道日期2016 年 8
- **Parent:** `application-shell`
- **Dependencies:** `application-shell`

## DOM Structure
- Preserve the source subtree rooted at `#modal`.

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
- click: #modal-close → #modal class.remove(open=open)
- click: #modal-close → #modal property.set(hidden=true)
- click: #modal-close → #tab-more attribute.set(aria-selected=false)
- click: #modal-close → #tab-more attribute.set(aria-expanded=false)
- click: #modal → #modal class.remove(open=open)
- click: #modal → #modal property.set(hidden=true)
- click: #modal → #tab-more attribute.set(aria-selected=false)
- click: #modal → #tab-more attribute.set(aria-expanded=false)

## Per-State Content
- Covers: `click|#modal-close|semantic-control`
- Covers: `click|#modal|script-assignment`

## Mutation Targets
- Mutates: `#modal`
- Mutates: `#tab-more`

## State Transitions
- #modal: class.remove `open` → `open`
- #modal: property.set `hidden` → `true`
- #tab-more: attribute.set `aria-selected` → `false`
- #tab-more: attribute.set `aria-expanded` → `false`

## Assets & Data
None

## Text Content (verbatim)
- × 资料与说明 本卡片仅使用可核实的公开事实,具体年代、关系以官方与权威来源为准。 词条类型韩国女子演唱组合 · 四人编制 经纪机构YG Entertainment(韩国) 出道日期2016 年 8 月 8 日 当前成员Jisoo、Jennie、Rosé、Lisa — 均为出道成员 历任成员暂无退出成员;若以官方公告为

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
- Estimated lines: 105
- Budget: 150
- Status: READY
