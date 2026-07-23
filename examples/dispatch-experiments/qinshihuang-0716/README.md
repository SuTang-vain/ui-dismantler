# Qinshihuang dispatch experiment

Goal: verify that the TypeScript planning pipeline can dispatch a high-fidelity implementation while keeping every component within the unchanged 150-line budget.

The experiment intentionally reuses the already verified CSS and assets. JavaScript DOM construction, state transitions, event navigation, graph interaction, drag behavior, SVG layout/rendering, label placement, animation synchronization, and modal behavior are implemented in TypeScript components.

The corrected plan contains ten components, including `GraphLayout`, `EdgeRenderer`, `EdgeLabelPlacement`, and `GraphAnimationLoop`. Run `./verify.sh` to rebuild the classic browser bundle and execute the full Gold+ gate.
