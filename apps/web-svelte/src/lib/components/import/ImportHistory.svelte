<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { session as authSession } from "$lib/auth/session.svelte";
  import { fetchSessionRows } from "$lib/services/bank-import";
  import {
    fetchImportHistory,
    importHistoryDateRange,
    importHistoryTransactionsUrl,
  } from "$lib/services/import-history";
  import { fetchCategories } from "$lib/services/categories";
  import { qk } from "$lib/query-keys";
  import { importAdapterLabel } from "$lib/import/banks/registry";
  import { importHistoryCopy as copy } from "$lib/content/import-history-copy";
  import { formatDate } from "$lib/utils";
  import ImportStatementPreview from "./ImportStatementPreview.svelte";

  let selectedId = $state<string | null>(null);
  const history = createQuery(() => ({
    queryKey: qk.importHistory(authSession.userId!),
    queryFn: fetchImportHistory,
    enabled: !!authSession.userId,
  }));
  const selected = $derived(history.data?.find((item) => item.id === selectedId) ?? null);
  const rows = createQuery(() => ({
    queryKey: qk.importRows(authSession.userId!, selected?.id ?? ""),
    queryFn: () => fetchSessionRows(selected!.id),
    enabled: !!authSession.userId && !!selected,
  }));
  const categories = createQuery(() => ({
    queryKey: qk.categories(authSession.userId!),
    queryFn: fetchCategories,
    enabled: !!authSession.userId && !!selected,
  }));
  const period = $derived(importHistoryDateRange(rows.data ?? []));
  const transactionsUrl = $derived(importHistoryTransactionsUrl(rows.data ?? []));
</script>

<section class="space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-hero font-semibold text-slate-100">{copy.title}</h1>
    <a href="/import" class="text-accent rounded-lg text-sm font-medium hover:underline"
      >{copy.newImport}</a
    >
  </div>
  <p class="text-sm text-slate-400">{copy.introduction}</p>

  {#if history.isLoading}
    <p role="status" class="text-sm text-slate-400">{copy.loading}</p>
  {:else if history.isError}
    <div role="alert" class="space-y-2">
      <p class="text-sm text-rose-300">{copy.error}</p>
      <button
        type="button"
        onclick={() => history.refetch()}
        class="text-accent text-sm hover:underline">{copy.retry}</button
      >
    </div>
  {:else if selected}
    <button
      type="button"
      onclick={() => (selectedId = null)}
      class="text-accent text-sm hover:underline">← {copy.back}</button
    >
    <div class="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <h2 class="text-lg font-semibold break-words text-slate-100">
        {selected.source_filename ?? copy.unknownFile}
      </h2>
      <p class="text-sm text-slate-400">
        {importAdapterLabel(selected.adapter_kind ?? selected.detected_kind)} · {copy.importedOn}
        {formatDate(selected.committed_at ?? selected.created_at)}
      </p>
      <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt class="text-xs text-slate-400">{copy.operations}</dt>
          <dd class="font-semibold text-slate-100">{selected.rows_total}</dd>
        </div>
        <div>
          <dt class="text-xs text-slate-400">{copy.added}</dt>
          <dd class="font-semibold text-slate-100">{selected.rows_committed}</dd>
        </div>
        <div>
          <dt class="text-xs text-slate-400">{copy.skipped}</dt>
          <dd class="font-semibold text-slate-100">{selected.rows_skipped}</dd>
        </div>
        <div>
          <dt class="text-xs text-slate-400">{copy.duplicates}</dt>
          <dd class="font-semibold text-slate-100">{selected.rows_duplicate}</dd>
        </div>
      </dl>
      <p class="text-xs text-slate-400">{copy.historyNotice}</p>
      {#if period}
        <p class="text-sm text-slate-300">
          {copy.period}: {formatDate(period.start)}–{formatDate(period.end)}
        </p>
      {/if}
      {#if transactionsUrl}
        <a href={transactionsUrl} class="text-accent inline-block text-sm hover:underline"
          >{copy.periodTransactions}</a
        >
      {/if}
    </div>
    {#if rows.isLoading}
      <p role="status" class="text-sm text-slate-400">{copy.loadingRows}</p>
    {:else if rows.isError}
      <div role="alert" class="space-y-2">
        <p class="text-sm text-rose-300">{copy.rowsError}</p>
        <button
          type="button"
          onclick={() => rows.refetch()}
          class="text-accent text-sm hover:underline">{copy.retry}</button
        >
      </div>
    {:else if rows.data}
      <ImportStatementPreview
        session={selected}
        rows={rows.data}
        categories={categories.data ?? []}
      />
    {/if}
  {:else if history.data?.length}
    <ul class="space-y-3">
      {#each history.data as item (item.id)}
        <li>
          <button
            type="button"
            onclick={() => (selectedId = item.id)}
            class="focus-visible:ring-accent w-full space-y-1 rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-left transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
          >
            <span class="block font-semibold text-slate-100"
              >{importAdapterLabel(item.adapter_kind ?? item.detected_kind)} · {formatDate(
                item.committed_at ?? item.created_at
              )}</span
            >
            <span class="block text-sm break-words text-slate-400"
              >{item.source_filename ?? copy.unknownFile}</span
            >
            <span class="block text-sm text-slate-300"
              >{copy.added}: {item.rows_committed} · {copy.duplicates}: {item.rows_duplicate} · {copy.skipped}:
              {item.rows_skipped}</span
            >
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="rounded-2xl border border-white/10 p-6 text-center text-sm text-slate-400">
      {copy.empty}
    </p>
  {/if}
</section>
