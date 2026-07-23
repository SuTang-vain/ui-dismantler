# WorkCarouselControls Specification

## Overview
- **Target file:** `src/components/WorkCarouselControls.ts`
- **Source selector:** `div.ws-scroll-wrap`
- **Source instances:** 1
- **Interaction model:** combined
- **Responsibility:** 复现 carousel-controls 视图：‹ ›
- **Parent:** `panel-panel-works`
- **Dependencies:** `panel-panel-works`

## DOM Structure
- Preserve the source subtree rooted at `div.ws-scroll-wrap`.

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
- click: button.ws-prev → .work-item class.remove(is-center=is-center)
- click: button.ws-prev → .work-item class.add(is-center=is-center)
- click: button.ws-prev → .work-item class.add(is-prev-side=is-prev-side)
- click: button.ws-prev → .work-item class.add(is-next-side=is-next-side)
- click: button.ws-prev → .work-item class.add(is-prev-far=is-prev-far)
- click: button.ws-prev → .work-item class.add(is-next-far=is-next-far)
- click: button.ws-prev → .ws-dot class.toggle(is-active=is-active)
- click: button.ws-next → .work-item class.remove(is-center=is-center)
- click: button.ws-next → .work-item class.add(is-center=is-center)
- click: button.ws-next → .work-item class.add(is-prev-side=is-prev-side)
- click: button.ws-next → .work-item class.add(is-next-side=is-next-side)
- click: button.ws-next → .work-item class.add(is-prev-far=is-prev-far)

## Per-State Content
- Covers: `click|button.ws-prev|semantic-control`
- Covers: `click|button.ws-next|semantic-control`
- Covers: `click|.ws-dot|script-assignment`

## Mutation Targets
- Mutates: `.work-item`
- Mutates: `.ws-dot`
- Mutates: `.member-grid`
- Mutates: `.member`
- Mutates: `.avatar`
- Mutates: `.avatar-fallback`
- Mutates: `.photo-source`
- Mutates: `.member-info`
- Mutates: `.member-name`
- Mutates: `.member-role`
- Mutates: `.member-state`
- Mutates: `.carousel-prev`
- Mutates: `.carousel-next`
- Mutates: `.carousel-dots`

## State Transitions
- .work-item: class.remove `is-center` → `is-center`
- .work-item: class.add `is-center` → `is-center`
- .work-item: class.add `is-prev-side` → `is-prev-side`
- .work-item: class.add `is-next-side` → `is-next-side`
- .work-item: class.add `is-prev-far` → `is-prev-far`
- .work-item: class.add `is-next-far` → `is-next-far`
- .ws-dot: class.toggle `is-active` → `is-active`
- .member-grid: content.set `innerHTML` → ``
- .member: class.set `member` → `member`
- .member: attribute.set `role` → `listitem`
- .member: attribute.set `aria-pressed`
- .avatar: class.set `avatar` → `avatar`
- .avatar: attribute.set `aria-hidden` → `true`
- .avatar: structure.append
- .avatar-fallback: class.set `avatar-fallback` → `avatar-fallback`
- .avatar-fallback: content.set `textContent`
- .avatar: structure.append
- .photo-source: class.set `photo-source` → `photo-source`
- .photo-source: content.set `textContent`
- .avatar: structure.append
- .member-info: class.set `member-info` → `member-info`
- .member-name: class.set `member-name` → `member-name`
- .member-name: content.set `textContent`
- .member-info: structure.append
- .member-role: class.set `member-role` → `member-role`
- .member-role: content.set `textContent`
- .member-info: structure.append

## Assets & Data
- Data dependency: `wsCards`
- Data dependency: `WORKS_AUTO_INTERVAL`
- Data dependency: `memberList`
- Data contract: `memberList`
- Data contract: `wsCards`

## Text Content (verbatim)
- ‹ ›

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
- Estimated lines: 132
- Budget: 150
- Status: READY
