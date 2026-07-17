import { describe, expect, it } from "vitest";
import {
  authCallbackUrlForTarget,
  loginUrlForTarget,
  normalizeLoginRedirect,
  redirectTargetFromUrl,
} from "$lib/auth-redirect";

describe("auth redirect helpers", () => {
  it("keeps internal protected paths with query strings", () => {
    expect(normalizeLoginRedirect("/transactions?startYear=2026&startMonth=5")).toBe(
      "/transactions?startYear=2026&startMonth=5"
    );
  });

  it("rejects external and auth targets", () => {
    expect(normalizeLoginRedirect("https://example.com/transactions")).toBe("/");
    expect(normalizeLoginRedirect("//example.com/transactions")).toBe("/");
    expect(normalizeLoginRedirect("/login?redirectTo=%2Ftransactions")).toBe("/");
    expect(normalizeLoginRedirect("/auth/callback")).toBe("/");
  });

  it("builds a login URL with an encoded return target", () => {
    expect(loginUrlForTarget("/transactions?status=overdue")).toBe(
      "/login?redirectTo=%2Ftransactions%3Fstatus%3Doverdue"
    );
  });

  it("reads a redirect target from a URL query", () => {
    const url = new URL("https://portfelik.local/login?redirectTo=%2Fshopping-lists%2Flist-1");

    expect(redirectTargetFromUrl(url)).toBe("/shopping-lists/list-1");
  });

  it("builds an auth callback that preserves invite continuation across devices", () => {
    expect(authCallbackUrlForTarget("https://app.jakstoimy.pl", "/invite/tok-1")).toBe(
      "https://app.jakstoimy.pl/auth/callback?redirectTo=%2Finvite%2Ftok-1"
    );
    const callback = new URL(
      authCallbackUrlForTarget("https://app.jakstoimy.pl", "/invite/tok-1")
    );
    expect(redirectTargetFromUrl(callback)).toBe("/invite/tok-1");
  });
});
