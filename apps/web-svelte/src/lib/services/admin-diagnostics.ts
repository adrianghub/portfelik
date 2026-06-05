import { supabase } from "$lib/supabase";

export interface MaskedTransactionDiagnostics {
  transaction_id: string;
  user_token: string;
  group_token: string | null;
  category_token: string | null;
  type: "income" | "expense";
  status: string;
  date_month: string;
  amount_bucket: string;
  currency: string;
  description_masked: string | null;
  merchant_token: string | null;
  source_kind: string | null;
  created_at: string;
}

export interface MaskedImportSessionDiagnostics {
  session_id: string;
  user_token: string;
  adapter_kind: string;
  source_kind: string;
  status: string;
  source_label_masked: string | null;
  rows_total: number;
  rows_committed: number;
  rows_skipped: number;
  rows_duplicate: number;
  created_at: string;
  committed_at: string | null;
}

export interface MaskedUserContextDiagnostics {
  user_token: string;
  email_masked: string | null;
  display_name_masked: string | null;
  role: string;
  group_count: number;
  created_at: string;
}

async function call<T>(fn: string, args: Record<string, string>): Promise<T | null> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return (data as T) ?? null;
}

export const fetchMaskedTransaction = (id: string) =>
  call<MaskedTransactionDiagnostics>("admin_masked_transaction_by_id", { p_transaction_id: id });

export const fetchMaskedImportSession = (id: string) =>
  call<MaskedImportSessionDiagnostics>("admin_masked_import_session_by_id", { p_session_id: id });

export const fetchMaskedUserContext = (id: string) =>
  call<MaskedUserContextDiagnostics>("admin_masked_user_context_by_id", { p_user_id: id });
