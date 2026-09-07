import { describe, expect, it } from "vitest";
import { qk } from "$lib/query-keys";

const U = "user-a";
const U2 = "user-b";

describe("qk factory", () => {
  it("namespaces private keys under user id", () => {
    expect(qk.user(U)).toEqual(["user", U]);
    expect(qk.profile(U)).toEqual(["user", U, "profile"]);
    expect(qk.plans(U)).toEqual(["user", U, "plans"]);
    expect(qk.transactions.list(U, 2026, 1)).toEqual(["user", U, "transactions", 2026, 1]);
  });

  it("uses user as the prefix of every private financial key", () => {
    const user = qk.user(U);
    for (const key of [
      qk.transactions.all(U),
      qk.plans(U),
      qk.planProgress(U),
      qk.financialSnapshot(U),
      qk.cashPosition(U),
      qk.netWorthItems(U),
    ]) {
      expect(key.slice(0, user.length)).toEqual([...user]);
    }
  });

  it("uses transactions.all as prefix of deeper transaction keys", () => {
    const all = qk.transactions.all(U);
    const list = qk.transactions.list(U, "cash-history", "2026-01-01");
    expect(list.slice(0, all.length)).toEqual([...all]);
  });

  it("isolates keys between users", () => {
    expect(qk.categories(U)).not.toEqual(qk.categories(U2));
    expect(qk.categories(U)[1]).toBe(U);
    expect(qk.categories(U2)[1]).toBe(U2);
  });

  it("keeps FX public and not user-scoped", () => {
    expect(qk.fx()).toEqual(["fx", "nbp-table-a"]);
    expect(qk.fx()[0]).not.toBe("user");
  });
});
