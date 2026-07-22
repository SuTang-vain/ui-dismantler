# Graph1 Specification

## Overview
- **Target file:** `src/components/Graph1.ts`
- **Source selector:** `div.main`
- **Interaction model:** click-driven
- **Responsibility:** 复现 graph 视图：›协助坐骑师徒兄弟对立×

## DOM Structure
- Preserve the source subtree rooted at `div.main`.

## Computed Styles
- Token: `--primary`
- Token: `--primary-dark`
- Token: `--primary-light`
- Token: `--bg-white`
- Token: `--text-main`
- Token: `--text-sec`
- Token: `--shadow-sm`
- Token: `--gold`
- Token: `--red`
- Token: `--green`
- Token: `--pink`
- Token: `rgba(0,0,0,.08)`
- Token: `#eef1f8`
- Token: `rgba(100,135,250,.42)`
- Token: `#f5f8ff`
- Token: `#eaeff9`
- Token: `#dee6f4`
- Token: `#fff`
- Token: `rgba(100,135,250,.35)`
- Token: `#6487fa29`
- Token: `#6487fa42`
- Token: `#6487fa70`
- Token: `rgba(100,135,250,.28)`
- Token: `#6487fa24`

## States & Behaviors
- click: button.tab-btn.active
- click: button.tab-btn
- click: button.tab-btn
- click: #storyScrollHint
- click: #charClose
- click: #castModalClose
- click: #castModalOk
- click: event-listener

## Per-State Content
- Covers: `click|button.tab-btn.active|toggle`
- Covers: `click|button.tab-btn|toggle`
- Covers: `click|button.tab-btn|toggle`
- Covers: `click|#storyScrollHint|semantic-control`
- Covers: `click|#charClose|semantic-control`
- Covers: `click|#castModalClose|semantic-control`
- Covers: `click|#castModalOk|semantic-control`
- Covers: `click|event-listener|addEventListener("click"`
- Covers: `keydown|event-listener|addEventListener("keydown"`

## Assets & Data
- Data contract: `profileCloudTokens`
- Data contract: `t`
- Data contract: `r`
- Data contract: `sorted`

## Text Content (verbatim)
- ›协助坐骑师徒兄弟对立×

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(max-width:768px)`
- `(max-width:768px)`

## Complexity Budget
- Estimated lines: 332
- Budget: 150
- Status: SPLIT REQUIRED
