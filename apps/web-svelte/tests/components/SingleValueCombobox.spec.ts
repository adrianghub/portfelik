import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import SingleValueCombobox from "$lib/components/ui/SingleValueCombobox.svelte";

const items = ["Jedzenie", "Transport", "Rozrywka"];

const optionTexts = () => screen.getAllByRole("option").map((o) => o.textContent?.trim());

// Real focus (not fireEvent.focus): the combobox closes itself when
// document.activeElement !== the input, which fireEvent.focus does not set in jsdom.
async function focusOpen(input: HTMLElement): Promise<void> {
  input.focus();
  await tick();
}

describe("SingleValueCombobox", () => {
  it("opens on focus and lists all items", async () => {
    render(SingleValueCombobox, { props: { items } });
    await focusOpen(screen.getByRole("combobox"));
    expect(optionTexts()).toEqual(items);
  });

  it("filters items by the typed query", async () => {
    render(SingleValueCombobox, { props: { items } });
    const input = screen.getByRole("combobox");
    await focusOpen(input);
    await fireEvent.input(input, { target: { value: "tra" } });
    expect(optionTexts()).toEqual(["Transport"]);
  });

  it("selecting an option fires onchange and closes the list", async () => {
    const onchange = vi.fn();
    render(SingleValueCombobox, { props: { items, onchange } });
    await focusOpen(screen.getByRole("combobox"));
    await fireEvent.click(screen.getByRole("option", { name: "Transport" }));
    expect(onchange).toHaveBeenCalledWith("Transport");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("offers a create affordance for a novel value and fires oncreate", async () => {
    const oncreate = vi.fn();
    render(SingleValueCombobox, { props: { items, allowCreate: true, oncreate } });
    const input = screen.getByRole("combobox");
    await focusOpen(input);
    await fireEvent.input(input, { target: { value: "Wakacje" } });
    await fireEvent.click(screen.getByRole("option", { name: /Wakacje/ }));
    expect(oncreate).toHaveBeenCalledWith("Wakacje");
  });

  it("does not offer create for a value that already exists", async () => {
    const oncreate = vi.fn();
    render(SingleValueCombobox, { props: { items, allowCreate: true, oncreate } });
    const input = screen.getByRole("combobox");
    await focusOpen(input);
    await fireEvent.input(input, { target: { value: "Transport" } });
    // Only the existing match shows; no create option for an exact duplicate.
    expect(optionTexts()).toEqual(["Transport"]);
  });

  it("ArrowDown then Enter selects the active option", async () => {
    const onchange = vi.fn();
    render(SingleValueCombobox, { props: { items, onchange } });
    const input = screen.getByRole("combobox");
    await focusOpen(input);
    await fireEvent.keyDown(input, { key: "ArrowDown" });
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(onchange).toHaveBeenCalledWith("Transport");
  });

  it("Escape closes the open list", async () => {
    render(SingleValueCombobox, { props: { items } });
    const input = screen.getByRole("combobox");
    await focusOpen(input);
    expect(screen.queryByRole("listbox")).not.toBeNull();
    await fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
