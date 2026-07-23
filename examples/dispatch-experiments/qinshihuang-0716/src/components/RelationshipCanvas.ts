import type { EventRecord, GraphController, ModalController, RelationshipLink, ShellElements } from "../types.js";
import { createEdgeRenderer } from "./EdgeRenderer.js";
import { createGraphAnimationLoop } from "./GraphAnimationLoop.js";
import { createGraphLayout } from "./GraphLayout.js";
import { createGraphNodeControl, type GraphNodeController } from "./GraphNodeControl.js";
import { attachGraphNodeGesture, type GraphNodeGestureController } from "./GraphNodeGesture.js";

export function createRelationshipCanvas(shell: ShellElements, modal: ModalController): GraphController {
  let event: EventRecord | null = null;
  let nodes = new Map<string, GraphNodeController>();
  let gestures: GraphNodeGestureController[] = [];
  let resizeTimer: number | null = null;
  let hintDismissed = false;
  const layout = createGraphLayout(shell);
  const edges = createEdgeRenderer(shell, () => nodes, layout.getScale, layout.getBounds);
  const animation = createGraphAnimationLoop(edges.update);

  const currentEdges = (): RelationshipLink[] => {
    if (!event?.people.length) return [];
    const core = event.people[0].name;
    return [
      ...event.people.slice(1).map((person) => ({ a: core, b: person.name, type: person.rel ?? "ally", label: "" })),
      ...event.links,
    ];
  };
  const clearHighlight = (): void => {
    nodes.forEach((node) => node.setHighlight(false, false));
    edges.clearHighlight();
  };
  const highlightRelated = (key: string): void => {
    const related = edges.highlightRelated(key);
    nodes.forEach((node, name) => node.setHighlight(name === key, !related.has(name)));
  };
  const clearGraph = (): void => {
    gestures.forEach((gesture) => gesture.destroy()); gestures = [];
    nodes.forEach((node) => node.destroy()); nodes = new Map(); edges.clear();
  };
  const createNodes = (nextEvent: EventRecord): void => {
    const positions = layout.compute(nextEvent); const bounds = layout.getBounds();
    for (const person of nextEvent.people) {
      const node = createGraphNodeControl({
        host: shell.graphCanvas,
        person,
        position: positions.get(person.name) ?? { x: bounds.w / 2, y: bounds.h / 2 },
        modal,
        onHover: (key) => { if (!shell.modalOverlay.classList.contains("sg-active")) highlightRelated(key); },
        onLeave: () => { if (!shell.modalOverlay.classList.contains("sg-active")) clearHighlight(); },
        onSelect: highlightRelated,
      });
      nodes.set(person.name, node);
      gestures.push(attachGraphNodeGesture({
        element: node.element,
        getPosition: node.getPosition,
        setPosition: node.moveTo,
        getBounds: layout.getBounds,
        getScale: layout.getScale,
        onMove: edges.update,
      }));
    }
  };
  const render = (nextEvent: EventRecord): void => {
    event = nextEvent; clearGraph(); createNodes(nextEvent); edges.setLinks(currentEdges()); edges.update();
    nodes.forEach((node) => { node.inner.style.animationPlayState = "running"; });
    animation.start();
  };
  const relayout = (): void => {
    if (!event) return;
    const positions = layout.compute(event);
    nodes.forEach((node, key) => { const point = positions.get(key); if (point) node.moveTo(point); });
    edges.update();
  };
  const dismissHint = (): void => {
    if (hintDismissed) return; hintDismissed = true; shell.graphHint.classList.add("sg-hide");
  };
  const onResize = (): void => {
    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(relayout, 150);
  };
  const modalObserver = new MutationObserver(() => {
    if (!shell.modalOverlay.classList.contains("sg-active")) clearHighlight();
  });
  shell.graphWrap.addEventListener("pointerdown", dismissHint, { passive: true });
  window.addEventListener("resize", onResize);
  modalObserver.observe(shell.modalOverlay, { attributes: true, attributeFilter: ["class"] });

  return {
    render,
    relayout,
    destroy() {
      shell.graphWrap.removeEventListener("pointerdown", dismissHint);
      window.removeEventListener("resize", onResize);
      modalObserver.disconnect();
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      animation.stop(); clearGraph();
    },
  };
}
