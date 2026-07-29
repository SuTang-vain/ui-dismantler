import { matchRoute } from "./routes.js";
import { resolveGuard } from "./guards.js";

// Minimal behavior-only router shell. It intentionally does not render visual DOM.
export function createRouter({
  onRoute,
  isAllowed,
  initialState = {},
} = {}) {
  const notify = () => onRoute?.(window.location.pathname + window.location.search + window.location.hash, matchRoute(), initialState);
  const navigate = (target, state = {}) => {
    const next = resolveGuard(target, { isAllowed });
    const resolved = next ?? target;
    window.history.pushState({ ...state, route: resolved }, "", resolved);
    notify();
    return resolved;
  };
  const replace = (target, state = {}) => {
    const next = resolveGuard(target, { isAllowed });
    const resolved = next ?? target;
    window.history.replaceState({ ...state, route: resolved }, "", resolved);
    notify();
    return resolved;
  };
  const onPopState = () => notify();
  window.addEventListener("popstate", onPopState);
  notify();
  return {
    navigate,
    replace,
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    reload: () => window.location.reload(),
    dispose: () => window.removeEventListener("popstate", onPopState),
    capabilities: {
  "dynamicRoutes": false,
  "historyBack": false,
  "historyForward": false,
  "reload": true
},
  };
}
