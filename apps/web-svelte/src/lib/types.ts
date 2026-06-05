import type { Json } from "$lib/supabase.types";

export type TransactionType = "income" | "expense";
export type TransactionStatus = "paid" | "draft" | "upcoming" | "overdue";
export type ShoppingListStatus = "active" | "completed";
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
  description: string;
  date: string;
  type: TransactionType;
  status: TransactionStatus;
  category_id: string;
  user_id: string;
  shopping_list_id: string | null;
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

export interface GroupMember {
  group_id: string;
  user_id: string;
  joined_at: string;
}

export interface GroupMemberWithProfile {
  user_id: string;
  joined_at: string;
  email: string;
  name: string | null;
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

export interface ShoppingListItem {
  id: string;
  shopping_list_id: string;
  name: string;
  completed: boolean;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ShoppingItemCategory {
  id: string;
  user_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ShoppingList {
  id: string;
  name: string;
  status: ShoppingListStatus;
  user_id: string;
  group_id: string | null;
  category_id: string | null;
  total_amount: number | null;
  completed_at: string | null;
  planned_for: string;
  shopping_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ShoppingListMode = "planning" | "shopping" | "done";
export type ShoppingListBucket = "upcoming" | "active" | "archived";

export interface ShoppingListWithItems extends ShoppingList {
  shopping_list_items: ShoppingListItem[];
  linked_transaction_id?: string | null;
}

export interface ShoppingListSummary extends ShoppingList {
  item_total: number;
  item_completed: number;
  linked_transaction_id: string | null;
  bucket: ShoppingListBucket;
  mode: ShoppingListMode;
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
