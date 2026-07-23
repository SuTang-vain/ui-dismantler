import type { GraphPoint } from "./GraphNodeControl.js";

export const GRAPH_DRAG_THRESHOLD = 4;

export interface GraphBounds {
  w: number;
  h: number;
}

export interface GraphNodeGestureController {
  destroy(): void;
}

export interface GraphNodeGestureOptions {
  element: HTMLElement;
  getPosition(): GraphPoint;
  setPosition(point: GraphPoint): void;
  getBounds(): GraphBounds;
  getScale(): number;
  onMove(): void;
}

export function hasExceededGraphDragThreshold(dx: number, dy: number): boolean {
  return Math.abs(dx) + Math.abs(dy) > GRAPH_DRAG_THRESHOLD;
}

export function clampGraphPoint(point: GraphPoint, bounds: GraphBounds): GraphPoint {
  return {
    x: Math.max(24, Math.min(bounds.w - 24, point.x)),
    y: Math.max(24, Math.min(bounds.h - 24, point.y)),
  };
}

export function attachGraphNodeGesture(options: GraphNodeGestureOptions): GraphNodeGestureController {
  const { element } = options;
  let startX = 0;
  let startY = 0;
  let origin = options.getPosition();
  let moved = false;
  let active = false;

  const onMove = (clientX: number, clientY: number): void => {
    if (!active) return;
    const scale = options.getScale() || 1;
    const dx = (clientX - startX) / scale;
    const dy = (clientY - startY) / scale;
    if (hasExceededGraphDragThreshold(dx, dy)) moved = true;
    options.setPosition(clampGraphPoint({ x: origin.x + dx, y: origin.y + dy }, options.getBounds()));
    options.onMove();
  };

  const mouseMove = (event: MouseEvent): void => onMove(event.clientX, event.clientY);
  const touchMove = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (!touch) return;
    event.preventDefault();
    onMove(touch.clientX, touch.clientY);
  };
  const finish = (): void => {
    if (!active) return;
    active = false;
    element.classList.remove("sg-grabbing", "sg-dragging-now");
    if (moved) element.dataset.dragged = "1";
    document.removeEventListener("mousemove", mouseMove);
    document.removeEventListener("mouseup", finish);
    document.removeEventListener("touchmove", touchMove);
    document.removeEventListener("touchend", finish);
    document.removeEventListener("touchcancel", finish);
  };
  const start = (clientX: number, clientY: number): void => {
    finish();
    active = true;
    moved = false;
    startX = clientX;
    startY = clientY;
    origin = options.getPosition();
    element.classList.add("sg-grabbing", "sg-dragging-now");
    document.addEventListener("mousemove", mouseMove);
    document.addEventListener("mouseup", finish);
    document.addEventListener("touchmove", touchMove, { passive: false });
    document.addEventListener("touchend", finish);
    document.addEventListener("touchcancel", finish);
  };
  const mouseDown = (event: MouseEvent): void => {
    event.preventDefault();
    start(event.clientX, event.clientY);
  };
  const touchStart = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (touch) start(touch.clientX, touch.clientY);
  };

  element.addEventListener("mousedown", mouseDown);
  element.addEventListener("touchstart", touchStart, { passive: true });
  return {
    destroy() {
      finish();
      element.removeEventListener("mousedown", mouseDown);
      element.removeEventListener("touchstart", touchStart);
    },
  };
}
