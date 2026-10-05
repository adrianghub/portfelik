<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import type { ImportRow } from "$lib/services/bank-import";
  import { cn, formatCurrency } from "$lib/utils";

  interface Props {
    open: boolean;
    importCount: number;
    skipCount: number;
    dupCount: number;
    inneRows: ImportRow[];
    automaticCount: number;
    manualCount: number;
    newRuleCount: number;
    commitPending: boolean;
    onClose: () => void;
    onCommit: () => void;
    onSkipInne: () => void;
  }
  let {
    open,
    importCount,
    skipCount,
    dupCount,
    inneRows,
    automaticCount,
    manualCount,
    newRuleCount,
    commitPending,
    onClose,
    onCommit,
    onSkipInne,
  }: Props = $props();
</script>

<Dialog {open} onclose={onClose} title={m.bank_confirm_title()}>
  <div class="space-y-4">
    <p class="text-sm text-slate-300">
      {importCount === 0
        ? m.bank_review_finish_hint()
        : m.bank_confirm_summary({ add: importCount, skip: skipCount })}
    </p>

    <div
      class="space-y-1 rounded-xl border border-white/10 px-3 py-3 text-sm text-slate-300"
      data-testid="import-final-summary"
    >
      <p>{m.import_v2_automatic({ count: automaticCount })}</p>
      <p>{m.import_v2_manual({ count: manualCount })}</p>
      <p>{m.import_v2_new_rules({ count: newRuleCount })}</p>
    </div>

    {#if inneRows.length > 0}
      <div class="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2">
        <p class="text-xs font-medium text-sky-200">
          {m.bank_confirm_inne_heading({ count: inneRows.length })}
        </p>
        <p class="mt-2 text-xs text-sky-100/90">{m.import_v2_inne_allowed()}</p>
        <ul class="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {#each inneRows as row (row.id)}
            <li class="flex justify-between gap-3 text-xs text-sky-100/90">
              <span class="min-w-0 truncate">
                {row.counterparty ?? row.edited_description ?? row.description}
              </span>
              <span
                class={cn(
                  "shrink-0 tabular-nums",
                  row.type === "income" ? "text-emerald-300" : "text-rose-300"
                )}
              >
                {row.type === "income" ? "+" : "−"}{formatCurrency(row.amount, row.currency)}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if dupCount > 0}
      <p
        class="rounded-xl border border-slate-500/40 bg-slate-800/40 px-3 py-2 text-xs text-slate-300"
      >
        {m.bank_confirm_duplicates_excluded({ count: dupCount })}
      </p>
    {/if}

    <div class="flex flex-wrap items-center justify-end gap-2">
      <Button variant="ghost" onclick={onClose} disabled={commitPending}>
        {m.bank_confirm_back()}
      </Button>
      {#if inneRows.length > 0}
        <Button variant="ghost" disabled={commitPending} onclick={onSkipInne}>
          {m.bank_confirm_skip_inne({ count: inneRows.length })}
        </Button>
      {/if}
      <Button variant="primary" loading={commitPending} disabled={commitPending} onclick={onCommit}>
        {importCount === 0
          ? m.bank_review_finish_action()
          : m.bank_confirm_submit({ count: importCount })}
      </Button>
    </div>
  </div>
</Dialog>
