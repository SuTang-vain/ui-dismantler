// Generated guard skeleton. Guard intent is observed behavior and requires human approval.
export const guardRedirects = [];

export function resolveGuard(pathname, context = {}) {
  const guard = guardRedirects.find((candidate) => candidate.from === pathname);
  if (!guard) return null;
  if (typeof context.isAllowed === "function" && context.isAllowed(pathname)) return null;
  return guard.to;
}
