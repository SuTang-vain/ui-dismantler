# MemberCarouselControls Specification

## Overview
- **Target file:** `src/components/MemberCarouselControls.ts`
- **Source selector:** `div.member-stage`
- **Source instances:** 1
- **Interaction model:** combined
- **Responsibility:** 复现 carousel-controls 视图：Jisoo 百度百科 Jisoo · 金智秀 主唱 · 视觉 在团 Je Jennie · 金珍妮 主唱 · 说唱 · 视觉 在团 Rö Rosé · 朴彩英 主唱 · 领舞 在团 Li Lisa ·
- **Parent:** `panel-panel-members`
- **Dependencies:** `panel-panel-members`

## DOM Structure
- Preserve the source subtree rooted at `div.member-stage`.

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
- click: button.carousel-prev → .member-grid content.set(innerHTML=)
- click: button.carousel-prev → .member class.set(member=member)
- click: button.carousel-prev → .member attribute.set(role=listitem)
- click: button.carousel-prev → .member attribute.set(aria-pressed)
- click: button.carousel-prev → .avatar class.set(avatar=avatar)
- click: button.carousel-prev → .avatar attribute.set(aria-hidden=true)
- click: button.carousel-prev → .avatar structure.append
- click: button.carousel-prev → .avatar-fallback class.set(avatar-fallback=avatar-fallback)
- click: button.carousel-prev → .avatar-fallback content.set(textContent)
- click: button.carousel-prev → .photo-source class.set(photo-source=photo-source)
- click: button.carousel-prev → .photo-source content.set(textContent)
- click: button.carousel-prev → .member-info class.set(member-info=member-info)

## Per-State Content
- Covers: `click|button.carousel-prev|semantic-control`
- Covers: `click|button.carousel-next|semantic-control`
- Covers: `click|div.member-stage|script-assignment`
- Covers: `touchstart|div.member-stage|script-assignment`
- Covers: `click|div.carousel-dots|script-assignment`

## Mutation Targets
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
- Mutates: `.ws-dot`

## State Transitions
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
- Data dependency: `memberList`
- Data contract: `memberList`

## Text Content (verbatim)
- Jisoo 百度百科 Jisoo · 金智秀 主唱 · 视觉 在团 Je Jennie · 金珍妮 主唱 · 说唱 · 视觉 在团 Rö Rosé · 朴彩英 主唱 · 领舞 在团 Li Lisa · Lalisa 主舞 · 说唱 · 副唱 在团 ‹ ›

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
- Estimated lines: 147
- Budget: 150
- Status: READY
