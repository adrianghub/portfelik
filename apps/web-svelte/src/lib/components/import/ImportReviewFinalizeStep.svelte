<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import Button from "$lib/components/ui/Button.svelte";
  import type { ImportRow, BankAccount } from "$lib/services/bank-import";
  import { cn, formatCurrency } from "$lib/utils";

  interface Props {
    account: BankAccount | undefined;
    bankKindLabel: (kind: string) => string;
    importRows: ImportRow[];
    skippedRows: ImportRow[];
    duplicateRows: ImportRow[];
    categoryName: (id: string | null) => string | null;
    uncategorizedImportCount: number;
    commitPending: boolean;
    onBack: () => void;
    onCommit: () => void;
    onCancel: () => void;
  }

  let {
    account,
    bankKindLabel,
    importRows,
    skippedRows,
    duplicateRows,
    categoryName,
    uncategorizedImportCount,
    commitPending,
    onBack,
    onCommit,
    onCancel,
  }: Props = $props();

  const skipCount = $derived(skippedRows.length);
  const dupCount = $derived(duplicateRows.length);
</script>

<div class="space-y-4">
  <h2 class="text-lg font-semibold text-slate-100">{m.bank_confirm_title()}</h2>

  {#if account}
    <p class="rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
      {m.bank_review_account_destination({
        bank: bankKindLabel(account.kind),
        account: account.label,
      })}
    </p>
  {/if}

  <p class="text-sm text-slate-300">
    {m.bank_confirm_summary({ add: importRows.length, skip: skipCount })}
  </p>

  {#if dupCount > 0}
    <p
      class="rounded-xl border border-slate-500/40 bg-slate-800/40 px-3 py-2 text-xs text-slate-300"
    >
      {m.bank_confirm_duplicates_excluded({ count: dupCount })}
    </p>
  {/if}

  {#if uncategorizedImportCount > 0}
    <p class="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
      {m.bank_confirm_inne_banner({ count: uncategorizedImportCount })}
    </p>
  {/if}

  <ul class="max-h-72 space-y-1.5 overflow-y-auto">
    {#each importRows as row (row.id)}
      <li class="rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2">
        <div class="flex items-start justify-between gap-3">
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">
            {row.counterparty ?? row.edited_description ?? row.description}
          </span>
          <span
            class={cn(
              "shrink-0 text-sm font-semibold tabular-nums",
              row.type === "income" ? "text-emerald-300" : "text-rose-300"
            )}
          >
            {row.type === "income" ? "+" : "−"}{formatCurrency(row.amount, row.currency)}
          </span>
        </div>
        <p class="mt-0.5 text-xs text-slate-500">
          {categoryName(row.selected_category_id) ?? m.bank_confirm_fallback_category()} · {row.posted_at}
        </p>
      </li>
    {/each}
  </ul>

  {#if skipCount > 0}
    <details class="rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2">
      <summary class="cursor-pointer text-xs text-slate-400">
        {m.bank_confirm_skipped_heading({ count: skipCount })}
      </summary>
      <ul class="mt-2 space-y-1">
        {#each skippedRows as row (row.id)}
          <li class="flex justify-between gap-3 text-xs text-slate-500">
            <span class="min-w-0 truncate">
              {row.counterparty ?? row.edited_description ?? row.description}
            </span>
            <span class="shrink-0 tabular-nums">{formatCurrency(row.amount, row.currency)}</span>
          </li>
        {/each}
      </ul>
    </details>
  {/if}

  {#if dupCount > 0}
    <details class="rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2">
      <summary class="cursor-pointer text-xs text-slate-400">
        {m.bank_confirm_duplicates_heading({ count: dupCount })}
      </summary>
      <ul class="mt-2 space-y-1">
        {#each duplicateRows as row (row.id)}
          <li class="flex justify-between gap-3 text-xs text-slate-500">
            <span class="min-w-0 truncate">
              {row.counterparty ?? row.edited_description ?? row.description}
            </span>
            <span class="shrink-0 tabular-nums">{formatCurrency(row.amount, row.currency)}</span>
          </li>
        {/each}
      </ul>
    </details>
  {/if}

  <div
    class="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-slate-950/95 px-4 py-3 pb-(--mobile-action-bottom) backdrop-blur md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
  >
    <Button variant="ghost" onclick={onCancel} disabled={commitPending}
      >{m.bank_review_cancel()}</Button
    >
    <div class="flex gap-2">
      <Button variant="ghost" onclick={onBack} disabled={commitPending}
        >{m.bank_review_step_back()}</Button
      >
      <Button variant="primary" disabled={commitPending} loading={commitPending} onclick={onCommit}>
        {commitPending
          ? m.bank_commit_running()
          : m.bank_confirm_submit({ count: importRows.length })}
      </Button>
    </div>
  </div>
</div>
