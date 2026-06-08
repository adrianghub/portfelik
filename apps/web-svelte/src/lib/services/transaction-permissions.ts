import type { GroupMemberRole, TransactionWithCategory } from "$lib/types";

/** Mirrors transaction RLS: creator or group owner/co-owner may write. */
export function canManageTransaction(
  tx: Pick<TransactionWithCategory, "user_id" | "group_id">,
  currentUserId: string,
  groupRoles: Map<string, GroupMemberRole>
): boolean {
  if (tx.user_id === currentUserId) return true;
  if (!tx.group_id) return false;
  const role = groupRoles.get(tx.group_id);
  return role === "owner" || role === "co_owner";
}
