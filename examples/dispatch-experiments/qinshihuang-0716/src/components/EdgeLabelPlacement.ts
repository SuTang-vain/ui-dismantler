import type { GraphNodeController } from "./GraphNodeControl.js";
import type { GraphBounds } from "./GraphNodeGesture.js";

export interface EdgeVisual {
  a: string;
  b: string;
  path: SVGPathElement;
  background: SVGRectElement | null;
  text: SVGTextElement | null;
}

export interface EdgeSegment {
  edge: EdgeVisual;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  nx: number;
  ny: number;
}

interface RectObstacle { cx: number; cy: number; hw: number; hh: number }
const LABEL_HEIGHT = 16;

export function placeEdgeLabels(
  segments: EdgeSegment[],
  nodes: Map<string, GraphNodeController>,
  canvasRect: DOMRect,
  scale: number,
  bounds: GraphBounds,
): void {
  const circles: Array<{ x: number; y: number; r: number }> = [];
  const rectangles: RectObstacle[] = [];
  nodes.forEach((node) => {
    const avatar = node.element.querySelector<HTMLElement>(".sg-avatar"); if (!avatar) return;
    const avatarRect = avatar.getBoundingClientRect();
    circles.push({
      x: (avatarRect.left + avatarRect.width / 2 - canvasRect.left) / scale,
      y: (avatarRect.top + avatarRect.height / 2 - canvasRect.top) / scale,
      r: avatarRect.width / 2 / scale + (node.element.classList.contains("sg-big") ? 14 : 4),
    });
    for (const selector of [".sg-name", ".sg-role-chip"]) {
      const label = node.element.querySelector<HTMLElement>(selector); if (!label) continue;
      const rect = label.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) continue;
      rectangles.push({
        cx: (rect.left + rect.width / 2 - canvasRect.left) / scale,
        cy: (rect.top + rect.height / 2 - canvasRect.top) / scale,
        hw: rect.width / 2 / scale + 2, hh: rect.height / 2 / scale + 2,
      });
    }
  });
  const placed: RectObstacle[] = [];
  const clearance = (cx: number, cy: number, hw: number, hh: number): number => {
    let minimum = Number.POSITIVE_INFINITY;
    for (const circle of circles) {
      const dx = Math.abs(cx - circle.x) - hw; const dy = Math.abs(cy - circle.y) - hh;
      const gap = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - circle.r;
      minimum = Math.min(minimum, dx < 0 && dy < 0 ? -(circle.r + Math.min(hw + dx, hh + dy)) : gap);
    }
    const rectGap = (rect: RectObstacle): number => Math.max(
      Math.abs(cx - rect.cx) - (hw + rect.hw), Math.abs(cy - rect.cy) - (hh + rect.hh),
    );
    for (const rect of rectangles) minimum = Math.min(minimum, rectGap(rect));
    for (const rect of placed) minimum = Math.min(minimum, rectGap(rect));
    return minimum;
  };
  for (const { edge, x1, y1, x2, y2, nx, ny } of segments) {
    if (!edge.text || !edge.background) continue;
    const measured = edge.text.getComputedTextLength();
    const width = (measured > 0 ? measured : (edge.text.textContent?.length ?? 0) * 10) + 10;
    const halfWidth = width / 2; const halfHeight = LABEL_HEIGHT / 2;
    const pointAt = (amount: number): [number, number] => [x1 + (x2 - x1) * amount, y1 + (y2 - y1) * amount];
    const anchor = pointAt(0.5);
    const sign = nx * (anchor[0] - bounds.w / 2) + ny * (anchor[1] - bounds.h / 2) >= 0 ? 1 : -1;
    const offsets = [0, 9 * sign, -9 * sign, 16 * sign, -16 * sign, 24 * sign, -24 * sign,
      32 * sign, -32 * sign, 42 * sign, -42 * sign, 54 * sign, -54 * sign];
    let best: { cx: number; cy: number; clearance: number } | null = null;
    search: for (const amount of [0.5, 0.58, 0.42, 0.66, 0.34, 0.72, 0.28]) {
      const [pointX, pointY] = pointAt(amount);
      for (const offset of offsets) {
        const cx = pointX + nx * offset; const cy = pointY + ny * offset;
        if (cx - halfWidth < 2 || cx + halfWidth > bounds.w - 2 || cy - halfHeight < 2 || cy + halfHeight > bounds.h - 2) continue;
        const candidateClearance = clearance(cx, cy, halfWidth, halfHeight);
        if (!best || candidateClearance > best.clearance) best = { cx, cy, clearance: candidateClearance };
        if (candidateClearance >= 1) break search;
      }
    }
    const hidden = !best || best.clearance < 0;
    edge.background.classList.toggle("sg-lbl-hide", hidden); edge.text.classList.toggle("sg-lbl-hide", hidden);
    if (!best || hidden) continue;
    placed.push({ cx: best.cx, cy: best.cy, hw: halfWidth, hh: halfHeight });
    edge.background.setAttribute("x", String(best.cx - halfWidth)); edge.background.setAttribute("y", String(best.cy - halfHeight));
    edge.background.setAttribute("width", String(width)); edge.background.setAttribute("height", String(LABEL_HEIGHT));
    edge.text.setAttribute("x", String(best.cx)); edge.text.setAttribute("y", String(best.cy));
  }
}
