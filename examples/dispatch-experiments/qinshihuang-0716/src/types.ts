export type RelationshipType = "family" | "ruler" | "ally" | "enemy";

export interface PersonRecord {
  name: string;
  role: string;
  avatar: string;
  big?: boolean;
  rel?: RelationshipType;
  deed: string;
  impact: string;
}

export interface RelationshipLink {
  a: string;
  b: string;
  type: RelationshipType;
  label?: string;
}

export interface EventRecord {
  name: string;
  year: string;
  period: string;
  image: string;
  summary: string;
  summaryShort: string;
  people: PersonRecord[];
  links: RelationshipLink[];
}

export interface ShellElements {
  app: HTMLElement;
  intro: HTMLElement;
  graphWrap: HTMLElement;
  graphCanvas: HTMLElement;
  graphEdges: SVGSVGElement;
  graphHint: HTMLElement;
  eventBtns: HTMLElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  swipeHint: HTMLElement;
  modalOverlay: HTMLElement;
  modalClose: HTMLButtonElement;
  modalAvatar: HTMLImageElement;
  modalName: HTMLElement;
  modalRole: HTMLElement;
  modalRelTag: HTMLElement;
  modalDeed: HTMLElement;
  modalImpact: HTMLElement;
}

export interface ModalController {
  open(person: PersonRecord, trigger: HTMLElement): void;
  close(): void;
  destroy(): void;
}

export interface GraphController {
  render(event: EventRecord): void;
  relayout(): void;
  destroy(): void;
}

export interface EventControlsController {
  render(index: number): void;
  destroy(): void;
}
