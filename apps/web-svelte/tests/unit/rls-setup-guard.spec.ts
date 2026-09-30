import { describe, expect, it } from "vitest";
import { assertLocalSupabaseUrl } from "../rls/setup";

describe("RLS target guard", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"])(
    "allows an explicit loopback target: %s",
    (url) => {
      expect(() => assertLocalSupabaseUrl(url)).not.toThrow();
    }
  );

  it.each([
    "https://example.supabase.co",
    "https://127.0.0.1:54321",
    "http://192.168.1.20:54321",
    "not-a-url",
  ])("rejects a remote or ambiguous target: %s", (url) => {
    expect(() => assertLocalSupabaseUrl(url)).toThrow(/local|non-local/i);
  });
});
