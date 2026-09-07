import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import QueryError from "$lib/components/ui/QueryError.svelte";
import * as m from "$lib/paraglide/messages";

describe("QueryError", () => {
  it("renders the mapped message for a permission error", () => {
    render(QueryError, { error: { code: "42501" } });
    expect(screen.getByText(m.error_permission())).toBeTruthy();
  });

  it("shows a retry button only when onRetry is given and fires it", async () => {
    const onRetry = vi.fn();
    render(QueryError, { error: { code: "99999" }, onRetry });
    await fireEvent.click(screen.getByRole("button", { name: m.common_retry() }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits the retry button when no onRetry", () => {
    render(QueryError, { error: { code: "99999" } });
    expect(screen.queryByRole("button")).toBeNull();
  });
});
