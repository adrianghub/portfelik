// Preset avatar personalization. The selected id is stored as
// `profiles.settings.avatarPresetId` (jsonb, already user-writable) and the
// image is a bundled static PNG served from `/avatars/<id>.png`. Absence of a
// selection falls back to the OAuth photo, then to initials.
//
// Assets are memoji-style 2D avatars vendored from github.com/alohe/avatars
// (MIT). See static/avatars/README.md.

export const AVATAR_PRESET_IDS = [
  "avatar-1",
  "avatar-2",
  "avatar-3",
  "avatar-4",
  "avatar-5",
  "avatar-6",
  "avatar-7",
  "avatar-8",
  "avatar-9",
  "avatar-10",
] as const;

export type AvatarPresetId = (typeof AVATAR_PRESET_IDS)[number];

export function isAvatarPreset(id: string | null | undefined): id is AvatarPresetId {
  return !!id && (AVATAR_PRESET_IDS as readonly string[]).includes(id);
}

/** Static path for a preset avatar, or null if the id is not a known preset. */
export function avatarSrc(id: string | null | undefined): string | null {
  return isAvatarPreset(id) ? `/avatars/${id}.png` : null;
}
