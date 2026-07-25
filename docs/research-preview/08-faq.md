# Research Preview FAQ

## Is this screenshot-to-code?

No. The existing HTML, CSS, JavaScript, and assets are available as input. The task is source-aware migration: understanding and componentizing an existing implementation while preserving visual, responsive, interaction, resource, and runtime behavior.

## Why not just copy the original page?

Copying preserves the original monolith and its coupling. The project aims to produce a reusable TypeScript component library with explicit component boundaries, data contracts, interaction responsibilities, design tokens, responsive acceptance criteria, and complexity budgets.

## Does DOM match prove correctness?

No. The project previously observed DOM roundtrip = 1.0 while the rendered pixel difference was 15.2%. CSS selector mismatch, computed-style divergence, execution order, fonts, layout and transient state can all remain invisible to topology-only comparison.

## What does verified coverage = 1.0 mean?

In the current representative case, 42 responsibilities are retained as evidence. Twelve are state-bearing user/gesture interactions and all 12 are formally verified. Twenty navigation actions, six no-op controls and four lifecycle responsibilities are represented separately; they are not silently hidden through manual coverage waivers.

## Are all 42 interactions executed as independent screenshots?

No. That would overstate both coverage and cost. Equivalent controls can share a reviewed representative scenario, and only critical state scenarios enter the four-viewport visual matrix. Navigation, no-op and lifecycle responsibilities require different integrity checks.

## Is it fully autonomous?

Not yet. Analysis, planning, translation and validation are highly automated, but component boundaries, equivalence groups, scenario criticality and unusual browser protocols can still require review.

## Is the project SOTA?

No SOTA claim is made. The current evidence is based on a limited representative suite and the input contains the original source code, so results are not directly comparable to screenshot-only UI-to-Code benchmarks.

## What is the strongest current contribution?

The strongest part is the execution-grounded quality loop: runtime selector coverage, computed-style comparison, pixel matrices, formal interactions, resource/font handling, adaptive stability, responsibility-aware coverage and regression.

## What is not yet covered well?

Canvas, WebGL, audio/video timelines, complex drag/drop, Shadow DOM, cross-page navigation, downloads and streaming interfaces do not yet have enough formal regression coverage. SPA router transitions now have early formal contract coverage, limited to two reviewed dual-control cases.

## Why does a run take around a minute?

Most cost comes from real browser verification: loading reference/generated pages, four viewports, critical interaction matrices, stability checks, screenshots and pixel comparison. Static analysis and planning are comparatively small parts of total time.

## Can I send a page for testing?

Yes, if it is public and the source/assets can legally and safely be used for testing or redistribution. Preferred adversarial categories are Canvas/WebGL, SVG filters/masks, drag/drop, media timelines, virtual lists, Shadow DOM and streaming UI.

## Is the generated library offline reproducible?

Resource localization exists as a separate concern, but offline reproducibility should be reported independently from translation fidelity. A page can be faithfully translated while a remote third-party resource is temporarily unavailable.
