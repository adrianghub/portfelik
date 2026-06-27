import { describe, expect, it } from "vitest";
import {
  AVATAR_PRESET_IDS,
  avatarSrc,
  isAvatarPreset,
} from "../../src/lib/theme/avatar-presets";

describe("avatar-presets", () => {
  it("recognizes known preset ids", () => {
    expect(isAvatarPreset("avatar-1")).toBe(true);
    expect(isAvatarPreset("avatar-10")).toBe(true);
    expect(AVATAR_PRESET_IDS).toHaveLength(10);
  });

  it("rejects unknown / empty ids", () => {
    expect(isAvatarPreset("avatar-11")).toBe(false);
    expect(isAvatarPreset(null)).toBe(false);
    expect(isAvatarPreset(undefined)).toBe(false);
    expect(isAvatarPreset("")).toBe(false);
  });

  it("resolves preset ids to a static path, others to null", () => {
    expect(avatarSrc("avatar-3")).toBe("/avatars/avatar-3.png");
    expect(avatarSrc("nope")).toBeNull();
    expect(avatarSrc(null)).toBeNull();
  });
});
