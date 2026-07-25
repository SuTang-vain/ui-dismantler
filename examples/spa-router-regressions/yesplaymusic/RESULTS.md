# YesPlayMusic SPA Router regression — 2026-07-25

## Source

- Repository: `qier222/YesPlayMusic`
- Local clone: `/Users/<user>/DEV/Baidu/YesPlayMusic`
- Branch: `master`
- Commit: `df075cca247eab7bf8686155cb8cc9a1f4c7e271`
- Stack: Vue 2.6, Vue Router 3.4, Vuex 3, Vue CLI 4
- Router mode: web=`history`, Electron=`hash`

## Suitability

YesPlayMusic is a strong real-world SPA Router regression candidate. It has 19 named routes, dynamic route params, 24 router links, 22 programmatic `router.push` calls, `router.go` navigation, a login guard, lazy-loaded views, route-level keep-alive metadata, and history-mode deep links.

## Runtime setup

The project requires Node 14/16. It was run with Node 16.20.2 and Yarn 1.22.22. Dependencies were installed with lifecycle scripts disabled, followed by Electron's own install script because the Vue CLI Electron plugin imports Electron even for web serve.

The upstream source was not modified. Development serve used:

```text
vue-cli-service serve --host 127.0.0.1 --skip-plugins @vue/cli-plugin-eslint
```

The lint plugin was skipped only because the upstream `settings.vue` currently has four Prettier lint-on-save errors that otherwise block development compilation.

## Router matrix

| Scenario | Expected | Observed | Result |
|---|---|---|---|
| Click `发现` router-link | `/explore` | `/explore`, heading and active nav updated | PASS |
| Application back button | `/` | `/`, previous view restored | PASS |
| Search `周杰伦` + Enter | `/search/周杰伦` | encoded dynamic route, input retained | PASS |
| Click protected `音乐库` | `/login` | login guard redirected to `/login` | PASS |
| Direct `/settings` + reload | remain `/settings` | deep link rendered before and after reload | PASS |

Router contract result: **5/5 PASS**.

## Automated deterministic contract

The new TypeScript `spa-router` runner intercepts `/api/**` and returns reviewed fixtures for player bootstrap, explore data, and search data. It records `pushState`, `replaceState`, `popstate`, route target, and normalized history state before application scripts execute.

```text
[PASS] router-link-explore
[PASS] router-go-back
[PASS] dynamic-search-route
[PASS] login-guard-redirect
[PASS] history-deep-link-reload

SPA Router contract: PASS (5/5)
runtime errors: 0
unmocked API requests: 0
```

Vue Router adds a non-deterministic `history.state.key` on every navigation. The case explicitly declares `ignoredStateKeys: ["key"]`; no random field is ignored globally. After normalization, captured states are `{}` or `null`, while method and target remain strict.

Run with:

```text
node dist-ts/cli.js spa-router \
  examples/spa-router-regressions/yesplaymusic/contract.config.json \
  --out examples/spa-router-regressions/yesplaymusic/automated-results.json
```

## Reference/generated comparison runner

The same runner now also accepts `referenceBaseUrl` and `generatedBaseUrl`. It executes every reviewed scenario against both targets in separate BrowserContexts and compares:

- transition count and order;
- `pushState` / `replaceState` / `popstate` / `hashchange` method;
- normalized route target;
- normalized history state after the case-owned `ignoredStateKeys` exclusions;
- final pathname, search, and hash;
- per-target assertions, runtime errors, and unmocked API requests.

It emits independent `scenario-protocol`, `visual-runtime`, `resource-readiness`, and `navigation-integrity` gates. A synthetic negative regression proves that a generated-only history-state field fails `navigation-integrity` even when the visible route assertion still passes.

A same-target YesPlayMusic control run on July 25, 2026 produced:

```text
mode: reference-generated
contract scenarios: 5/5 PASS
reviewed route states: 3/3 PASS
visual viewport runs: 9/9 PASS
viewports: 1024x768, 768x1024, 390x844
worst computed style: 1.0
worst pixel diff: 0.0
navigation integrity: 14/14, rate 1.0
runtime errors: 0
unmocked API requests: 0
```

The reviewed route states are:

- explore after router-link navigation;
- login after the protected library-route guard;
- settings after deep-link reload.

Each state uses an explicit screenshot anchor and reviewed style targets (`nav`, `main`, and the route root). Reference, generated, and diff PNGs are stored under `visual-artifacts/<scenario>/<viewport>/`.

This control validates the dual-target execution and comparison mechanism on a real SPA. It is not a translation-fidelity claim because a dismantled YesPlayMusic target does not yet exist.

The formal `quality` workflow can now consume the same contract with `--spa-router <config.json>`. SPA runtime failures, unmocked API requests, and navigation mismatches are merged into the existing `visual-runtime`, `resource-readiness`, and `navigation-integrity` gates; `spa-router-contract` separately records reviewed scenario success. Telemetry records `spaRouterMs` and `spaRouterScenarios`.

## Remaining work for translation Gold+

The source SPA Router contract is now deterministic and dispatch-ready. Full translation Gold+ still requires:

1. run the same contract against the generated/dismantled application;
2. compare reference/generated transition sequences after the reviewed state-key normalization;
3. add desktop and mobile screenshot matrices for critical route states;
4. keep runtime, unmocked API, navigation, resource, and stability failures at zero.

Machine-readable files:

- `contract.config.json` — reviewed scenarios, API fixtures, and state normalization;
- `automated-results.json` — actual runtime transitions and assertions;
- `router-contract.json` — source inventory and readiness summary;
- `dual-control.config.json` — explicit same-target reference/generated mechanism control;
- `dual-control-results.json` — actual 5/5 contract plus 9/9 route-state viewport control output, not a translation-fidelity result;
- `visual-artifacts/` — reference/generated/diff screenshots for three reviewed route states across three viewports.
