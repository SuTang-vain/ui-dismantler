# WatchASessioncycleThroughRealStates Specification

## Overview
- **Target file:** `src/components/WatchASessioncycleThroughRealStates.ts`
- **Source selector:** `#demo`
- **Source instances:** 1
- **Interaction model:** click-driven
- **Responsibility:** 复现 content-section 视图：Watch a sessioncycle through real states
- **Parent:** root
- **Dependencies:** None

## DOM Structure
- Preserve the source subtree rooted at `#demo`.

## Computed Styles
- Token: `--bg`
- Token: `--surface`
- Token: `--surface-2`
- Token: `--card`
- Token: `--text`
- Token: `--text-2`
- Token: `--text-3`
- Token: `--accent`
- Token: `--accent-soft`
- Token: `--accent-2`
- Token: `--c-red`
- Token: `--c-red-soft`
- Token: `--c-orange`
- Token: `--c-orange-soft`
- Token: `--c-purple`
- Token: `--c-purple-soft`
- Token: `--c-pink`
- Token: `--c-pink-soft`
- Token: `--grad-warm`
- Token: `--grad-warm-soft`
- Token: `--grad-text`
- Token: `--grad-band`
- Token: `--line`
- Token: `--line-2`

## States & Behaviors
- click: #demoPlay → span content.set(textContent=Running)
- click: #demoPlay → #demoPlay property.set(disabled=true)
- click: #demoPlay → #demoState attribute.set(data-state)
- click: #demoPlay → .lbl content.set(textContent)
- click: #demoPlay → .ln class.set
- click: #demoPlay → .ln content.set(innerHTML)
- click: #demoPlay → #demoTranscript structure.append
- click: #demoPlay → #demoTranscript property.set(scrollTop)
- click: #demoPlay → .typed content.set(textContent)
- click: #demoPlay → .c-stream content.set(textContent)
- click: #demoPlay → .c-stream content.set(innerHTML)
- click: #demoPlay → #demoTranscript content.set(innerHTML=)

## Per-State Content
- Covers: `click|#demoPlay|semantic-control`
- Covers: `click|#demoReset|semantic-control`

## Mutation Targets
- Mutates: `span`
- Mutates: `#demoPlay`
- Mutates: `#demoState`
- Mutates: `.lbl`
- Mutates: `.ln`
- Mutates: `#demoTranscript`
- Mutates: `.typed`
- Mutates: `.c-stream`

## State Transitions
- span: content.set `textContent` → `Running`
- #demoPlay: property.set `disabled` → `true`
- #demoState: attribute.set `data-state`
- .lbl: content.set `textContent`
- .ln: class.set
- .ln: content.set `innerHTML`
- #demoTranscript: structure.append
- #demoTranscript: property.set `scrollTop`
- .typed: content.set `textContent`
- .c-stream: content.set `textContent`
- .c-stream: content.set `innerHTML`
- #demoTranscript: content.set `innerHTML` → ``
- #demoPlay: property.set `disabled` → `false`
- span: content.set `textContent` → `Run`
- #demoPlay: property.set `disabled` → `false`
- span: content.set `textContent` → `Run`

## Assets & Data
None

## Text Content (verbatim)
- Watch a sessioncycle through real states

## Responsive Behavior
- desktop: must pass visual quality matrix
- tablet: must pass visual quality matrix
- mobile: must pass visual quality matrix
- tiny: must pass visual quality matrix

Source media queries:
- `(max-width:980px)`
- `(max-width:640px)`
- `(prefers-reduced-motion: reduce)`

## Complexity Budget
- Estimated lines: 116
- Budget: 150
- Status: READY
