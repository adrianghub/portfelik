<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import Button from "$lib/components/ui/Button.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import type { ImportRow } from "$lib/services/bank-import";
  import type { DuplicateWarning } from "$lib/services/bank-import";
  import { cn, formatCurrency } from "$lib/utils";

  interface Props {
    loading?: boolean;
    flaggedRows: ImportRow[];
    warningsByRow: Map<string, DuplicateWarning>;
    duplicateDetail: (rowId: string) => string | null;
    onImportAnyway: (row: ImportRow) => void;
    onRestoreAll: () => void;
    onNext: () => void;
  }

  let {
    loading = false,
    flaggedRows,
    warningsByRow,
    duplicateDetail,
    onImportAnyway,
    onRestoreAll,
    onNext,
  }: Props = $props();

  const count = $derived(flaggedRows.length);
  const anyRestorable = $derived(
    flaggedRows.some((r) => r.decision === "duplicate" && warningsByRow.has(r.id))
  );
</script>

<div class="space-y-4">
  {#if loading}
    <p class="rounded-xl border border-white/10 bg-slate-900/40 px-4 py-3 text-sm text-slate-400">
      {m.bank_review_dup_checking()}
    </p>
  {:else if count === 0}
    <EmptyState title={m.bank_review_dup_none_title()} body={m.bank_review_dup_none_body()} />
  {:else}
    <div class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <p class="text-sm font-medium text-amber-100">
        {m.bank_review_dup_summary({ count })}
      </p>
      <p class="mt-1 text-xs text-amber-200/90">{m.bank_review_dup_summary_hint()}</p>
    </div>

    {#if anyRestorable}
      <div class="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onclick={onRestoreAll}>
          {m.bank_review_dup_restore_all()}
        </Button>
      </div>
    {/if}

    <ul class="space-y-2">
      {#each flaggedRows as row (row.id)}
        <li class="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-slate-100">
                {row.counterparty ?? row.edited_description ?? row.description}
              </p>
              <p class="mt-0.5 text-xs text-slate-500">{row.posted_at}</p>
              {#if duplicateDetail(row.id)}
                <p class="mt-1 text-xs text-amber-200/80">{duplicateDetail(row.id)}</p>
              {/if}
            </div>
            <div class="flex shrink-0 flex-col items-end gap-2">
              <span
                class={cn(
                  "text-sm font-semibold tabular-nums",
                  row.type === "income" ? "text-emerald-300" : "text-rose-300"
                )}
              >
                {row.type === "income" ? "+" : "−"}{formatCurrency(row.amount, row.currency)}
              </span>
              <Badge variant="overdue">{m.bank_review_probable_duplicate()}</Badge>
            </div>
          </div>
          {#if row.decision === "duplicate"}
            <div class="mt-3 flex justify-end">
              <Button variant="ghost" size="sm" onclick={() => onImportAnyway(row)}>
                {m.bank_review_dup_import_anyway()}
              </Button>
            </div>
          {:else if row.decision === "import"}
            <p class="text-accent mt-2 text-xs">{m.bank_review_dup_will_import()}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <div class="flex justify-end border-t border-white/10 pt-4">
    <Button variant="primary" disabled={loading} onclick={onNext}>
      {m.bank_review_step_next()}
    </Button>
  </div>
</div>
