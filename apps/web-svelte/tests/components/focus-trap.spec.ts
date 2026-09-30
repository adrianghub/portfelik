import { describe, expect, it, vi } from "vitest";
import { focusFirstInOverlay, trapOverlayTab } from "$lib/focus-trap";

function button(label: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.textContent = label;
  vi.spyOn(el, "getClientRects").mockReturnValue({ length: 1 } as DOMRectList);
  document.body.appendChild(el);
  return el;
}

describe("focus-trap", () => {
  it("focuses the first focusable control in an overlay", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const first = button("first");
    const second = button("second");
    container.append(first, second);

    focusFirstInOverlay(container);
    expect(document.activeElement).toBe(first);

    container.remove();
    first.remove();
    second.remove();
  });

  it("cycles Tab from the last control back to the first", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const first = button("first");
    const last = button("last");
    container.append(first, last);
    last.focus();

    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    const preventDefault = vi.spyOn(event, "preventDefault");
    trapOverlayTab(event, container);

    expect(preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(first);

    container.remove();
    first.remove();
    last.remove();
  });
});
