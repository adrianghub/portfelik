import { describe, expect, it } from "vitest";
import { decisionForRow } from "$lib/import/holds";

describe("decisionForRow", () => {
  it("non-hold rows import by default", () => {
    expect(decisionForRow({ type: "expense" })).toBe("import");
    expect(decisionForRow({ type: "income" })).toBe("import");
  });

  it("expense holds are pending (block commit until decided)", () => {
    expect(decisionForRow({ is_hold: true, type: "expense" })).toBe("pending");
  });

  it("releases (income holds) default to skip", () => {
    expect(decisionForRow({ is_hold: true, type: "income" })).toBe("skip");
  });
});
