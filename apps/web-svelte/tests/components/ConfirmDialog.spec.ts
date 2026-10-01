import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
import {
  closeTopNativeOverlay,
  nativeOverlayCount,
  resetNativeBackStateForTests,
} from "$lib/services/native-overlay";
vi.mock("$lib/motion", () => ({ motionDuration: () => 0 }));
afterEach(resetNativeBackStateForTests);
describe("pending destructive confirmation", () => {
  it("keeps the dialog and native-back guard while pending", async () => {
    const onclose = vi.fn();
    render(ConfirmDialog, {
      open: true,
      message: "Delete fixture",
      onconfirm: vi.fn(),
      onclose,
      pending: true,
    });
    await waitFor(() => expect(nativeOverlayCount()).toBe(1));
    const cancel = screen.getByRole("button", { name: "Anuluj" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(closeTopNativeOverlay()).toBe(true);
    expect(closeTopNativeOverlay()).toBe(true);
    expect(nativeOverlayCount()).toBe(1);
    expect(onclose).not.toHaveBeenCalled();
  });
});
