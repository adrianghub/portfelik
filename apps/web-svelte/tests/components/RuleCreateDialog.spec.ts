import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import RuleCreateDialog from "$lib/components/settings/RuleCreateDialog.svelte";
import { resetNativeBackStateForTests } from "$lib/services/native-overlay";
import type { Category } from "$lib/types";

afterEach(resetNativeBackStateForTests);
const row = {
  type: "expense" as const,
  description: "NETFLIX.COM AMSTERDAM",
  counterparty: "Netflix International",
  posted_at: "2026-10-04",
};
const category: Category = {
  id: "entertainment",
  name: "Rozrywka",
  type: "expense",
  user_id: null,
  cap_amount: null,
  cap_period: null,
  created_at: "",
  updated_at: "",
};
const props = {
  open: true,
  row,
  categoryId: category.id,
  categories: [category],
  rows: [row],
  onclose: vi.fn(),
};

describe("rule capture confirmation", () => {
  it("blocks zero matches, preserves actual fields and does not write while changing conditions", async () => {
    const oncreate = vi.fn();
    render(RuleCreateDialog, { ...props, oncreate });
    await waitFor(() => expect(screen.getByText("Pasujące transakcje: 1")).toBeTruthy());
    const description = screen.getByLabelText("Opis", { exact: true }) as HTMLInputElement;
    const counterparty = screen.getByLabelText("Kontrahent", { exact: true }) as HTMLInputElement;
    expect(description.value).toBe(row.description);
    expect(counterparty.value).toBe(row.counterparty);
    expect(counterparty.disabled).toBe(true);
    await fireEvent.input(description, { target: { value: "Unrelated description" } });
    await waitFor(() => expect(screen.getByText("Pasujące transakcje: 0")).toBeTruthy());
    expect(
      (screen.getByRole("button", { name: "Utwórz regułę" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(oncreate).not.toHaveBeenCalled();
  });

  it("keeps failed saves reviewable and allows a corrected retry", async () => {
    const oncreate = vi
      .fn()
      .mockRejectedValueOnce(new Error("duplicate_categorization_rule"))
      .mockResolvedValueOnce(undefined);
    const onclose = vi.fn();
    render(RuleCreateDialog, { ...props, oncreate, onclose });
    const save = screen.getByRole("button", { name: "Utwórz regułę" });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    await fireEvent.click(save);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Taka reguła już istnieje.")
    );
    expect(onclose).not.toHaveBeenCalled();
    await fireEvent.input(screen.getByLabelText("Opis", { exact: true }), {
      target: { value: "NETFLIX" },
    });
    await fireEvent.click(save);
    await waitFor(() => expect(onclose).toHaveBeenCalledOnce());
    expect(oncreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        match_operator: "all",
        match_description: "NETFLIX",
        match_counterparty: null,
      })
    );
  });
});
