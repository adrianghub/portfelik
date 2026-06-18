import { describe, expect, it, vi } from "vitest";

// net-worth-items.ts imports the supabase singleton (which imports $env). Mock it
// so the pure diff helper can be exercised without the SvelteKit env.
vi.mock("$lib/supabase", () => ({ supabase: {} }));

import { diffRemovedItemIds } from "$lib/services/net-worth-items";

describe("diffRemovedItemIds", () => {
  it("deletes existing rows that are absent from the next list", () => {
    const existing = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const next = [{ id: "a", label: "Konto", amount: 1, currency: "PLN" }];
    expect(diffRemovedItemIds(existing, next).sort()).toEqual(["b", "c"]);
  });

  it("deletes nothing when every existing row is retained", () => {
    const existing = [{ id: "a" }];
    const next = [
      { id: "a", label: "Konto", amount: 1, currency: "PLN" },
      { label: "Nowe", amount: 2, currency: "EUR" }, // new row, no id
    ];
    expect(diffRemovedItemIds(existing, next)).toEqual([]);
  });

  it("deletes all when next is empty", () => {
    const existing = [{ id: "a" }, { id: "b" }];
    expect(diffRemovedItemIds(existing, []).sort()).toEqual(["a", "b"]);
  });
});
