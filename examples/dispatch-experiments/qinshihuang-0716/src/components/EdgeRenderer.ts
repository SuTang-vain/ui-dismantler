import type { RelationshipLink, ShellElements } from "../types.js";
import type { GraphNodeController } from "./GraphNodeControl.js";
import type { GraphBounds } from "./GraphNodeGesture.js";
import { placeEdgeLabels, type EdgeSegment, type EdgeVisual } from "./EdgeLabelPlacement.js";

export interface EdgeRendererController {
  setLinks(links: RelationshipLink[]): void;
  update(): void;
  clear(): void;
  clearHighlight(): void;
  highlightRelated(key: string): Set<string>;
}

export function createEdgeRenderer(
  shell: ShellElements,
  getNodes: () => Map<string, GraphNodeController>,
  getScale: () => number,
  getBounds: () => GraphBounds,
): EdgeRendererController {
  let edges: Array<EdgeVisual & RelationshipLink> = [];
  const clear = (): void => { edges = []; shell.graphEdges.replaceChildren(); };
  const setLinks = (links: RelationshipLink[]): void => {
    clear(); const namespace = shell.graphEdges.namespaceURI;
    if (!namespace) throw new Error("graphEdges must be an SVG element");
    for (const link of links) {
      const path = document.createElementNS(namespace, "path") as SVGPathElement;
      path.setAttribute("class", `sg-edge sg-${link.type}`);
      let background: SVGRectElement | null = null; let text: SVGTextElement | null = null;
      if (link.label) {
        background = document.createElementNS(namespace, "rect") as SVGRectElement;
        background.setAttribute("class", "sg-edge-label-bg"); background.setAttribute("rx", "5");
        text = document.createElementNS(namespace, "text") as SVGTextElement;
        text.setAttribute("class", "sg-edge-label"); text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central"); text.textContent = link.label;
      }
      shell.graphEdges.append(path); if (background) shell.graphEdges.append(background); if (text) shell.graphEdges.append(text);
      edges.push({ ...link, path, background, text });
    }
  };
  const update = (): void => {
    const nodes = getNodes(); if (!nodes.size) return;
    const scale = getScale() || 1; const canvasRect = shell.graphCanvas.getBoundingClientRect();
    const segments: EdgeSegment[] = [];
    for (const edge of edges) {
      const first = nodes.get(edge.a)?.element.querySelector<HTMLElement>(".sg-avatar");
      const second = nodes.get(edge.b)?.element.querySelector<HTMLElement>(".sg-avatar");
      if (!first || !second) continue;
      const a = first.getBoundingClientRect(); const b = second.getBoundingClientRect();
      const ax = (a.left + a.width / 2 - canvasRect.left) / scale; const ay = (a.top + a.height / 2 - canvasRect.top) / scale;
      const bx = (b.left + b.width / 2 - canvasRect.left) / scale; const by = (b.top + b.height / 2 - canvasRect.top) / scale;
      const dx = bx - ax; const dy = by - ay; const distance = Math.hypot(dx, dy) || 1;
      const ux = dx / distance; const uy = dy / distance; const nx = -uy; const ny = ux;
      const x1 = ax + ux * (a.width / 2 / scale + 3); const y1 = ay + uy * (a.height / 2 / scale + 3);
      const x2 = bx - ux * (b.width / 2 / scale + 3); const y2 = by - uy * (b.height / 2 / scale + 3);
      edge.path.setAttribute("d", `M ${x1} ${y1} L ${x2} ${y2}`);
      segments.push({ edge, x1, y1, x2, y2, nx, ny });
    }
    placeEdgeLabels(segments, nodes, canvasRect, scale, getBounds());
  };
  const clearHighlight = (): void => {
    for (const edge of edges) {
      edge.path.classList.remove("sg-hl", "sg-dim"); edge.background?.classList.remove("sg-hl", "sg-dim"); edge.text?.classList.remove("sg-hl", "sg-dim");
    }
  };
  const highlightRelated = (key: string): Set<string> => {
    const related = new Set([key]);
    for (const edge of edges) { if (edge.a === key) related.add(edge.b); if (edge.b === key) related.add(edge.a); }
    for (const edge of edges) {
      const highlighted = edge.a === key || edge.b === key;
      edge.path.classList.toggle("sg-hl", highlighted); edge.path.classList.toggle("sg-dim", !highlighted);
      edge.background?.classList.toggle("sg-hl", highlighted); edge.background?.classList.toggle("sg-dim", !highlighted);
      edge.text?.classList.toggle("sg-hl", highlighted); edge.text?.classList.toggle("sg-dim", !highlighted);
    }
    return related;
  };
  return { setLinks, update, clear, clearHighlight, highlightRelated };
}
