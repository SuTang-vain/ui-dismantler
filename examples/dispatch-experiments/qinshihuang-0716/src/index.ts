import { createApplicationShell, renderEventIntro } from "./components/ApplicationShell.js";
import { createEventControls } from "./components/EventControls.js";
import { createRelationshipCanvas } from "./components/RelationshipCanvas.js";
import { createModalDialog } from "./components/ModaloverlayDialog.js";
import type { EventRecord } from "./types.js";

declare global {
  interface Window {
    QinShihuangDispatch: { mount: typeof mount; create: typeof create };
  }
}

export interface MountOptions {
  events?: EventRecord[];
}

export interface MountedApplication {
  destroy(): void;
}

const BASE_SMALL = { w: 380, h: 456 };
const BASE_LARGE = { w: 788, h: 492 };

function shouldUseSmallBase(width: number, height: number): boolean {
  const ratio = width / height;
  return width < 415 || height < 456 || (width <= 768 && ratio < 1);
}

export function mount(root: HTMLElement, options: MountOptions = {}): MountedApplication {
  if (!root) throw new Error("mount root is required");
  const shell = createApplicationShell(root);
  const dialogContract = 'role="dialog" aria-modal="true"';
  if (shell.modalOverlay.getAttribute("role") !== "dialog" || shell.modalOverlay.getAttribute("aria-modal") !== "true") {
    throw new Error(`missing ${dialogContract}`);
  }
  const events = options.events ?? JSON.parse(document.getElementById("sg-event-data")?.textContent || "[]") as EventRecord[];
  if (!events.length) throw new Error("event data is required");

  let currentIndex = 0;
  let destroyed = false;
  let initialized = false;
  let scaleFactor = 1;

  const applyScale = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const base = shouldUseSmallBase(width, height) ? BASE_SMALL : BASE_LARGE;
    const scale = Math.min(width / base.w, height / base.h);
    scaleFactor = scale;
    const offsetX = (width - base.w * scale) / 2;
    const offsetY = (height - base.h * scale) / 2;
    document.documentElement.classList.add("sg-is-scaled-canvas");
    root.classList.add("sg-is-scaled-canvas");
    shell.app.classList.add("sg-is-scaled");
    shell.app.classList.toggle("sg-is-small-canvas", base === BASE_SMALL);
    shell.app.classList.toggle("sg-is-large-canvas", base === BASE_LARGE);
    shell.app.classList.toggle("sg-is-tiny-canvas", width <= 330 || height <= 380);
    shell.app.style.width = `${base.w}px`;
    shell.app.style.height = `${base.h}px`;
    shell.app.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    shell.app.dataset.scaleFactor = String(scaleFactor);
  };

  applyScale();
  const modal = createModalDialog(shell);
  const graph = createRelationshipCanvas(shell, modal);

  const render = (index: number): void => {
    currentIndex = Math.max(0, Math.min(index, events.length - 1));
    modal.close();
    renderEventIntro(shell, events[currentIndex]);
    controls.render(currentIndex);
    graph.render(events[currentIndex]);
    requestAnimationFrame(() => graph.relayout());
  };

  const controls = createEventControls(shell, events, (index) => render(index));

  const preload = (): void => {
    const sources = new Set<string>();
    for (const event of events) {
      if (event.image) sources.add(`../assets/${event.image}`);
      for (const person of event.people) if (person.avatar) sources.add(`../assets/${person.avatar}`);
    }
    for (const src of sources) {
      const image = new Image();
      image.src = src;
    }
  };

  const initialize = (): void => {
    if (destroyed || initialized) return;
    initialized = true;
    applyScale();
    render(currentIndex);
    preload();
    window.setTimeout(() => shell.graphHint.classList.add("sg-hide"), 6000);
  };

  const onResize = (): void => {
    applyScale();
    graph.relayout();
  };

  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  document.addEventListener("DOMContentLoaded", applyScale);
  window.addEventListener("load", applyScale);
  if (document.readyState === "loading") window.addEventListener("load", initialize, { once: true });
  else initialize();

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      document.removeEventListener("DOMContentLoaded", applyScale);
      window.removeEventListener("load", applyScale);
      controls.destroy();
      graph.destroy();
      modal.destroy();
      root.replaceChildren();
    },
  };
}

export function create(options: MountOptions = {}): HTMLElement {
  const root = document.createElement("div");
  mount(root, options);
  return root;
}

if (typeof window !== "undefined") {
  window.QinShihuangDispatch = { mount, create };
}
