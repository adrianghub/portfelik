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
      qk.planSpendSettlements(U, "malta"),
      qk.planSpendCards(U, "malta"),
      qk.plans(U),
      qk.planProgress(U),
      qk.cashPosition(U),
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
});

it("invalidates spend facts with transaction edits and status changes", () => {
  const prefix = qk.transactions.all(U);
  expect(qk.planSpendSettlements(U, "malta").slice(0, prefix.length)).toEqual(prefix);
  expect(qk.planSpendCards(U, "malta").slice(0, prefix.length)).toEqual(prefix);
});
