/** Reactive session identity for query-key namespacing. Updated only from +layout auth boundary. */
export const session = $state<{ userId: string | null }>({ userId: null });

export function setSessionUser(id: string | null) {
  session.userId = id;
}

export function requireSessionUserId(): string {
  const id = session.userId;
  if (!id) throw new Error("No authenticated user");
  return id;
}
