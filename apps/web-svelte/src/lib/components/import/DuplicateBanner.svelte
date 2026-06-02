<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import Button from "$lib/components/ui/Button.svelte";
  import type { ImportRow, DuplicateWarning } from "$lib/services/bank-import";
  import { cn, formatCurrency } from "$lib/utils";

  interface Props {
    duplicateRows: ImportRow[];
    duplicateDetail: (rowId: string) => string | null;
    onImportAnyway: (row: ImportRow) => void;
    onRestoreAll: () => void;
    warningsByRow: Map<string, DuplicateWarning>;
  }
  let { duplicateRows, duplicateDetail, onImportAnyway, onRestoreAll }: Props = $props();

  let expanded = $state(false);
  const count = $derived(duplicateRows.length);
</script>

{#if count > 0}
  <div class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm font-medium text-amber-100">
        {m.bank_review_dup_banner_summary({ count })}
      </p>
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" onclick={onRestoreAll}>
          {m.bank_review_dup_restore_all()}
        </Button>
        <Button variant="ghost" size="sm" onclick={() => (expanded = !expanded)}>
          {expanded ? m.bank_review_dup_hide() : m.bank_review_dup_show()}
        </Button>
      </div>
    </div>

    {#if expanded}
      <ul class="mt-3 space-y-2">
        {#each duplicateRows as row (row.id)}
          <li class="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2">
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
                <Button variant="ghost" size="sm" onclick={() => onImportAnyway(row)}>
                  {m.bank_review_dup_import_anyway()}
                </Button>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
