/** Bell badge. Zero stays hidden. 9 stays a digit. 100 and above become 99+. */
export function notificationBadgeLabel(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  if (count > 99) return "99+";
  return String(Math.floor(count));
}
