import { expect, it } from "vitest";
import { mobileNavHiddenAfterScroll } from "$lib/navigation-scroll";

it("responds to real scrolling down and up", () => {
  expect(mobileNavHiddenAfterScroll(false, { y: 90, extent: 1500 }, { y: 110, extent: 1500 })).toBe(
    true
  );
  expect(mobileNavHiddenAfterScroll(true, { y: 110, extent: 1500 }, { y: 90, extent: 1500 })).toBe(
    false
  );
});

it("does not reverse the nav when its padding change moves the scroll anchor", () => {
  expect(mobileNavHiddenAfterScroll(true, { y: 150, extent: 1000 }, { y: 70, extent: 920 })).toBe(
    true
  );
  expect(mobileNavHiddenAfterScroll(false, { y: 70, extent: 920 }, { y: 150, extent: 1000 })).toBe(
    false
  );
});

it("reveals the nav at the top and does not hide it again when restoring padding shifts the page", () => {
  const shown = mobileNavHiddenAfterScroll(true, { y: 90, extent: 1000 }, { y: 0, extent: 872 });
  expect(shown).toBe(false);
  expect(mobileNavHiddenAfterScroll(shown, { y: 0, extent: 872 }, { y: 90, extent: 1000 })).toBe(
    false
  );
});
