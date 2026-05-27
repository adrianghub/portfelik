import { describe, expect, it } from "vitest";
import {
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
});
