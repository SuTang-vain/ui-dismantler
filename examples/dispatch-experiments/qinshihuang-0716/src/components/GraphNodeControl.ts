import { ASSET_BASE } from "../constants.js";
import type { ModalController, PersonRecord } from "../types.js";

export interface GraphPoint {
  x: number;
  y: number;
}

export interface GraphNodeController {
  readonly key: string;
  readonly element: HTMLDivElement;
  readonly inner: HTMLDivElement;
  getPosition(): GraphPoint;
  moveTo(point: GraphPoint): void;
  setHighlight(active: boolean, dimmed: boolean): void;
  destroy(): void;
}

export interface GraphNodeControlOptions {
  host: HTMLElement;
  person: PersonRecord;
  position: GraphPoint;
  modal: ModalController;
  onHover(key: string): void;
  onLeave(): void;
  onSelect(key: string): void;
}

export function createGraphNodeControl(options: GraphNodeControlOptions): GraphNodeController {
  const { host, person, modal } = options;
  const element = document.createElement("div");
  element.className = `sg-node${person.big ? " sg-big" : ""}`;
  element.dataset.key = person.name;

  const inner = document.createElement("div");
  inner.className = "sg-float-inner";
  const avatar = document.createElement("div");
  avatar.className = "sg-avatar";
  avatar.setAttribute("style", `background-image:url('${ASSET_BASE}${person.avatar}')`);
  const name = document.createElement("div");
  name.className = "sg-name";
  name.textContent = person.name;
  const role = document.createElement("div");
  role.className = "sg-role-chip";
  role.textContent = person.role;
  inner.append(avatar, name, role);
  element.append(inner);

  const duration = 6 + Math.random() * 4;
  inner.style.animationDuration = `${duration}s`;
  inner.style.animationDelay = `${-Math.random() * duration}s`;

  let position = { ...options.position };
  const moveTo = (point: GraphPoint): void => {
    position = { ...point };
    element.style.left = `${point.x}px`;
    element.style.top = `${point.y}px`;
  };
  moveTo(position);
  host.append(element);

  const onMouseEnter = (): void => options.onHover(person.name);
  const onMouseLeave = (): void => options.onLeave();
  const onClick = (): void => {
    if (element.dataset.dragged) {
      delete element.dataset.dragged;
      return;
    }
    options.onSelect(person.name);
    modal.open(person, element);
  };
  element.addEventListener("mouseenter", onMouseEnter);
  element.addEventListener("mouseleave", onMouseLeave);
  element.addEventListener("click", onClick);

  return {
    key: person.name,
    element,
    inner,
    getPosition: () => ({ ...position }),
    moveTo,
    setHighlight(active, dimmed) {
      element.classList.toggle("sg-active", active);
      element.classList.toggle("sg-dim", dimmed);
    },
    destroy() {
      element.removeEventListener("mouseenter", onMouseEnter);
      element.removeEventListener("mouseleave", onMouseLeave);
      element.removeEventListener("click", onClick);
      element.remove();
    },
  };
}
