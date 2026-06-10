import type { Json } from "$lib/supabase.types";

export type TransactionType = "income" | "expense";
export type TransactionStatus = "paid" | "draft" | "upcoming" | "overdue";
export type InvitationStatus = "pending" | "accepted" | "rejected" | "cancelled";
export type UserRole = "user" | "admin";

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export type CategorizationRuleKind = "exact" | "contains" | "type" | "composite";

export interface CategorizationRule {
  id: string;
  user_id: string;
  kind: CategorizationRuleKind;
  match_description: string | null;
  match_counterparty: string | null;
  match_type: TransactionType | null;
  match_day_of_month?: number | null;
  category_id: string;
  priority: number;
  created_at: string;
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface Transaction {
  id: string;
  amount: number;
  currency: string;
  counterparty: string | null;
  description: string;
  date: string;
  type: TransactionType;
  status: TransactionStatus;
  category_id: string;
  user_id: string;
  is_recurring: boolean;
  recurring_day: number | null;
  recurrence_frequency: RecurrenceFrequency | null;
  recurrence_interval: number;
  recurrence_weekday: number | null;
  recurrence_month: number | null;
  recurring_template_id: string | null;
  group_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionWithCategory extends Transaction {
  category_name: string;
  category_type: TransactionType;
}

export interface CategorySummary {
  category_id: string;
  category_name: string;
  type: TransactionType;
  total: number;
  percentage: number;
  transaction_count: number;
}

export interface MonthlySummary {
  total_income: number;
  total_expenses: number;
  net: number;
  categories: CategorySummary[];
}

export interface ProfileSettings {
  notificationsEnabled?: boolean;
  accentColor?: string;
  alerts?: {
    bankImportReminder?: {
      enabled: boolean;
      cadenceDays: 7 | 14 | 30;
    };
  };
  [key: string]: Json | undefined;
}

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  settings: ProfileSettings;
  created_at: string;
  updated_at: string;
}

export interface UserGroup {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export type GroupMemberRole = "owner" | "co_owner" | "member";

export interface GroupMember {
  group_id: string;
  user_id: string;
  joined_at: string;
  role?: GroupMemberRole;
}

export interface GroupMemberWithProfile {
  user_id: string;
  joined_at: string;
  email: string;
  name: string | null;
  role?: GroupMemberRole;
}

export interface GroupInvitation {
  id: string;
  group_id: string;
  group_name: string;
  invited_user_email: string;
  invited_user_id: string | null;
  created_by: string;
  status: InvitationStatus;
  created_at: string;
  updated_at: string;
}

export type PlanKind = "spend" | "save" | "debt";

export interface Plan {
  id: string;
  name: string;
  user_id: string;
  group_id: string | null;
  category_id: string | null;
  kind: PlanKind;
  budget_amount: number | null;
  target_amount: number | null;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export interface PlanDebtTerms {
  plan_id: string;
  original_amount: number;
  current_balance: number;
  annual_rate: number;
  monthly_payment: number;
  payment_day: number | null;
  anchor_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PlanBucket = "upcoming" | "active" | "finished";

export interface PlanSummary extends Plan {
  spentAmount: number;
  incomeAmount: number;
  savedAmount: number;
  linkedCount: number;
  eligibleCount: number;
  monthlyNeeded: number | null;
  monthlyActual: number | null;
  /** How monthlyActual was derived - "historical-average" is an estimate, not demonstrated pace. */
  monthlyActualBasis?: "none" | "current-month" | "historical-average";
  bucket: PlanBucket;
}

export interface FinancialSnapshot {
  user_id: string;
  as_of_date: string;
  cash_amount: number;
  investments_amount: number;
  real_estate_amount: number;
  created_at: string;
  updated_at: string;
}

export interface NetWorthSummary {
  hasSnapshot: boolean;
  asOfDate: string | null;
  cash: number;
  investments: number;
  realEstate: number;
  totalAssets: number;
  totalDebt: number;
  netWorth: number;
}

export type NotificationType =
  | "transaction_summary"
  | "transaction_upcoming"
  | "transaction_overdue"
  | "transaction_reminder"
  | "bank_import_reminder"
  | "group_invitation"
  | "system_notification";

export type NotificationData =
  | { type: "group_invitation"; groupId: string; groupName: string; inviterEmail: string }
  | { type: "transaction_summary"; period: string; totalExpenses: number }
  | {
      type: "transaction_upcoming" | "transaction_overdue" | "transaction_reminder";
      transactionId: string;
      amount: number;
    }
  | {
      type: "bank_import_reminder";
      cadenceDays: 7 | 14 | 30;
      latestImportSessionId: string | null;
      latestImportSessionKey?: string;
      latestImportCommittedAt: string | null;
      reminderWindowKey?: string;
    }
  | { type: "system_notification"; message: string };

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: NotificationData | null;
  read_at: string | null;
  created_at: string;
}
