import { describe, expect, it, vi } from "vitest";

vi.mock("lucide-svelte", () => ({
  User: {},
  Wallet: {},
  Users: {},
  LifeBuoy: {},
  Shield: {},
}));

import { searchSubsections } from "$lib/settings/sections";

describe("settings search", () => {
  it("finds import history from source and provenance keywords", () => {
    expect(searchSubsections("wyciąg").map((sub) => sub.tab)).toContain("import");
    expect(searchSubsections("historia").map((sub) => sub.tab)).toContain("import");
  });
  it("finds the demo walkthrough from przykład and demo", () => {
    expect(searchSubsections("przykład").map((sub) => sub.tab)).toContain("help");
    expect(searchSubsections("demo").map((sub) => sub.tab)).toContain("help");
  });

  it("finds account deletion from usuń konto and usuń dane", () => {
    expect(searchSubsections("usuń konto").map((sub) => sub.tab)).toContain("privacy");
    expect(searchSubsections("usuń dane").map((sub) => sub.tab)).toContain("privacy");
  });
});
