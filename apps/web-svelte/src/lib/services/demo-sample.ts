import { supabase } from "$lib/supabase";
import { isDemoAccountUser } from "$lib/demo/identity-session";
import { DEMO_SAMPLE_URL, demoSampleCategory, prepareDemoSample } from "$lib/demo/sample";
import { createCategory, fetchCategories } from "$lib/services/categories";
import { fetchTransactionCount } from "$lib/services/transactions";
import {
  commitImportSession,
  fetchSessionRows,
  findExistingSession,
  findOrCreateActiveAccount,
  insertPreviewRows,
  markPreviewDuplicates,
  openImportSession,
  updatePreviewCategories,
  updatePreviewRowCount,
} from "$lib/services/bank-import";

const running = new Map<string, Promise<{ inserted: number; total: number }>>();

async function requireDemo(expectedId?: string) {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user || !isDemoAccountUser(data.user) || (expectedId && data.user.id !== expectedId)) {
    throw new Error("demo_account_required");
  }
  return data.user.id;
}

/** Read-only status also detects interrupted finalization when an anchor pre-existed. */
export async function fetchDemoSampleReceipt(sessionId: string) {
  const { data, error } = await supabase
    .from("demo_sample_receipts")
    .select("cleared_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function finish(sessionId: string, userId: string) {
  await requireDemo(userId);
  const { error } = await supabase.rpc("finish_demo_sample", { p_session_id: sessionId });
  if (error) throw error;
}

async function fill(userId: string): Promise<{ inserted: number; total: number }> {
  await requireDemo(userId);
  const response = await fetch(DEMO_SAMPLE_URL);
  if (!response.ok) throw new Error("demo_sample_unavailable");
  const file = await prepareDemoSample(await response.arrayBuffer());
  const account = await findOrCreateActiveAccount({
    kind: "erste",
    defaultLabel: "Przykładowe dane",
  });
  let session = await findExistingSession({
    bankAccountId: account.id,
    sourceFileHash: file.sourceFileHash,
  });
  const count = await fetchTransactionCount();
  if (session?.status === "committed" && count >= 96) {
    await finish(session.id, userId);
    return { inserted: 0, total: 96 };
  }
  // Deletion preserves committed audit history. A deliberate fill on an empty
  // ledger creates a new preview instead of rewriting/cancelling that history.
  if (session?.status === "committed" && count === 0) session = null;
  if (count !== 0) throw new Error("demo_sample_ledger_not_empty");

  // Resolve only this demo's active categories. Missing fixture categories use
  // the normal user-owned category service; a unique index resolves tab races.
  let categories = await fetchCategories();
  for (const row of file.rows) {
    const name = demoSampleCategory(row);
    if (
      categories.some(
        (c) => c.name === name && c.type === row.type && c.user_id === userId && !c.archived_at
      )
    )
      continue;
    await requireDemo(userId);
    try {
      categories.push(await createCategory({ name, type: row.type }));
    } catch (error) {
      categories = await fetchCategories();
      if (
        !categories.some(
          (c) => c.name === name && c.type === row.type && c.user_id === userId && !c.archived_at
        )
      )
        throw error;
    }
  }
  const categoryFor = (row: (typeof file.rows)[number]) =>
    categories.find(
      (c) =>
        c.name === demoSampleCategory(row) &&
        c.type === row.type &&
        c.user_id === userId &&
        !c.archived_at
    )?.id ?? null;
  if (file.rows.some((row) => !categoryFor(row))) throw new Error("demo_sample_category_missing");
  await requireDemo(userId);
  if (!session) {
    try {
      session = await openImportSession({
        bankAccountId: account.id,
        sourceFilename: "jakstoimy-demo.csv",
        sourceFileHash: file.sourceFileHash,
        adapterKind: "erste",
      });
    } catch (error) {
      session = await findExistingSession({
        bankAccountId: account.id,
        sourceFileHash: file.sourceFileHash,
      });
      if (!session) throw error;
    }
  }
  if (session.status === "committed") {
    await requireDemo(userId);
    await finish(session.id, userId);
    return { inserted: 0, total: 96 };
  }
  let rows = await fetchSessionRows(session.id);
  if (!rows.length) {
    try {
      rows = await insertPreviewRows(session.id, file.rows, categoryFor);
    } catch (error) {
      // A lost response or another tab may have completed the atomic bulk insert.
      rows = await fetchSessionRows(session.id);
      if (rows.length !== 96) throw error;
    }
  }
  if (
    rows.length !== 96 ||
    rows.some((row) => {
      const original = file.rows.find((r) => r.row_index === row.row_index);
      return (
        !original ||
        original.raw_row_hash !== row.raw_row_hash ||
        row.edited_description ||
        row.selected_group_id ||
        row.decision === "skip"
      );
    })
  )
    throw new Error("demo_sample_preview_needs_review");
  // Resume a known fixture draft without changing its amounts, dates or source.
  await updatePreviewRowCount(session.id, 96);
  await updatePreviewCategories(
    session.id,
    rows.map((row) => ({
      rowId: row.id,
      categoryId: categoryFor(file.rows.find((r) => r.row_index === row.row_index)!)!,
    }))
  );
  await markPreviewDuplicates(session.id);
  await requireDemo(userId);
  // The production RPC remains the only writer of ledger rows and provenance.
  // Its row locks and hard file/row uniqueness remain the final race protection.
  let inserted = 0;
  try {
    inserted = (await commitImportSession(session.id)).inserted;
  } catch (error) {
    const completed = await findExistingSession({
      bankAccountId: account.id,
      sourceFileHash: file.sourceFileHash,
    });
    if (completed?.status !== "committed") throw error;
  }
  // Finalization validates the 96 provenance-linked bank rows, not the whole
  // ledger (another tab may already have added the three unpaid operations).
  await requireDemo(userId);
  await finish(session.id, userId);
  return { inserted, total: 96 };
}

/** Same-tab coalescing + cross-tab Web Lock; SQL uniqueness/RPC protects every client. */
export async function fillDemoSample(): Promise<{ inserted: number; total: number }> {
  const userId = await requireDemo();
  const existing = running.get(userId);
  if (existing) return existing;
  const work =
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request(`demo-sample:${userId}`, () => fill(userId))
      : fill(userId);
  running.set(userId, work);
  try {
    return await work;
  } finally {
    if (running.get(userId) === work) running.delete(userId);
  }
}
