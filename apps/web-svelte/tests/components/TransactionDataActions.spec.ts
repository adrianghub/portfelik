import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import TransactionDataActions from "$lib/components/transactions/TransactionDataActions.svelte";
import {
  closeTopNativeOverlay,
  nativeOverlayCount,
  resetNativeBackStateForTests,
} from "$lib/services/native-overlay";
import * as m from "$lib/paraglide/messages";

afterEach(resetNativeBackStateForTests);

describe("transactions action menu native back", () => {
  it("closes the body portal and restores trigger focus before page navigation", async () => {
    render(TransactionDataActions, {
      exportDisabled: false,
      onexport: vi.fn(),
      onmanualadd: vi.fn(),
    });
    const trigger = screen.getByRole("button", { name: m.transactions_more_actions() });
    await fireEvent.click(trigger);
    expect(screen.getByRole("menu").parentElement).toBe(document.body);
    expect(nativeOverlayCount()).toBe(1);
    expect(closeTopNativeOverlay()).toBe(true);
    await tick();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(nativeOverlayCount()).toBe(0);
  });
});
