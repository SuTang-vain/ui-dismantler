# Vue XS Admin blind SPA responsibility regression

This case freezes structural evidence from `jsxiaosi/vue-xs-admin` at commit `99027d176d3c23643bd4c25ba00ec77d2b72bb56`.

Current verified boundary:

- `/mock_api/getRoute` admin response is materialized from reviewed static mock evidence.
- 33 nested route records resolve to Router-to-SFC ownership; unresolved route records remain zero.
- The external URL record resolves by exact route-name evidence rather than a case-specific path rule.
- A reproducible reference runtime uses Node `v22.23.0`, pnpm `9.0.0`, the frozen `pnpm-lock.yaml`, an isolated pnpm store, and offline quality execution after dependency installation.
- TypeScript `<script setup>` state analysis uses line-preserving structural syntax erasure when direct Acorn parsing fails.
- Imported local SFC components override colliding native tag names, so `<Form />` is owned by the imported login form while `<form>` remains native HTML.
- The reviewed visual plan covers `/login`, `/welcome`, `/nested/menu1/menu1-1`, and the real chart leaf `/echarts/bar`; `/echarts` remains a redirect-only parent.
- `generated-target-auto-v2-owned-tree` contains 50 route entries, 15 visual owners, 90 generated visual nodes, 3 initial state bindings, one materialized entry-global stylesheet, and reviewed ownership for 33 API route records, with zero model calls and zero manual edits.
- Generated Vue Router 4 history state now matches the reference shape for the reviewed `/login` reload contract. Strict navigation passes 1/1 with navigation integrity 1.0 and zero runtime, network, stability, or blocking-handle failures.
- The first three-viewport login visual baseline is intentionally retained as a failing pre-Gold diagnostic: computed style `0.7719`, pixel diff `0.047652`.
- The generic Element Plus primitive consumer, entry-global SCSS import graph, Sass `@/` alias resolution, `className` normalization, and utility-class materializer raise the reviewed Login matrix to computed style `1.0` and pixel diff `0.013631`; all three viewports now pass without manual target edits.
- The authentication graph now proves the `_storage` wrapper default (`localStorage`), prefix (`XsAdmin`), effective identity key (`XsAdmin_userInfo`), login success/role flow, `initRoute(role)`, `router.addRoute`, protected-route redirect, and deep-link route restoration as review-required structural contracts.

Not yet claimed:

- authenticated Strict equivalence for `/welcome`, `/nested/menu1/menu1-1`, or `/echarts/bar`;
- computed-style/pixel Gold+ for the remaining `/welcome`, `/nested/menu1/menu1-1`, and `/echarts/bar` states;
- full generated application coverage;
- Gold+ status.

The generated target contains no copied source runtime. Login Strict and the reviewed three-viewport Login visual matrix pass independently. Protected-route Strict testing remains blocked until the now-extracted authentication guard/setup proposal receives source-backed credential/fixture review and is consumed by auto-v2 rather than manually simulated.
