# X Launch Copy — English

## Recommended main post

> DOM equivalence is not visual equivalence.
>
> I’m building a source-aware system that migrates existing HTML/CSS/JS into TypeScript components, then verifies DOM, styles, pixels, interactions, resources, and 4 responsive viewports.
>
> Research preview ↓

**Recommended media:** `assets/01-reference-vs-generated.mp4`

## Alternative metric-led main post

> I’m researching execution-grounded web UI migration: existing HTML/CSS/JS → TypeScript components, verified in the browser.
>
> Latest case:
> • 4/4 viewports
> • 6/6 scenarios
> • 12/12 state interactions
> • selector coverage 1.0
> • 0 runtime/stability failures
>
> Early preview.

## Thread

### 1/7 — The evaluation failure

> The project started from a failure: DOM roundtrip reported 1.0 and every old check was green, while the generated page still had a 15.2% pixel difference.
>
> The DOM was similar. The rendered behavior was not.

**Media:** before/after failure image with `DOM 1.0 ≠ visual fidelity`.

### 2/7 — The task definition

> This is not screenshot-only code generation.
>
> The system receives the existing HTML, CSS, JavaScript, and assets, then migrates them into a reusable TypeScript component library while preserving execution behavior.

### 3/7 — The pipeline

> Current pipeline:
>
> DOM + CSS + JS AST analysis
> → responsibility-aware component planning
> → TypeScript translation
> → executable quality gates
> → targeted repair and regression

**Media:** architecture diagram.

### 4/7 — Why responsibility matters

> Not every event needs the same test.
>
> Latest case: 42 responsibilities
> • 11 user actions
> • 1 gesture protocol
> • 20 navigation actions
> • 6 no-op controls
> • 4 lifecycle responsibilities
>
> 12 state-bearing interactions: 12/12 verified, 0 manual waivers.

### 5/7 — What is actually verified

> The quality gate checks more than screenshots:
>
> • DOM and text
> • runtime selector coverage
> • computed styles
> • pixel differences
> • 4 responsive viewports
> • formal interaction states
> • network/resources/fonts
> • DOM/layout/timer stability
> • runtime errors

### 6/7 — Current result and limitations

> Latest representative case:
>
> • validation 10/10
> • overall 0.9941
> • worst critical style 0.9857
> • worst critical pixel diff 0.0063
> • 0 runtime/resource/stability failures
>
> Small suite. Canvas, WebGL, media, drag/drop, and Shadow DOM remain open.

### 7/7 — Call for adversarial cases

> What webpage would break this system?
>
> I’m looking for public, redistributable test cases with:
> • Canvas/WebGL
> • heavy SVG filters/masks
> • drag and drop
> • audio/video timelines
> • virtual lists
> • Shadow DOM
> • streaming UI
>
> Research preview—feedback and collaborators welcome.

## Short repost copy

> The interesting part is not generating TypeScript. It is proving that the migrated UI still behaves and renders like the original across viewports and interactions.

## Reply when asked for the repository

> I’m freezing the first reproducible Research Preview version now. I’ll share the repository/demo link after the current commit, three-run baseline, and public-asset audit are complete.

## Reply when asked “Is this screenshot-to-code?”

> No. The existing source is available as input. The research problem is source-aware migration: understanding and componentizing an existing implementation while preserving visual, responsive, interaction, resource, and runtime behavior.
