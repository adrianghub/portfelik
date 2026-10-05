import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImportCategorySheet from "$lib/components/import/ImportCategorySheet.svelte";
import { resetNativeBackStateForTests } from "$lib/services/native-overlay";
import type { Category } from "$lib/types";

afterEach(resetNativeBackStateForTests);
const category = { id: "food", name: "Jedzenie", type: "expense", archived_at: null } as Category;
const props = {
  categories: [category],
  type: "expense" as const,
  selectedId: null,
  suggestedId: null,
  recentIds: [],
  onclose: vi.fn(),
};

describe("mobile import category choice", () => {
  it("does not write while searching and keeps a failed creation available for retry", async () => {
    const onselect = vi.fn();
    const oncreate = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("coffee");
    render(ImportCategorySheet, { ...props, onselect, oncreate });
    await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "  Kawa  " } });
    expect(oncreate).not.toHaveBeenCalled();
    const create = screen.getByRole("button", { name: "Utwórz „Kawa”" });
    await fireEvent.click(create);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(onselect).not.toHaveBeenCalled();
    await fireEvent.click(create);
    await waitFor(() => expect(onselect).toHaveBeenCalledWith("coffee"));
    expect(oncreate).toHaveBeenLastCalledWith("Kawa", "expense");
  });

  it("hides archived and wrong-type choices and prevents duplicate creation", async () => {
    const onselect = vi.fn();
    const oncreate = vi.fn();
    render(ImportCategorySheet, {
      ...props,
      categories: [
        category,
        { ...category, id: "old", name: "Dawna", archived_at: "2026-01-01" },
        { ...category, id: "salary", name: "Pensja", type: "income" },
      ],
      onselect,
      oncreate,
    });
    expect(screen.queryByRole("button", { name: "Dawna" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pensja" })).toBeNull();
    await fireEvent.input(screen.getByRole("searchbox"), { target: { value: " JEDZENIE " } });
    expect(screen.queryByRole("button", { name: /Utwórz/ })).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Jedzenie" }));
    expect(onselect).toHaveBeenCalledWith("food");
    expect(oncreate).not.toHaveBeenCalled();
  });
});
