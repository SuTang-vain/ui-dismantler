# QuizResult Specification

## Overview
- **Target file:** `src/components/QuizResult.ts`
- **Source selector:** `#qzresult`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 quiz-result 视图：你的得分 出自张爱玲小说，代指心底遗憾与刻骨旧情。 再来一次
- **Parent:** `panel-quiz`
- **Dependencies:** `panel-quiz`

## DOM Structure
- Preserve the source subtree rooted at `#qzresult`.

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
- click: #again → #score content.set(textContent=0 / 5)
- click: #again → #barf style.set(width=0)
- click: #again → #qzbody style.set(display=flex)
- click: #again → #qzresult class.remove(on=on)
- click: #again → #qno content.set(textContent)
- click: #again → #qt content.set(textContent)
- click: #again → #qzfb content.set(textContent=)
- click: #again → #qznext class.remove(on=on)
- click: #again → #qznext content.set(textContent)
- click: #again → #opts content.set(innerHTML)
- click: #again → #opts .opt class.add(right=right)
- click: #again → #opts .opt class.add(wrong=wrong)

## Per-State Content
- Covers: `click|#again|semantic-control`

## Mutation Targets
- Mutates: `#score`
- Mutates: `#barf`
- Mutates: `#qzbody`
- Mutates: `#qzresult`
- Mutates: `#qno`
- Mutates: `#qt`
- Mutates: `#qzfb`
- Mutates: `#qznext`
- Mutates: `#opts`
- Mutates: `#opts .opt`

## State Transitions
- #score: content.set `textContent` → `0 / 5`
- #barf: style.set `width` → `0`
- #qzbody: style.set `display` → `flex`
- #qzresult: class.remove `on` → `on`
- #qno: content.set `textContent`
- #qt: content.set `textContent`
- #qzfb: content.set `textContent` → ``
- #qznext: class.remove `on` → `on`
- #qznext: content.set `textContent`
- #opts: content.set `innerHTML`
- #opts .opt: class.add `right` → `right`
- #opts .opt: class.add `wrong` → `wrong`
- #qzfb: content.set `textContent`
- #score: content.set `textContent`
- #barf: style.set `width`
- #qznext: class.add `on` → `on`

## Assets & Data
- Data dependency: `QS`
- Data contract: `QS`

## Text Content (verbatim)
- 你的得分 出自张爱玲小说，代指心底遗憾与刻骨旧情。 再来一次

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
- Estimated lines: 104
- Budget: 150
- Status: READY
