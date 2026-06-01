// Service layer for bank CSV import.
//
// Wraps the in-flight session lifecycle (preview → commit / cancel)
// around the privacy-aware schema. The only writer of
// transaction_import_links is the commit_import_session RPC; this
// module never INSERTs/UPDATEs/DELETEs that table directly.
//
// All RLS-owned tables (bank_accounts, transaction_import_sessions,
// transaction_import_rows) require user_id explicitly on insert -
// PostgREST does not auto-fill it from the JWT.

import { supabase } from "$lib/supabase";
import type { NormalizedRow } from "$lib/import/banks/types";
import type { Database } from "$lib/supabase.types";

type RowUpdate = Database["public"]["Tables"]["transaction_import_rows"]["Update"];

export type BankKind = "mbank" | "ing";
export type RowDecision = "pending" | "import" | "skip" | "duplicate";

export interface BankAccount {
  id: string;
  user_id: string;
  kind: BankKind;
  label: string;
  currency: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportSession {
  id: string;
  user_id: string;
  bank_account_id: string;
  source_filename: string | null;
  source_file_hash: string;
  detected_kind: BankKind;
  status: "preview" | "committed" | "cancelled";
  rows_total: number;
  rows_committed: number;
  rows_skipped: number;
  rows_duplicate: number;
  created_at: string;
  committed_at: string | null;
}

export interface ImportRow {
  id: string;
  session_id: string;
  row_index: number;
  posted_at: string;
  amount: number;
  type: "income" | "expense";
  description: string;
  counterparty: string | null;
  currency: string;
  external_id: string | null;
  raw_row_hash: string;
  suggested_category_id: string | null;
  selected_category_id: string | null;
  selected_group_id: string | null;
  edited_description: string | null;
  decision: RowDecision;
  duplicate_of: string | null;
  transaction_id: string | null;
  created_at: string;
}

export interface CommitResult {
  inserted: number;
  duplicates_preview: number;
  duplicates_commit: number;
  skipped: number;
  fingerprint_warnings: DuplicateWarning[];
}

export interface DuplicateWarning {
  row_id: string;
  duplicate_of_transaction_id: string;
  duplicate_of_date: string;
  duplicate_of_amount: number;
  duplicate_of_currency: string;
  duplicate_of_description: string;
}

// -------------------- bank_accounts --------------------

/**
 * Find the caller's active account for `kind`, or create one with the
 * given default label. The wizard uses this so the user never has to
 * pick a bank - detection from the CSV is enough. Idempotent: on race
 * the unique idx (user_id, kind) WHERE archived_at IS NULL would block
 * a second insert; we catch that and re-fetch.
 */
export async function findOrCreateActiveAccount(input: {
  kind: BankKind;
  defaultLabel: string;
}): Promise<BankAccount> {
  const existing = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("kind", input.kind)
    .is("archived_at", null)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as BankAccount;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const ins = await supabase
    .from("bank_accounts")
    .insert({ user_id: user.id, kind: input.kind, label: input.defaultLabel })
    .select("*")
    .single();

  if (ins.error) {
    if ((ins.error as { code?: string }).code === "23505") {
      // Race: someone else just created it. Re-fetch.
      const refound = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("kind", input.kind)
        .is("archived_at", null)
        .single();
      if (refound.error) throw refound.error;
      return refound.data as BankAccount;
    }
    throw ins.error;
  }
  return ins.data as BankAccount;
}

export async function fetchBankAccount(id: string): Promise<BankAccount> {
  const { data, error } = await supabase.from("bank_accounts").select("*").eq("id", id).single();
  if (error) throw error;
  return data as BankAccount;
}

// -------------------- sessions --------------------

/**
 * Look up any existing non-cancelled session for the same (account, file_hash).
 * The partial unique index on transaction_import_sessions guarantees at most one
 * such row exists, so the caller cannot just blindly insert a new session - it
 * must resume (preview) or surface "already imported" (committed).
 *
 * Returns the session row regardless of status (preview / committed) so the UI
 * can branch on it. Cancelled sessions are NOT returned: re-upload after cancel
 * is the supported "start fresh" path.
 */
export async function findExistingSession(input: {
  bankAccountId: string;
  sourceFileHash: string;
}): Promise<ImportSession | null> {
  const { data, error } = await supabase
    .from("transaction_import_sessions")
    .select("*")
    .eq("bank_account_id", input.bankAccountId)
    .eq("source_file_hash", input.sourceFileHash)
    .neq("status", "cancelled")
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ImportSession | null;
}

/**
 * Read-only pre-commit probable-dup scan. Calls the SECURITY DEFINER RPC that
 * checks prior imports, shopping-list expenses, and manual/non-list transactions.
 * Result shape mirrors commit-time fingerprint_warnings exactly.
 */
export async function previewFingerprintWarnings(sessionId: string): Promise<DuplicateWarning[]> {
  const { data, error } = await supabase.rpc("preview_fingerprint_warnings", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return data as unknown as DuplicateWarning[];
}

/**
 * Latest still-open ("preview") session for the current user, used to offer a
 * resume entry point after the user left mid-review (issue #66). Discarding a
 * draft soft-cancels it (see cancelImportSession), so cancelled drafts are never
 * returned here.
 */
export async function fetchActivePreviewSession(): Promise<ImportSession | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("transaction_import_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "preview")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ImportSession | null;
}

export async function openImportSession(input: {
  bankAccountId: string;
  sourceFilename: string | null;
  sourceFileHash: string;
  detectedKind: BankKind;
}): Promise<ImportSession> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data, error } = await supabase
    .from("transaction_import_sessions")
    .insert({
      user_id: user.id,
      bank_account_id: input.bankAccountId,
      source_filename: input.sourceFilename,
      source_file_hash: input.sourceFileHash,
      detected_kind: input.detectedKind,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ImportSession;
}

export async function fetchSession(id: string): Promise<ImportSession> {
  const { data, error } = await supabase
    .from("transaction_import_sessions")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as ImportSession;
}

export async function cancelImportSession(id: string): Promise<void> {
  const { error } = await supabase
    .from("transaction_import_sessions")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) throw error;
}

// -------------------- rows --------------------

/**
 * Bulk-insert preview rows for a session. Rows must come from a normalize()
 * pass so raw_row_hash is computed. `rows_total` on the session is updated
 * to match the inserted count.
 *
 * `resolveCategory` optionally pre-fills a category per row (deterministic
 * categorization rules - see import/categorize.ts). When it returns a category
 * id, both suggested_category_id (provenance: the suggestion) and
 * selected_category_id (the editable pick) are set so the row arrives already
 * categorized. Decision stays 'pending' - the user still confirms in review.
 *
 * Intra-batch hard duplicates (same external_id or same row_index in the
 * same session+file_hash) are NOT pre-filtered here - the unique indexes
 * on transaction_import_links catch them at commit time as duplicates_commit.
 */
export async function insertPreviewRows(
  sessionId: string,
  rows: NormalizedRow[],
  resolveCategory?: (row: NormalizedRow) => string | null
): Promise<ImportRow[]> {
  if (rows.length === 0) return [];

  const payload = rows.map((r) => {
    const categoryId = resolveCategory?.(r) ?? null;
    return {
      session_id: sessionId,
      row_index: r.row_index,
      posted_at: r.posted_at,
      amount: r.amount,
      type: r.type,
      description: r.description,
      counterparty: r.counterparty ?? null,
      currency: r.currency,
      external_id: r.external_id ?? null,
      raw_row_hash: r.raw_row_hash,
      suggested_category_id: categoryId,
      selected_category_id: categoryId,
      decision: "pending" as const,
    };
  });

  const { data, error } = await supabase
    .from("transaction_import_rows")
    .insert(payload)
    .select("*");
  if (error) throw error;

  const { error: countErr } = await supabase
    .from("transaction_import_sessions")
    .update({ rows_total: payload.length })
    .eq("id", sessionId);
  if (countErr) throw countErr;

  return (data ?? []) as ImportRow[];
}

export async function fetchSessionRows(sessionId: string): Promise<ImportRow[]> {
  const { data, error } = await supabase
    .from("transaction_import_rows")
    .select("*")
    .eq("session_id", sessionId)
    .order("row_index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ImportRow[];
}

export async function updateRowDecision(
  rowId: string,
  update: {
    decision?: RowDecision;
    selectedCategoryId?: string | null;
    selectedGroupId?: string | null;
    editedDescription?: string | null;
    duplicateOf?: string | null;
  }
): Promise<void> {
  const patch: RowUpdate = {};
  if (update.decision !== undefined) patch.decision = update.decision;
  if (update.selectedCategoryId !== undefined)
    patch.selected_category_id = update.selectedCategoryId;
  if (update.selectedGroupId !== undefined) patch.selected_group_id = update.selectedGroupId;
  if (update.editedDescription !== undefined) patch.edited_description = update.editedDescription;
  if (update.duplicateOf !== undefined) patch.duplicate_of = update.duplicateOf;

  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("transaction_import_rows").update(patch).eq("id", rowId);
  if (error) throw error;
}

// -------------------- commit --------------------

/**
 * Calls the SECURITY DEFINER commit_import_session RPC. The RPC is the sole
 * writer of transaction_import_links and the only path that flips a session
 * from preview → committed.
 *
 * Throws on any validation error (foreign category, non-member group,
 * archived account, kind mismatch, rows_pending, etc.) - full rollback,
 * session stays preview, caller fixes input and retries.
 */
export async function commitImportSession(sessionId: string): Promise<CommitResult> {
  const { data, error } = await supabase.rpc("commit_import_session", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return data as unknown as CommitResult;
}
