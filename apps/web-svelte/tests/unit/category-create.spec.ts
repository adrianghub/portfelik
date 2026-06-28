// tests/unit/category-create.spec.ts
import { describe, it, expect, vi } from "vitest";
import { makeCreateCategoryInline } from "$lib/category-create";
import type { Category } from "$lib/types";

describe("createCategoryInline", () => {
  it("creates, invalidates categories, toasts, returns new id", async () => {
    const created: Category = {
      id: "new-1",
      name: "Apteka",
      type: "expense",
      user_id: "u1",
      created_at: "",
      updated_at: "",
    };
    const createCategory = vi.fn().mockResolvedValue(created);
    const invalidate = vi.fn().mockResolvedValue(undefined);
    const toastSuccess = vi.fn();
    const fn = makeCreateCategoryInline({
      createCategory,
      invalidate,
      toastSuccess,
      toastError: vi.fn(),
    });

    const id = await fn("Apteka", "expense");

    expect(id).toBe("new-1");
    expect(createCategory).toHaveBeenCalledWith({ name: "Apteka", type: "expense" });
    expect(invalidate).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("returns null and toasts error on failure", async () => {
    const createCategory = vi.fn().mockRejectedValue(new Error("boom"));
    const toastError = vi.fn();
    const fn = makeCreateCategoryInline({
      createCategory,
      invalidate: vi.fn(),
      toastSuccess: vi.fn(),
      toastError,
    });
    const id = await fn("X", "income");
    expect(id).toBeNull();
    expect(toastError).toHaveBeenCalled();
  });
});
