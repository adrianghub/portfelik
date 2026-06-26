<script lang="ts">
  import { onMount } from "svelte";
  import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { toast } from "svelte-sonner";
  import { Pencil, CalendarX } from "lucide-svelte";
  import * as m from "$lib/paraglide/messages";
  import { supabase } from "$lib/supabase";
  import { fetchRecurringTemplates, fetchTransactionById } from "$lib/services/transactions";
  import {
    buildRecurringSeriesList,
    endSeriesFromOccurrence,
  } from "$lib/services/recurring-series";
  import { fetchMyGroupRoles } from "$lib/services/groups";
  import { canManageTransaction } from "$lib/services/transaction-permissions";
  import TransactionDialog from "$lib/components/transactions/TransactionDialog.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import QueryError from "$lib/components/ui/QueryError.svelte";
  import { toastError } from "$lib/toast-error";
  import { formatCurrency, formatDate } from "$lib/utils";
  import type { Transaction } from "$lib/types";

  const queryClient = useQueryClient();

  let userId = $state<string | null>(null);
  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user.id ?? null;
  });

  const templatesQuery = createQuery(() => ({
    queryKey: ["recurring-templates"],
    queryFn: fetchRecurringTemplates,
  }));

  const groupRolesQuery = createQuery(() => ({
    queryKey: ["my-group-roles"],
    queryFn: fetchMyGroupRoles,
    enabled: !!userId,
  }));

  const templates = $derived(templatesQuery.data ?? []);
  const series = $derived(buildRecurringSeriesList(templates));
  const byId = $derived(new Map(templates.map((t) => [t.id, t])));

  function canManage(id: string): boolean {
    const t = byId.get(id);
    if (!t || !userId) return false;
    return canManageTransaction(t, userId, groupRolesQuery.data ?? new Map());
  }

  // Edit reuses the transaction dialog loaded with the template.
  let dialogOpen = $state(false);
  let editTarget = $state<Transaction | null>(null);

  function openEdit(id: string) {
    const t = byId.get(id);
    if (t) {
      editTarget = t;
      dialogOpen = true;
    }
  }

  async function closeDialog() {
    dialogOpen = false;
    editTarget = null;
    await queryClient.invalidateQueries({ queryKey: ["recurring-templates"] });
  }

  // End-from-today.
  let endTargetId = $state<string | null>(null);
  const endMutation = createMutation(() => ({
    mutationFn: async (id: string) => {
      const template = await fetchTransactionById(id);
      await endSeriesFromOccurrence({
        template,
        occurrenceDate: new Date().toISOString().slice(0, 10),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["recurring-templates"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions", "recurring-skips"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress-list"] });
      toast.success(m.recurring_ended_toast());
      endTargetId = null;
    },
    onError: (err) => toastError(err),
  }));
</script>

<div class="mx-auto w-full max-w-3xl px-4 py-6">
  <header class="mb-5">
    <h1 class="text-xl font-semibold text-slate-100">{m.recurring_page_title()}</h1>
    <p class="mt-1 text-sm text-slate-400">{m.recurring_page_subtitle()}</p>
  </header>

  {#if templatesQuery.isError}
    <QueryError error={templatesQuery.error} onRetry={() => templatesQuery.refetch()} />
  {:else if templatesQuery.isPending}
    <div class="space-y-2">
      {#each Array(3) as _, i (i)}
        <div class="h-20 animate-pulse rounded-xl border border-white/5 bg-slate-900/40"></div>
      {/each}
    </div>
  {:else if series.length === 0}
    <div class="rounded-xl border border-white/5 bg-slate-900/40 p-6 text-center">
      <p class="text-sm text-slate-300">{m.recurring_empty()}</p>
      <p class="mt-1 text-xs text-slate-500">{m.recurring_empty_hint()}</p>
    </div>
  {:else}
    <ul class="space-y-2">
      {#each series as s (s.id)}
        <li class="rounded-xl border border-white/5 bg-slate-900/40 p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="truncate font-medium text-slate-100">{s.title}</span>
                <span
                  class="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400"
                >
                  {s.groupId ? m.recurring_scope_shared() : m.recurring_scope_private()}
                </span>
              </div>
              <p class="mt-0.5 truncate text-xs text-slate-400">{s.categoryName} · {s.cadence}</p>
              <p class="mt-1 text-xs text-slate-500">
                {m.recurring_next()}: {s.nextDate ? formatDate(s.nextDate) : "—"} ·
                {m.recurring_range()}: {formatDate(s.startDate)} → {s.endDate
                  ? formatDate(s.endDate)
                  : m.recurring_open_ended()}
              </p>
            </div>
            <span
              class="shrink-0 font-semibold tabular-nums {s.type === 'income'
                ? 'text-emerald-400'
                : 'text-rose-400'}"
            >
              {s.type === "income" ? "+" : "−"}{formatCurrency(s.amount)}
            </span>
          </div>

          {#if canManage(s.id)}
            <div class="mt-3 flex gap-2">
              <button
                type="button"
                onclick={() => openEdit(s.id)}
                class="focus-visible:ring-accent inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
              >
                <Pencil size={13} />
                {m.recurring_action_edit()}
              </button>
              <button
                type="button"
                onclick={() => (endTargetId = s.id)}
                class="focus-visible:ring-accent inline-flex items-center gap-1.5 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:ring-2 focus-visible:outline-none"
              >
                <CalendarX size={13} />
                {m.recurring_action_end()}
              </button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<TransactionDialog open={dialogOpen} onclose={closeDialog} initial={editTarget} />

<ConfirmDialog
  open={endTargetId !== null}
  message={m.recurring_end_confirm()}
  pending={endMutation.isPending}
  onconfirm={() => endMutation.mutate(endTargetId!)}
  onclose={() => (endTargetId = null)}
/>
