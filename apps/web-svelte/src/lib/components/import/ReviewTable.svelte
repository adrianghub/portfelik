<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import Button from "$lib/components/ui/Button.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchUserGroups } from "$lib/services/groups";
  import {
    commitImportSession,
    fetchSessionRows,
    previewFingerprintWarnings,
    updateRowDecision,
    type CommitResult,
    type ImportRow,
    type ImportSession,
    type RowDecision,
  } from "$lib/services/bank-import";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { toast } from "svelte-sonner";
  import { formatCurrency } from "$lib/utils";

  interface Props {
    session: ImportSession;
    onCommitted: (result: CommitResult) => void;
    onCancel: () => Promise<void> | void;
  }
  let { session, onCommitted, onCancel }: Props = $props();

  const LARGE_THRESHOLD = 500;
  const queryClient = useQueryClient();

  const rowsKey = $derived(["import_session_rows", session.id]);

  const rowsQuery = createQuery(() => ({
    queryKey: rowsKey,
    queryFn: () => fetchSessionRows(session.id),
  }));

  const categoriesQuery = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  }));

  const groupsQuery = createQuery(() => ({
    queryKey: ["user_groups"],
    queryFn: fetchUserGroups,
  }));

  const warningsQuery = createQuery(() => ({
    queryKey: ["import_preview_warnings", session.id],
    queryFn: () => previewFingerprintWarnings(session.id),
  }));

  const warningsByRow = $derived(
    new Map((warningsQuery.data ?? []).map((w) => [w.row_id, w.duplicate_of_transaction_id]))
  );

  const rows = $derived<ImportRow[]>(rowsQuery.data ?? []);
  const pendingCount = $derived(rows.filter((r) => r.decision === "pending").length);
  const canCommit = $derived(rows.length > 0 && pendingCount === 0);

  function categoriesFor(type: "income" | "expense") {
    return (categoriesQuery.data ?? []).filter((c) => c.type === type);
  }

  /**
   * Optimistic patch + automatic decision flip on category set/clear:
   *   * setting a category on a 'pending' row → decision='import'
   *   * clearing the category on an 'import' row → decision='pending'
   * Lets users sweep through with category picks alone; no need to also
   * touch the decision column.
   */
  async function patchRow(rowId: string, patch: Partial<ImportRow>): Promise<void> {
    const previous = queryClient.getQueryData<ImportRow[]>(rowsKey);
    const current = previous?.find((r) => r.id === rowId);

    let effective: Partial<ImportRow> = patch;
    if (current && "selected_category_id" in patch) {
      const becameSet = patch.selected_category_id != null && current.selected_category_id == null;
      const becameCleared =
        patch.selected_category_id == null && current.selected_category_id != null;
      if (becameSet && current.decision === "pending") {
        effective = { ...effective, decision: "import" };
      } else if (becameCleared && current.decision === "import") {
        effective = { ...effective, decision: "pending" };
      }
    }

    if (previous) {
      queryClient.setQueryData<ImportRow[]>(
        rowsKey,
        previous.map((r) => (r.id === rowId ? { ...r, ...effective } : r))
      );
    }
    try {
      await updateRowDecision(rowId, {
        decision: effective.decision,
        selectedCategoryId:
          effective.selected_category_id === undefined ? undefined : effective.selected_category_id,
        selectedGroupId:
          effective.selected_group_id === undefined ? undefined : effective.selected_group_id,
        editedDescription:
          effective.edited_description === undefined ? undefined : effective.edited_description,
        duplicateOf: effective.duplicate_of === undefined ? undefined : effective.duplicate_of,
      });
    } catch (e) {
      if (previous) queryClient.setQueryData(rowsKey, previous);
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function bulkImportValid(): Promise<void> {
    const targets = rows.filter((r) => r.selected_category_id !== null && r.decision !== "import");
    await Promise.all(targets.map((r) => patchRow(r.id, { decision: "import" })));
  }

  async function bulkSkipAll(): Promise<void> {
    const targets = rows.filter((r) => r.decision !== "skip");
    await Promise.all(targets.map((r) => patchRow(r.id, { decision: "skip" })));
  }

  async function bulkSkipProbableDuplicates(): Promise<void> {
    const flagged = rows.filter((r) => warningsByRow.has(r.id) && r.decision !== "duplicate");
    await Promise.all(
      flagged.map((r) =>
        patchRow(r.id, {
          decision: "duplicate",
          duplicate_of: warningsByRow.get(r.id) ?? null,
        })
      )
    );
  }

  const commitMut = createMutation(() => ({
    mutationFn: () => commitImportSession(session.id),
    onSuccess: (result) => {
      onCommitted(result);
    },
    onError: (err: { message: string; details?: string | null }) => {
      const msg = err.message ?? "";
      if (msg.includes("account_invalid")) toast.error(m.bank_commit_error_account_invalid());
      else if (msg.includes("account_kind_mismatch"))
        toast.error(m.bank_commit_error_kind_mismatch());
      else if (msg.includes("rows_pending")) toast.error(m.bank_commit_error_rows_pending());
      else if (msg.includes("category_invalid") || msg.includes("category_required"))
        toast.error(m.bank_commit_error_category_invalid());
      else if (msg.includes("group_forbidden")) toast.error(m.bank_commit_error_group_forbidden());
      else toast.error(m.bank_commit_error_generic());
    },
  }));
</script>

<div class="space-y-4 pb-24">
  <!-- Sticky top bar: warnings + bulk actions. Stays in view while
       scrolling through a long preview list. -->
  <div class="sticky top-0 z-20 -mx-4 space-y-2 bg-slate-950/85 px-4 py-2 backdrop-blur">
    {#if rows.length > LARGE_THRESHOLD}
      <p
        class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
      >
        {m.bank_review_large_warning({ count: rows.length })}
      </p>
    {/if}

    {#if pendingCount > 0}
      <p
        class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
      >
        {m.bank_review_pending_warning({ count: pendingCount })}
      </p>
    {/if}

    <div class="flex flex-wrap gap-2">
      <Button variant="ghost" size="sm" onclick={bulkImportValid}>
        {m.bank_review_bulk_import_valid()}
      </Button>
      <Button variant="ghost" size="sm" onclick={bulkSkipAll}>
        {m.bank_review_bulk_skip_all()}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={warningsByRow.size === 0}
        onclick={bulkSkipProbableDuplicates}
      >
        {m.bank_review_bulk_skip_duplicates()}
      </Button>
    </div>
  </div>

  <div class="overflow-x-auto rounded-2xl border border-white/10">
    <table class="min-w-full divide-y divide-white/5 text-sm">
      <thead class="bg-slate-900/95 text-xs text-slate-400 uppercase">
        <tr>
          <th class="px-3 py-2 text-left">{m.bank_review_header_date()}</th>
          <th class="px-3 py-2 text-right">{m.bank_review_header_amount()}</th>
          <th class="px-3 py-2 text-left">{m.bank_review_header_description()}</th>
          <th class="px-3 py-2 text-left">{m.bank_review_header_category()}</th>
          <th class="px-3 py-2 text-left">{m.bank_review_header_group()}</th>
          <th class="px-3 py-2 text-left">{m.bank_review_header_decision()}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-white/5 bg-slate-950/40">
        {#each rows as row (row.id)}
          <tr>
            <td class="px-3 py-2 align-top whitespace-nowrap text-slate-300">{row.posted_at}</td>
            <td
              class="px-3 py-2 text-right align-top tabular-nums"
              class:text-rose-300={row.type === "expense"}
              class:text-emerald-300={row.type === "income"}
            >
              {row.type === "expense" ? "-" : "+"}{formatCurrency(row.amount, row.currency)}
            </td>
            <td class="max-w-xs px-3 py-2 align-top">
              {#if warningsByRow.has(row.id)}
                <div class="mb-1">
                  <Badge variant="overdue">{m.bank_review_probable_duplicate()}</Badge>
                </div>
              {/if}
              {#if row.counterparty}
                <p class="text-sm font-medium text-slate-100">{row.counterparty}</p>
                <p class="text-xs text-slate-400">{row.edited_description ?? row.description}</p>
              {:else}
                <Input
                  value={row.edited_description ?? row.description}
                  onchange={(e) => {
                    const v = (e.target as HTMLInputElement).value.trim();
                    void patchRow(row.id, {
                      edited_description: v === "" || v === row.description ? null : v,
                    });
                  }}
                />
              {/if}
            </td>
            <td class="px-3 py-2 align-top">
              <Select
                value={row.selected_category_id ?? ""}
                onchange={(e) => {
                  const v = (e.target as HTMLSelectElement).value;
                  void patchRow(row.id, { selected_category_id: v === "" ? null : v });
                }}
              >
                <option value="">—</option>
                {#each categoriesFor(row.type) as c (c.id)}
                  <option value={c.id}>{c.name}</option>
                {/each}
              </Select>
            </td>
            <td class="px-3 py-2 align-top">
              <Select
                value={row.selected_group_id ?? ""}
                onchange={(e) => {
                  const v = (e.target as HTMLSelectElement).value;
                  void patchRow(row.id, { selected_group_id: v === "" ? null : v });
                }}
              >
                <option value="">{m.bank_review_group_own()}</option>
                {#each groupsQuery.data ?? [] as g (g.id)}
                  <option value={g.id}>{g.name}</option>
                {/each}
              </Select>
            </td>
            <td class="px-3 py-2 align-top">
              <Select
                value={row.decision}
                onchange={(e) => {
                  const v = (e.target as HTMLSelectElement).value as RowDecision;
                  void patchRow(row.id, { decision: v });
                }}
              >
                <option value="pending">{m.bank_review_decision_pending()}</option>
                <option value="import">{m.bank_review_decision_import()}</option>
                <option value="skip">{m.bank_review_decision_skip()}</option>
                <option value="duplicate">{m.bank_review_decision_duplicate()}</option>
              </Select>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Sticky bottom commit bar — always reachable on mobile + long lists. -->
  <div
    class="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 bg-slate-950/90 px-4 py-3 backdrop-blur"
  >
    <Button variant="ghost" onclick={() => void onCancel()}>
      {m.bank_review_cancel()}
    </Button>
    <Button
      variant="primary"
      disabled={!canCommit || commitMut.isPending}
      loading={commitMut.isPending}
      onclick={() => commitMut.mutate()}
    >
      {commitMut.isPending ? m.bank_commit_running() : m.bank_review_commit()}
    </Button>
  </div>
</div>
