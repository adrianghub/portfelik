import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import ImportCategoryCombobox from "$lib/components/import/ImportCategoryCombobox.svelte";
import type { Category } from "$lib/types";

const cat = (id: string, name: string): Category => ({
  id,
  name,
  type: "expense",
  user_id: "u1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const categories = [cat("c1", "Jedzenie"), cat("c2", "Transport")];

// Real focus: the underlying combobox closes itself when activeElement is not the
// input, which fireEvent.focus does not set in jsdom.
async function focusOpen(input: HTMLElement): Promise<void> {
  input.focus();
  await tick();
}

describe("ImportCategoryCombobox", () => {
  it("shows a clear chip for the selected category and clears on click", async () => {
    const onchange = vi.fn();
    render(ImportCategoryCombobox, {
      props: {
        categories,
        type: "expense",
        selectedId: "c1",
        onchange,
        oncreate: async () => null,
      },
    });

    const chip = screen.getByRole("button");
    expect(chip.textContent).toContain("Jedzenie");

    await fireEvent.click(chip);
    expect(onchange).toHaveBeenCalledWith(null);
  });

  it("renders the combobox when nothing is selected", () => {
    render(ImportCategoryCombobox, {
      props: {
        categories,
        type: "expense",
        selectedId: null,
        onchange: vi.fn(),
        oncreate: async () => null,
      },
    });
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("selecting a category name notifies the parent with its id", async () => {
    const onchange = vi.fn();
    render(ImportCategoryCombobox, {
      props: {
        categories,
        type: "expense",
        selectedId: null,
        onchange,
        oncreate: async () => null,
      },
    });

    await focusOpen(screen.getByRole("combobox"));
    await fireEvent.click(screen.getByRole("option", { name: "Transport" }));
    expect(onchange).toHaveBeenCalledWith("c2");
  });

  it("creating a category calls oncreate(name, type) then notifies with the new id", async () => {
    const onchange = vi.fn();
    const oncreate = vi.fn(async () => "c-new");
    render(ImportCategoryCombobox, {
      props: { categories, type: "expense", selectedId: null, onchange, oncreate },
    });

    const input = screen.getByRole("combobox");
    await focusOpen(input);
    await fireEvent.input(input, { target: { value: "Wakacje" } });
    await fireEvent.click(screen.getByRole("option", { name: /Wakacje/ }));

    expect(oncreate).toHaveBeenCalledWith("Wakacje", "expense");
    await waitFor(() => expect(onchange).toHaveBeenCalledWith("c-new"));
  });
});
