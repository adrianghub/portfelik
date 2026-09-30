const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute("hidden") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0
  );
}

export function focusFirstInOverlay(container: HTMLElement): void {
  const preferred = container.querySelector<HTMLElement>("[autofocus]");
  const target = preferred ?? focusableElements(container)[0] ?? container;
  target.focus({ preventScroll: true });
}

export function trapOverlayTab(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== "Tab") return;
  const focusable = focusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable.at(-1)!;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}
