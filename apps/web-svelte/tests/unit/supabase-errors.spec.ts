import { describe, expect, it } from "vitest";
import { classifyError, errorMessage } from "$lib/services/supabase-errors";

describe("classifyError", () => {
  it("classifies a fetch TypeError as network", () => {
    expect(classifyError(new TypeError("Failed to fetch")).kind).toBe("network");
  });

  it("maps known Postgres codes", () => {
    expect(classifyError({ code: "42501" }).kind).toBe("permission");
    expect(classifyError({ code: "23505" }).kind).toBe("duplicate");
    expect(classifyError({ code: "23503" }).kind).toBe("in_use");
    expect(classifyError({ code: "23502" }).kind).toBe("validation");
    expect(classifyError({ code: "23514" }).kind).toBe("validation");
    expect(classifyError({ code: "22P02" }).kind).toBe("validation");
    expect(classifyError({ code: "PGRST301" }).kind).toBe("session_expired");
  });

  it("treats a 401 status (no code) as session expired", () => {
    expect(classifyError({ status: 401 }).kind).toBe("session_expired");
  });

  it("carries the hint for custom P0001 raises", () => {
    expect(classifyError({ code: "P0001", hint: "Tylko właściciel." })).toEqual({
      kind: "custom",
      detail: "Tylko właściciel.",
    });
  });

  it("falls back to generic for unknown / empty", () => {
    expect(classifyError({ code: "99999" }).kind).toBe("generic");
    expect(classifyError(null).kind).toBe("generic");
  });
});

describe("errorMessage", () => {
  it("prefers a per-code override", () => {
    expect(errorMessage({ code: "23503" }, { overrides: { "23503": "Kategoria w użyciu" } })).toBe(
      "Kategoria w użyciu"
    );
  });

  it("uses a custom raise's hint as the message", () => {
    expect(errorMessage({ code: "P0001", hint: "Tylko właściciel." })).toBe("Tylko właściciel.");
  });

  it("uses the provided fallback for unknown errors", () => {
    expect(errorMessage({ code: "99999" }, { fallback: "Nie udało się zapisać." })).toBe(
      "Nie udało się zapisać."
    );
  });
});
