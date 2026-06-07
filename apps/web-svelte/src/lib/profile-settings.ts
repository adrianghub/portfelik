import type { ProfileSettings } from "$lib/types";

export type ImportReminderCadence = 7 | 14 | 30;

export function normalizeImportReminderCadence(raw: unknown): ImportReminderCadence {
  const n = Number(raw);
  if (n === 14 || n === 30) return n;
  return 7;
}

export function getBankImportReminder(settings: ProfileSettings | undefined): {
  enabled: boolean;
  cadenceDays: ImportReminderCadence;
} {
  const raw = settings?.alerts?.bankImportReminder;
  return {
    enabled: Boolean(raw?.enabled),
    cadenceDays: normalizeImportReminderCadence(raw?.cadenceDays),
  };
}
