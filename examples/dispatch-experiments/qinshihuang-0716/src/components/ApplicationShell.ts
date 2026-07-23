import { ASSET_BASE } from "../constants.js";
import type { EventRecord, ShellElements } from "../types.js";

const SHELL_MARKUP = `
<div id="sg-app-container" role="application" aria-label="秦始皇七大事件与人物关系">
  <div class="sg-event-intro" id="sg-eventIntro"></div>
  <div class="sg-graph-wrap" id="sg-graphWrap">
    <div class="sg-graph-legend">
      <div class="sg-legend-item"><svg class="sg-lg-svg sg-family" height="8" width="26"><line x1="1" x2="25" y1="4" y2="4"></line></svg>宗亲</div>
      <div class="sg-legend-item"><svg class="sg-lg-svg sg-ruler" height="8" width="26"><line x1="1" x2="25" y1="4" y2="4"></line></svg>君臣</div>
      <div class="sg-legend-item"><svg class="sg-lg-svg sg-ally" height="8" width="26"><line x1="1" x2="25" y1="4" y2="4"></line></svg>同僚</div>
      <div class="sg-legend-item"><svg class="sg-lg-svg sg-enemy" height="8" width="26"><line x1="1" x2="25" y1="4" y2="4"></line></svg>对立</div>
    </div>
    <div class="sg-graph-canvas" id="sg-graphCanvas">
      <svg class="sg-edges" id="sg-graphEdges"></svg>
    </div>
    <div class="sg-graph-hint" id="sg-graphHint"><span class="sg-gh-dot"></span>点击头像查看人物详情，可拖动</div>
  </div>
  <div class="sg-event-bar">
    <button class="sg-bar-arrow" id="sg-barPrev" type="button" aria-label="上一个事件" title="上一个事件">‹</button>
    <div class="sg-event-btns" id="sg-eventBtns"></div>
    <button class="sg-bar-arrow" id="sg-barNext" type="button" aria-label="下一个事件" title="下一个事件">›</button>
    <div aria-hidden="true" class="sg-swipe-hint" id="sg-swipeHint">›</div>
  </div>
  <div class="sg-modal-overlay" id="sg-modalOverlay" role="dialog" aria-modal="true" aria-labelledby="sg-modalName">
    <div class="sg-modal-content">
      <button class="sg-modal-close" id="sg-modalClose" type="button" aria-label="关闭人物详情">✕</button>
      <div class="sg-modal-head">
        <img alt="" class="sg-modal-avatar" id="sg-modalAvatar" />
        <div class="sg-modal-head-info">
          <div class="sg-modal-person-name" id="sg-modalName"></div>
          <div class="sg-modal-person-role" id="sg-modalRole"></div>
          <span class="sg-modal-rel-tag" id="sg-modalRelTag"></span>
        </div>
      </div>
      <div class="sg-modal-body">
        <div class="sg-modal-section">
          <div class="sg-modal-section-title">在本事件中的作为</div>
          <div class="sg-modal-section-text" id="sg-modalDeed"></div>
        </div>
        <div class="sg-modal-section">
          <div class="sg-modal-section-title">影响</div>
          <div class="sg-modal-section-text" id="sg-modalImpact"></div>
        </div>
      </div>
    </div>
  </div>
</div>`;

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`ApplicationShell is missing ${selector}`);
  return element;
}

export function createApplicationShell(root: HTMLElement): ShellElements {
  root.innerHTML = SHELL_MARKUP;
  const app = required<HTMLElement>(root, "#sg-app-container");

  return {
    app,
    intro: required(app, "#sg-eventIntro"),
    graphWrap: required(app, "#sg-graphWrap"),
    graphCanvas: required(app, "#sg-graphCanvas"),
    graphEdges: required<SVGSVGElement>(app, "#sg-graphEdges"),
    graphHint: required(app, "#sg-graphHint"),
    eventBtns: required(app, "#sg-eventBtns"),
    prev: required<HTMLButtonElement>(app, "#sg-barPrev"),
    next: required<HTMLButtonElement>(app, "#sg-barNext"),
    swipeHint: required(app, "#sg-swipeHint"),
    modalOverlay: required(app, "#sg-modalOverlay"),
    modalClose: required<HTMLButtonElement>(app, "#sg-modalClose"),
    modalAvatar: required<HTMLImageElement>(app, "#sg-modalAvatar"),
    modalName: required(app, "#sg-modalName"),
    modalRole: required(app, "#sg-modalRole"),
    modalRelTag: required(app, "#sg-modalRelTag"),
    modalDeed: required(app, "#sg-modalDeed"),
    modalImpact: required(app, "#sg-modalImpact"),
  };
}

function usesSmallCanvas(shell: ShellElements): boolean {
  if (shell.app.classList.contains("sg-is-small-canvas")) return true;
  if (shell.app.classList.contains("sg-is-large-canvas")) return false;
  const view = shell.app.ownerDocument.defaultView;
  if (!view) return false;
  const { innerWidth: width, innerHeight: height } = view;
  return width < 415 || height < 456 || (width <= 768 && width / height < 1);
}

export function renderEventIntro(
  shell: ShellElements,
  event: EventRecord,
  eventIndex = 0,
  eventCount = 1,
): void {
  const document = shell.app.ownerDocument;
  const image = document.createElement("img");
  image.className = "sg-intro-icon";
  image.src = `${ASSET_BASE}${event.image}`;
  image.alt = event.name;
  image.loading = "lazy";

  const text = document.createElement("div");
  text.className = "sg-intro-text";
  const titleLine = document.createElement("div");
  titleLine.className = "sg-intro-title-line";
  const name = document.createElement("span");
  name.className = "sg-intro-name";
  name.textContent = event.name;
  const period = document.createElement("span");
  period.className = "sg-intro-period";
  period.textContent = `${event.year} · ${event.period}`;
  titleLine.append(name, period);
  const summary = document.createElement("div");
  summary.className = "sg-intro-summary";
  summary.textContent = usesSmallCanvas(shell) && event.summaryShort
    ? event.summaryShort
    : event.summary;
  text.append(titleLine, summary);

  const index = document.createElement("div");
  index.className = "sg-intro-index";
  const current = document.createElement("b");
  current.textContent = String(eventIndex + 1);
  index.append(current, `/${eventCount}`);
  shell.intro.replaceChildren(image, text, index);
}
