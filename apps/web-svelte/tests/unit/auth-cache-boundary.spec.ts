import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/auth/session.svelte", () => {
  const session = { userId: null as string | null };
  return {
    session,
    setSessionUser: (id: string | null) => {
      session.userId = id;
    },
    requireSessionUserId: () => {
      if (!session.userId) throw new Error("No authenticated user");
      return session.userId;
    },
  };
});

import { setSessionUser } from "$lib/auth/session.svelte";
import { qk } from "$lib/query-keys";

type CacheEntry = { data: unknown; isInvalidated?: boolean };

/** Minimal QueryClient stand-in — avoids pulling @tanstack/svelte-query (.svelte) into node unit env. */
function makeClient() {
  const cache = new Map<string, CacheEntry>();
  const keyOf = (key: readonly unknown[]) => JSON.stringify(key);
  return {
    setQueryData(key: readonly unknown[], data: unknown) {
      cache.set(keyOf(key), { data });
    },
    getQueryCache() {
      return { getAll: () => [...cache.values()] };
    },
    clear() {
      cache.clear();
    },
    invalidateQueries({ queryKey }: { queryKey: readonly unknown[] }) {
      const target = keyOf(queryKey);
      for (const [k, v] of cache) {
        if (k.startsWith(target.slice(0, -1))) {
          v.isInvalidated = true;
        }
      }
      const exact = cache.get(target);
      if (exact) exact.isInvalidated = true;
    },
    getQueryState(key: readonly unknown[]) {
      return cache.get(keyOf(key));
    },
  };
}

describe("auth cache boundary helpers", () => {
  afterEach(() => {
    setSessionUser(null);
  });

  it("clear removes all cached queries", () => {
    const client = makeClient();
    client.setQueryData(qk.plans("user-a"), [{ id: "1" }]);
    client.setQueryData(qk.categories("user-a"), [{ id: "c1" }]);
    expect(client.getQueryCache().getAll().length).toBe(2);
    client.clear();
    expect(client.getQueryCache().getAll().length).toBe(0);
  });

  it("session user id tracks identity for namespaced invalidation", () => {
    setSessionUser("user-a");
    const client = makeClient();
    client.setQueryData(qk.notifications("user-a"), []);
    client.setQueryData(qk.notifications("user-b"), []);
    client.invalidateQueries({ queryKey: qk.notifications("user-a") });
    expect(client.getQueryState(qk.notifications("user-a"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(qk.notifications("user-b"))?.isInvalidated).toBeFalsy();
  });
});
