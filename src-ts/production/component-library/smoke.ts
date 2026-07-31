import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import type { ComponentLibraryBuildPlan } from "./contract.js";

export interface ComponentLibraryRuntimeSmokeReport {
  readonly schemaVersion: "1.0";
  readonly kind: "component-library-runtime-smoke-report";
  readonly runtimePath: string;
  readonly hostSelector: string;
  readonly moduleLoaded: boolean;
  readonly mountCalled: boolean;
  readonly mountedNodeCount: number;
  readonly cleanupMethod: string | null;
  readonly activeTimers: number;
  readonly runtimeErrors: readonly string[];
  readonly consoleErrors: readonly string[];
  readonly missingLocalResources: readonly string[];
  readonly notices: readonly string[];
  readonly durationMs: number;
  readonly passed: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isLocalResource(value: string): boolean {
  return Boolean(value) && !/^(?:[a-z]+:|\/\/|#|data:|blob:)/i.test(value);
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export async function runComponentLibraryRuntimeSmoke(plan: ComponentLibraryBuildPlan, outputRoot: string): Promise<ComponentLibraryRuntimeSmokeReport> {
  const startedAt = performance.now();
  const runtimeErrors: string[] = [];
  const consoleErrors: string[] = [];
  const notices: string[] = [];
  const missingLocalResources: string[] = [];
  const runtimePath = resolve(outputRoot, plan.smoke.runtimePath);
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => runtimeErrors.push(errorMessage(error)));
  const dom = new JSDOM(`<!doctype html><html><body><div id="mount"></div></body></html>`, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "http://ui-dismantler.local/",
    virtualConsole,
  });
  const window = dom.window;
  const activeTimers = new Set<number>();
  const originalSetTimeout = window.setTimeout.bind(window);
  const originalClearTimeout = window.clearTimeout.bind(window);
  const originalSetInterval = window.setInterval.bind(window);
  const originalClearInterval = window.clearInterval.bind(window);
  window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]): number => {
    let id = 0;
    id = originalSetTimeout((...callbackArgs: unknown[]) => {
      activeTimers.delete(id);
      if (typeof handler === "function") handler(...callbackArgs);
      else window.eval(handler);
    }, timeout, ...args);
    activeTimers.add(id);
    return id;
  }) as typeof window.setTimeout;
  window.clearTimeout = ((id?: number) => { if (id !== undefined) activeTimers.delete(id); originalClearTimeout(id); }) as typeof window.clearTimeout;
  window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]): number => {
    const id = originalSetInterval(handler, timeout, ...args);
    activeTimers.add(id);
    return id;
  }) as typeof window.setInterval;
  window.clearInterval = ((id?: number) => { if (id !== undefined) activeTimers.delete(id); originalClearInterval(id); }) as typeof window.clearInterval;
  const originalConsoleError = window.console.error.bind(window.console);
  window.console.error = (...args: unknown[]) => { consoleErrors.push(args.map(String).join(" ")); originalConsoleError(...args); };
  window.addEventListener("error", (event) => runtimeErrors.push(event.error ? errorMessage(event.error) : event.message));
  let moduleLoaded = false;
  let mountCalled = false;
  let mountedNodeCount = 0;
  let cleanupMethod: string | null = null;
  try {
    const runtime = await readFile(runtimePath, "utf8");
    window.eval(runtime);
    moduleLoaded = true;
    const namespace = (window as unknown as Record<string, unknown>)[plan.smoke.globalName] as Record<string, unknown> | undefined;
    if (!namespace) throw new Error(`runtime global ${plan.smoke.globalName} was not created`);
    const mount = namespace[plan.smoke.mountMethod];
    if (typeof mount !== "function") throw new Error(`runtime method ${plan.smoke.globalName}.${plan.smoke.mountMethod} is not callable`);
    const host = window.document.querySelector(plan.smoke.hostSelector);
    if (!(host instanceof window.Element)) throw new Error(`smoke host was not found: ${plan.smoke.hostSelector}`);
    const instance = (mount as (host: Element, options: unknown) => unknown).call(namespace, host, plan.smoke.options);
    mountCalled = true;
    if ((plan.smoke as { settleMs?: number }).settleMs) await new Promise((resolveWait) => originalSetTimeout(resolveWait, Math.min((plan.smoke as { settleMs?: number }).settleMs!, 1000)));
    mountedNodeCount = host.querySelectorAll("*").length;
    if (mountedNodeCount === 0) runtimeErrors.push("mount completed without rendering any descendant nodes");
    if (instance && typeof instance === "object") {
      const record = instance as Record<string, unknown>;
      for (const method of ["unmount", "destroy", "dispose"]) {
        if (typeof record[method] !== "function") continue;
        (record[method] as () => void).call(instance);
        cleanupMethod = method;
        break;
      }
    }
    if (plan.smoke.cleanupRequired && !cleanupMethod) runtimeErrors.push("runtime cleanup is required but no unmount/destroy/dispose method was returned");
    for (const element of [...host.querySelectorAll("[src], [href]")]) {
      const value = element.getAttribute("src") ?? element.getAttribute("href") ?? "";
      if (!isLocalResource(value)) continue;
      const normalized = value.replace(/^\.\//, "");
      if (!await exists(resolve(outputRoot, normalized))) missingLocalResources.push(value);
    }
  } catch (error) {
    runtimeErrors.push(errorMessage(error));
  } finally {
    for (const id of [...activeTimers]) {
      originalClearTimeout(id);
      originalClearInterval(id);
    }
    if (activeTimers.size > 0) notices.push(`${activeTimers.size} active timer(s) were force-cleared after smoke execution`);
    window.close();
  }
  const passed = moduleLoaded
    && mountCalled
    && mountedNodeCount > 0
    && runtimeErrors.length === 0
    && consoleErrors.length === 0
    && missingLocalResources.length === 0
    && (!plan.smoke.cleanupRequired || cleanupMethod !== null)
    && activeTimers.size === 0;
  return {
    schemaVersion: "1.0",
    kind: "component-library-runtime-smoke-report",
    runtimePath: plan.smoke.runtimePath,
    hostSelector: plan.smoke.hostSelector,
    moduleLoaded,
    mountCalled,
    mountedNodeCount,
    cleanupMethod,
    activeTimers: activeTimers.size,
    runtimeErrors,
    consoleErrors,
    missingLocalResources,
    notices,
    durationMs: Number((performance.now() - startedAt).toFixed(3)),
    passed,
  };
}
