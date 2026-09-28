export function isCommittedImportStale(input: {
  enabled: boolean;
  committedAt: string | null;
  cadenceDays: number;
  now: Date;
}): boolean {
  if (!input.enabled || !input.committedAt) return false;
  const committed = new Date(input.committedAt);
  const days = Math.floor((input.now.getTime() - committed.getTime()) / (1000 * 60 * 60 * 24));
  return days >= input.cadenceDays;
}
