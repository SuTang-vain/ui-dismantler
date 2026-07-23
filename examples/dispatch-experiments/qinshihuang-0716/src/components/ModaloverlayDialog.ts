import { ASSET_BASE, RELATIONSHIPS } from "../constants.js";
import type { ModalController, PersonRecord, ShellElements } from "../types.js";

const ACTIVE_CLASS = "sg-active";
const CORE_RELATIONSHIP_LABEL = "核心人物 · 本人";
const CORE_RELATIONSHIP_BACKGROUND =
  "linear-gradient(135deg, var(--primary), #7b96f7)";

function findCorePersonName(shell: ShellElements): string {
  const name = shell.graphCanvas
    .querySelector<HTMLElement>(".sg-node.sg-big .sg-name")
    ?.textContent?.trim();

  return name || "核心";
}

export function createModalDialog(shell: ShellElements): ModalController {
  const {
    modalOverlay,
    modalClose,
    modalAvatar,
    modalName,
    modalRole,
    modalRelTag,
    modalDeed,
    modalImpact,
  } = shell;

  let returnFocusTo: HTMLElement | null = null;

  modalOverlay.setAttribute("role", "dialog");
  modalOverlay.setAttribute("aria-modal", "true");
  modalOverlay.setAttribute("aria-labelledby", modalName.id || "sg-modalName");
  modalOverlay.setAttribute(
    "aria-hidden",
    modalOverlay.classList.contains(ACTIVE_CLASS) ? "false" : "true",
  );
  modalClose.setAttribute("aria-label", "关闭人物详情");

  function isOpen(): boolean {
    return modalOverlay.classList.contains(ACTIVE_CLASS);
  }

  function open(person: PersonRecord, trigger: HTMLElement): void {
    returnFocusTo = trigger;

    modalAvatar.src = ASSET_BASE + person.avatar;
    modalName.textContent = person.name;
    modalRole.textContent = person.role;

    if (person.rel) {
      const relationship = RELATIONSHIPS[person.rel];
      modalRelTag.textContent = `与${findCorePersonName(shell)}：${relationship.name}`;
      modalRelTag.style.background = relationship.color;
    } else {
      modalRelTag.textContent = CORE_RELATIONSHIP_LABEL;
      modalRelTag.style.background = CORE_RELATIONSHIP_BACKGROUND;
    }

    modalDeed.textContent = person.deed;
    modalImpact.textContent = person.impact;
    modalOverlay.classList.add(ACTIVE_CLASS);
    modalOverlay.setAttribute("aria-hidden", "false");
    modalClose.focus({ preventScroll: true });
  }

  function close(): void {
    if (!isOpen()) return;

    modalOverlay.classList.remove(ACTIVE_CLASS);
    modalOverlay.setAttribute("aria-hidden", "true");

    const trigger = returnFocusTo;
    returnFocusTo = null;
    if (trigger?.isConnected) {
      trigger.focus({ preventScroll: true });
    }
  }

  function handleCloseClick(): void {
    close();
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === modalOverlay) close();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && isOpen()) {
      event.preventDefault();
      close();
    }
  }

  modalClose.addEventListener("click", handleCloseClick);
  modalOverlay.addEventListener("click", handleBackdropClick);
  document.addEventListener("keydown", handleKeydown);

  return {
    open,
    close,
    destroy(): void {
      modalClose.removeEventListener("click", handleCloseClick);
      modalOverlay.removeEventListener("click", handleBackdropClick);
      document.removeEventListener("keydown", handleKeydown);
      returnFocusTo = null;
    },
  };
}
