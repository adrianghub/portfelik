import type { Category, TransactionType } from "$lib/types";

interface Deps {
  createCategory: (input: { name: string; type: TransactionType }) => Promise<Category>;
  invalidate: () => Promise<unknown>;
  toastSuccess: () => void;
  toastError: () => void;
}

/** Builds an inline category-create handler usable by any CategorySelect call site. */
export function makeCreateCategoryInline(deps: Deps) {
  return async function createCategoryInline(
    name: string,
    type: TransactionType
  ): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    try {
      const created = await deps.createCategory({ name: trimmed, type });
      await deps.invalidate();
      deps.toastSuccess();
      return created.id;
    } catch {
      deps.toastError();
      return null;
    }
  };
}
