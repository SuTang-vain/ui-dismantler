import { renderEventIntro } from "./ApplicationShell.js";
import type {
  EventControlsController,
  EventRecord,
  ShellElements,
} from "../types.js";

export function createEventControls(
  shell: ShellElements,
  events: readonly EventRecord[],
  onSelect: (index: number) => void,
): EventControlsController {
  const view = shell.app.ownerDocument.defaultView;
  let currentIndex = 0;
  let frame = 0;
  let destroyed = false;

  const updateArrows = (): void => {
    const maxScroll = shell.eventBtns.scrollWidth - shell.eventBtns.clientWidth;
    const scrollable = maxScroll > 2;
    shell.prev.disabled = !scrollable || shell.eventBtns.scrollLeft <= 1;
    shell.next.disabled = !scrollable || shell.eventBtns.scrollLeft >= maxScroll - 1;
    const canScrollRight = scrollable && shell.eventBtns.scrollLeft < maxScroll - 4;
    shell.swipeHint.classList.toggle("sg-hide", !canScrollRight);
  };

  const centerActiveButton = (): void => {
    if (destroyed) return;
    shell.eventBtns
      .querySelector<HTMLElement>(".sg-event-btn.sg-active")
      ?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: "smooth" });
    updateArrows();
  };

  const scheduleCentering = (): void => {
    if (frame && typeof view?.cancelAnimationFrame === "function") {
      view.cancelAnimationFrame(frame);
    }
    if (typeof view?.requestAnimationFrame === "function") {
      frame = view.requestAnimationFrame(centerActiveButton);
    } else {
      frame = 0;
      queueMicrotask(centerActiveButton);
    }
  };

  const render = (index: number): void => {
    if (index < 0 || index >= events.length) return;
    currentIndex = index;
    renderEventIntro(shell, events[index], index, events.length);
    const buttons = events.map((event, eventIndex) => {
      const button = shell.app.ownerDocument.createElement("button");
      button.className = `sg-event-btn${eventIndex === index ? " sg-active" : ""}`;
      button.dataset.i = String(eventIndex);
      button.title = `查看：${event.name}`;
      const name = shell.app.ownerDocument.createElement("span");
      name.className = "sg-eb-name";
      name.textContent = event.name;
      const year = shell.app.ownerDocument.createElement("span");
      year.className = "sg-eb-year";
      year.textContent = event.year;
      button.append(name, year);
      return button;
    });
    shell.eventBtns.replaceChildren(...buttons);
    updateArrows();
    scheduleCentering();
  };

  const handleButtonClick = (event: Event): void => {
    const origin = event.target as Element | null;
    const target = origin?.closest<HTMLElement>(".sg-event-btn") ?? null;
    if (!target || !shell.eventBtns.contains(target)) return;
    const index = Number(target.dataset.i);
    if (!Number.isInteger(index)) return;
    render(index);
    onSelect(index);
  };
  const scrollPrevious = (): void => {
    shell.eventBtns.scrollBy({ left: -180, behavior: "smooth" });
  };
  const scrollNext = (): void => {
    shell.eventBtns.scrollBy({ left: 180, behavior: "smooth" });
  };

  shell.eventBtns.addEventListener("click", handleButtonClick);
  shell.eventBtns.addEventListener("scroll", updateArrows, { passive: true });
  shell.prev.addEventListener("click", scrollPrevious);
  shell.next.addEventListener("click", scrollNext);
  if (events.length) render(0);
  else updateArrows();

  return {
    render,
    destroy(): void {
      destroyed = true;
      if (frame && typeof view?.cancelAnimationFrame === "function") {
        view.cancelAnimationFrame(frame);
      }
      shell.eventBtns.removeEventListener("click", handleButtonClick);
      shell.eventBtns.removeEventListener("scroll", updateArrows);
      shell.prev.removeEventListener("click", scrollPrevious);
      shell.next.removeEventListener("click", scrollNext);
    },
  };
}
