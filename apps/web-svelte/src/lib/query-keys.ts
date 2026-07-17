type Id = string;

const userNs = (userId: Id) => ["user", userId] as const;

export const qk = {
  transactions: {
    all: (u: Id) => [...userNs(u), "transactions"] as const,
    list: (u: Id, ...parts: unknown[]) => [...userNs(u), "transactions", ...parts] as const,
  },
  profile: (u: Id) => [...userNs(u), "profile"] as const,
  categories: (u: Id) => [...userNs(u), "categories"] as const,
  categorizationRules: (u: Id) => [...userNs(u), "categorization_rules"] as const,
  plans: (u: Id) => [...userNs(u), "plans"] as const,
  plan: (u: Id, id: string) => [...userNs(u), "plan", id] as const,
  planLinks: (u: Id, id?: string) => [...userNs(u), "plan-links", ...(id ? [id] : [])] as const,
  planRanked: (u: Id, id: string, ...p: unknown[]) =>
    [...userNs(u), "plan-ranked", id, ...p] as const,
  planEligible: (u: Id, id?: string) =>
    [...userNs(u), "plan-eligible", ...(id ? [id] : [])] as const,
  planDismissed: (u: Id, id: string) => [...userNs(u), "plan-dismissed", id] as const,
  planProgress: (u: Id) => [...userNs(u), "plan-progress"] as const,
  planProgressList: (u: Id, ...p: unknown[]) => [...userNs(u), "plan-progress-list", ...p] as const,
  planDebtTerms: (u: Id, id?: string) =>
    [...userNs(u), "plan-debt-terms", ...(id ? [id] : [])] as const,
  planDebtTermsList: (u: Id, ...p: unknown[]) =>
    [...userNs(u), "plan-debt-terms-list", ...p] as const,
  planDebtDetect: (u: Id, id?: string, ...p: unknown[]) =>
    [...userNs(u), "plan-debt-detect", ...(id ? [id] : []), ...p] as const,
  planSuggestionCount: (u: Id, id: string) => [...userNs(u), "plan-suggestion-count", id] as const,
  financialSnapshot: (u: Id) => [...userNs(u), "financial-snapshot"] as const,
  cashPosition: (u: Id) => [...userNs(u), "cash-position"] as const,
  netWorthItems: (u: Id) => [...userNs(u), "net-worth-items"] as const,
  userGroups: (u: Id) => [...userNs(u), "user_groups"] as const,
  myGroupRoles: (u: Id) => [...userNs(u), "my-group-roles"] as const,
  groupInvitationsReceived: (u: Id) => [...userNs(u), "group_invitations_received"] as const,
  groupInvitationsSent: (u: Id, gid?: string) =>
    [...userNs(u), "group_invitations_sent", ...(gid ? [gid] : [])] as const,
  groupMembersProfiles: (u: Id, gid?: string) =>
    [...userNs(u), "group_members_profiles", ...(gid ? [gid] : [])] as const,
  notifications: (u: Id) => [...userNs(u), "notifications"] as const,
  actionDismissals: (u: Id) => [...userNs(u), "action-dismissals"] as const,
  importHealth: (u: Id) => [...userNs(u), "import-health"] as const,
  summary: (u: Id) => [...userNs(u), "summary"] as const,
  saveLinkedIds: (u: Id) => [...userNs(u), "plan-save-linked-ids"] as const,
  importRows: (u: Id, sessionId: string) => [...userNs(u), "import-rows", sessionId] as const,
  importPreviewWarnings: (u: Id, sessionId: string) =>
    [...userNs(u), "import_preview_warnings", sessionId] as const,
  bankAccount: (u: Id, accountId: string) => [...userNs(u), "bank_account", accountId] as const,

  /** Public — not user-scoped; safe to share across identities. */
  fx: () => ["fx", "nbp-table-a"] as const,
} as const;
