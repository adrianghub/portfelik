import { describe, expect, it } from "vitest";
import * as m from "$lib/paraglide/messages";
import { classifyError, errorMessage, ValidationError } from "$lib/services/supabase-errors";

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

  it("P0001 detail is the raw domain code, never the English hint", () => {
    const r = classifyError({
      code: "P0001",
      message: "transaction_outside_plan_period",
      hint: "Linked transactions must fall within the plan period.",
    });
    expect(r.kind).toBe("custom");
    expect(r.detail).toBe("transaction_outside_plan_period");
    expect(r.detail).not.toContain("Linked transactions");
  });

  it("falls back to generic for unknown / empty", () => {
    expect(classifyError({ code: "99999" }).kind).toBe("generic");
    expect(classifyError(null).kind).toBe("generic");
  });
});

describe("errorMessage — P0001 mapping", () => {
  it("prefers a per-code override", () => {
    expect(errorMessage({ code: "23503" }, { overrides: { "23503": "Kategoria w użyciu" } })).toBe(
      "Kategoria w użyciu"
    );
  });

  it("maps a known domain code to its Polish copy, not the raw hint/code", () => {
    const msg = errorMessage({
      code: "P0001",
      message: "transaction_outside_plan_period",
      hint: "Linked transactions must fall within the plan period.",
    });
    expect(msg).toBe(m.error_plan_link_outside_period());
    expect(msg).not.toContain("_");
    expect(msg).not.toContain("Linked transactions");
  });

  it("maps the not_authorized family to the permission message", () => {
    expect(errorMessage({ code: "P0001", message: "not_authorized_plan" })).toBe(
      m.error_permission()
    );
  });

  it("never leaks an unmapped snake_case P0001 code — uses generic fallback", () => {
    expect(errorMessage({ code: "P0001", message: "session_not_committable" })).toBe(
      m.error_generic()
    );
  });

  it("honours a per-call override for P0001 over the built-in map", () => {
    expect(
      errorMessage(
        { code: "P0001", message: "plan_not_found" },
        { overrides: { P0001: "Własny komunikat" } }
      )
    ).toBe("Własny komunikat");
  });

  it("uses the provided fallback for unknown errors", () => {
    expect(errorMessage({ code: "99999" }, { fallback: "Nie udało się zapisać." })).toBe(
      "Nie udało się zapisać."
    );
  });
});

describe("errorMessage — ValidationError preserves user-facing copy", () => {
  it("renders the ValidationError message verbatim", () => {
    expect(errorMessage(new ValidationError(m.bank_review_rule_edit_require_condition()))).toBe(
      m.bank_review_rule_edit_require_condition()
    );
  });

  it("plain Error with an internal code does not leak — generic fallback", () => {
    expect(errorMessage(new Error("no_rule"))).toBe(m.error_generic());
  });
});
