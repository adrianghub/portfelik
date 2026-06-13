import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import CategorySelect from "$lib/components/transactions/CategorySelect.svelte";
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

describe("CategorySelect (pillMode)", () => {
  it("shows a clear chip for the selected category and clears on click", async () => {
    const onchange = vi.fn();
    render(CategorySelect, {
      props: {
        categories,
        type: "expense",
        selectedId: "c1",
        onchange,
        oncreate: async () => null,
        pillMode: true,
      },
    });

    const chip = screen.getByRole("button");
    expect(chip.textContent).toContain("Jedzenie");

    await fireEvent.click(chip);
    expect(onchange).toHaveBeenCalledWith(null);
  });

  it("renders the combobox when nothing is selected", () => {
    render(CategorySelect, {
      props: {
        categories,
        type: "expense",
        selectedId: null,
        onchange: vi.fn(),
        oncreate: async () => null,
        pillMode: true,
      },
    });
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("selecting a category name notifies the parent with its id", async () => {
    const onchange = vi.fn();
    render(CategorySelect, {
      props: {
        categories,
        type: "expense",
        selectedId: null,
        onchange,
        oncreate: async () => null,
        pillMode: true,
      },
    });

    await focusOpen(screen.getByRole("combobox"));
    await fireEvent.click(screen.getByRole("option", { name: "Transport" }));
    expect(onchange).toHaveBeenCalledWith("c2");
  });

  it("creating a category calls oncreate(name, type) then notifies with the new id", async () => {
    const onchange = vi.fn();
    const oncreate = vi.fn(async () => "c-new");
    render(CategorySelect, {
      props: { categories, type: "expense", selectedId: null, onchange, oncreate, pillMode: true },
    });

    const input = screen.getByRole("combobox");
    await focusOpen(input);
    await fireEvent.input(input, { target: { value: "Wakacje" } });
    await fireEvent.click(screen.getByRole("option", { name: /Wakacje/ }));

    expect(oncreate).toHaveBeenCalledWith("Wakacje", "expense");
    await waitFor(() => expect(onchange).toHaveBeenCalledWith("c-new"));
  });
});

describe("CategorySelect (non-pill / form usage)", () => {
  it("prefills the input with the externally-selected category name", async () => {
    render(CategorySelect, {
      props: { categories, type: "expense", selectedId: "c1", onchange: vi.fn() },
    });
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("Jedzenie"));
  });

  it("does NOT clobber an in-progress search back to the selected category", async () => {
    // Regression: the sync effect used to depend on `name`, so every keystroke
    // that did not resolve to the current id reset the input - making it
    // impossible to type-search and change an existing category (and breaking
    // the real-DB smoke create flow).
    render(CategorySelect, {
      props: { categories, type: "expense", selectedId: "c1", onchange: vi.fn() },
    });
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("Jedzenie"));

    await focusOpen(input);
    await fireEvent.input(input, { target: { value: "Trans" } });
    await tick();
    expect(input.value).toBe("Trans");
  });

  it("selecting a different category after typing notifies the parent with the new id", async () => {
    const onchange = vi.fn();
    render(CategorySelect, {
      props: { categories, type: "expense", selectedId: "c1", onchange },
    });
    const input = screen.getByRole("combobox");
    await focusOpen(input);
    await fireEvent.input(input, { target: { value: "Trans" } });
    await fireEvent.click(screen.getByRole("option", { name: "Transport" }));
    expect(onchange).toHaveBeenCalledWith("c2");
  });
});
