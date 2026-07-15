export type SummarySchedule = "manual" | "monday" | "after_import_reminder";

interface SummaryNotificationDataInput {
  windowStart: string;
  windowEnd: string;
  userCount: number;
  txCount: number;
  schedule: SummarySchedule;
}

export function activeUsersPhrase(count: number): string {
  if (count === 0) return "Na razie nikt nie dodał transakcji";
  if (count === 1) return "1 aktywna osoba";
  const lastTwo = count % 100;
  const last = count % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return `${count} aktywne osoby`;
  }
  return `${count} aktywnych osób`;
}

export function transactionsPhrase(count: number): string {
  if (count === 1) return "1 transakcja";
  const lastTwo = count % 100;
  const last = count % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return `${count} transakcje`;
  }
  return `${count} transakcji`;
}

export function buildSummaryBody(txCount: number, userCount: number): string {
  const users = activeUsersPhrase(userCount);
  return `Ostatnie 7 dni: ${transactionsPhrase(txCount)} - ${users}.`;
}

export function buildSummaryNotificationData({
  windowStart,
  windowEnd,
  userCount,
  txCount,
  schedule,
}: SummaryNotificationDataInput): SummaryNotificationDataInput {
  return { windowStart, windowEnd, userCount, txCount, schedule };
}
