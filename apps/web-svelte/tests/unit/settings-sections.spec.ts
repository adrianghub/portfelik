import { describe, expect, it, vi } from "vitest";

vi.mock("lucide-svelte", () => ({
  User: {},
  Wallet: {},
  Users: {},
}));

import { searchSubsections } from "$lib/settings/sections";

describe("settings search", () => {
  it("finds the demo walkthrough from przykład and demo", () => {
    expect(searchSubsections("przykład").map((sub) => sub.tab)).toContain("profile");
    expect(searchSubsections("demo").map((sub) => sub.tab)).toContain("profile");
  });

  it("finds account deletion from usuń konto and usuń dane", () => {
    expect(searchSubsections("usuń konto").map((sub) => sub.tab)).toContain("profile");
    expect(searchSubsections("usuń dane").map((sub) => sub.tab)).toContain("profile");
  });
});
