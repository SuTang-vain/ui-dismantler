# QuizQuestion Specification

## Overview
- **Target file:** `src/components/QuizQuestion.ts`
- **Source selector:** `#qzbody`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 quiz-question 视图：下一题 →
- **Parent:** `panel-quiz`
- **Dependencies:** `panel-quiz`

## DOM Structure
- Preserve the source subtree rooted at `#qzbody`.

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
- click: #qznext → #qzbody style.set(display=flex)
- click: #qznext → #qzresult class.remove(on=on)
- click: #qznext → #qno content.set(textContent)
- click: #qznext → #qt content.set(textContent)
- click: #qznext → #qzfb content.set(textContent=)
- click: #qznext → #qznext class.remove(on=on)
- click: #qznext → #qznext content.set(textContent)
- click: #qznext → #opts content.set(innerHTML)
- click: #qznext → #opts .opt class.add(right=right)
- click: #qznext → #opts .opt class.add(wrong=wrong)
- click: #qznext → #qzfb content.set(textContent)
- click: #qznext → #score content.set(textContent)

## Per-State Content
- Covers: `click|#qznext|semantic-control`
- Covers: `click|#opts .opt|script-assignment`

## Mutation Targets
- Mutates: `#qzbody`
- Mutates: `#qzresult`
- Mutates: `#qno`
- Mutates: `#qt`
- Mutates: `#qzfb`
- Mutates: `#qznext`
- Mutates: `#opts`
- Mutates: `#opts .opt`
- Mutates: `#score`
- Mutates: `#barf`
- Mutates: `#rscore`
- Mutates: `#rbadge`

## State Transitions
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
- #qzbody: style.set `display` → `none`
- #rscore: content.set `textContent`
- #rbadge: content.set `textContent`
- #qzresult: class.add `on` → `on`

## Assets & Data
- Data dependency: `QS`
- Data contract: `QS`

## Text Content (verbatim)
- 下一题 →

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
- Estimated lines: 121
- Budget: 150
- Status: READY
