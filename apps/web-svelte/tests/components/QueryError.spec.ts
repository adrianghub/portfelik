import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import QueryError from "$lib/components/ui/QueryError.svelte";

describe("QueryError", () => {
  it("renders the mapped message for a permission error", () => {
    render(QueryError, { error: { code: "42501" } });
    expect(screen.getByText("Brak uprawnień do tej operacji.")).toBeTruthy();
  });

  it("shows a retry button only when onRetry is given and fires it", async () => {
    const onRetry = vi.fn();
    render(QueryError, { error: { code: "99999" }, onRetry });
    await fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits the retry button when no onRetry", () => {
    render(QueryError, { error: { code: "99999" } });
    expect(screen.queryByRole("button")).toBeNull();
  });
});
