import { describe, expect, it } from "vitest";
import { polishPluralForm } from "$lib/utils/polish-plural";

describe("polishPluralForm", () => {
  it("uses one for 1", () => {
    expect(polishPluralForm(1)).toBe("one");
  });

  it("uses few for 2-4 except teens", () => {
    expect(polishPluralForm(2)).toBe("few");
    expect(polishPluralForm(4)).toBe("few");
    expect(polishPluralForm(22)).toBe("few");
  });

  it("uses many for 5+ and 12-14", () => {
    expect(polishPluralForm(5)).toBe("many");
    expect(polishPluralForm(8)).toBe("many");
    expect(polishPluralForm(12)).toBe("many");
    expect(polishPluralForm(21)).toBe("many");
  });
});
