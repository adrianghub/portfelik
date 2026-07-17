import type { GroupMemberRole, TransactionStatus, TransactionWithCategory } from "$lib/types";

/** Rows that quick-settle ("mark paid") can act on - a planned/overdue obligation, not yet settled. */
export function isQuickSettleEligible(status: TransactionStatus): boolean {
  return status === "upcoming" || status === "overdue";
}

/** Mirrors transaction RLS: private creator; group creator while member; owner/co-owner. */
export function canManageTransaction(
  tx: Pick<TransactionWithCategory, "user_id" | "group_id">,
  currentUserId: string,
  groupRoles: Map<string, GroupMemberRole>
): boolean {
  if (tx.group_id) {
    const role = groupRoles.get(tx.group_id);
    if (role === "owner" || role === "co_owner") return true;
    if (tx.user_id === currentUserId) return role !== undefined;
    return false;
  }
  return tx.user_id === currentUserId;
}
