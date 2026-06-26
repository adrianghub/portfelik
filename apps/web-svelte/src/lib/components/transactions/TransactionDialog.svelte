<script lang="ts">
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import DayPicker from "$lib/components/ui/DayPicker.svelte";
  import CategorySelect from "$lib/components/transactions/CategorySelect.svelte";
  import * as m from "$lib/paraglide/messages";
  import { createCategory, fetchCategories } from "$lib/services/categories";
  import { makeCreateCategoryInline } from "$lib/category-create";
  import { fetchUserGroups } from "$lib/services/groups";
  import { linkPlanTransaction } from "$lib/services/plan-settlement";
  import {
    createTransaction,
    updateTransaction,
    updateTransactionsCategory,
  } from "$lib/services/transactions";
  import { createCategorizationRule, findRetroMatchIds } from "$lib/services/categorization-rules";
  import { materializeRecurringOccurrencesForNearTerm } from "$lib/services/recurring-occurrences";
  import { suggestRuleFromRow } from "$lib/import/categorize";
  import type {
    RecurrenceFrequency,
    Transaction,
    TransactionStatus,
    TransactionType,
  } from "$lib/types";
  import { suggestStatusForDate } from "$lib/services/transaction-cashflow";
  import { isoWeekdayName, recurrenceSummary } from "$lib/recurrence";
  import { formatDate, monthName } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { toastError } from "$lib/toast-error";
  import { errorMessage } from "$lib/services/supabase-errors";

  export interface PlanTransactionContext {
    planId: string;
    type: TransactionType;
    groupId?: string | null;
    categoryId?: string | null;
    /** Plan period - a linked transaction must fall within it (RPC rejects otherwise). */
    startDate?: string;
    endDate?: string;
  }

  interface Props {
    open: boolean;
    onclose: () => void;
    initial?: Transaction | null;
    planContext?: PlanTransactionContext | null;
  }
  let { open, onclose, initial = null, planContext = null }: Props = $props();

  const queryClient = useQueryClient();

  const createCategoryInline = makeCreateCategoryInline({
    createCategory,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
    toastSuccess: () => toast.success(m.toast_category_created()),
    toastError: () => toast.error(m.toast_error()),
  });

  const categoriesQuery = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  }));

  const groupsQuery = createQuery(() => ({
    queryKey: ["user_groups"],
    queryFn: fetchUserGroups,
  }));

  let type = $state<TransactionType>(untrack(() => initial?.type ?? "expense"));
  let amount = $state(untrack(() => (initial ? String(Math.abs(initial.amount)) : "")));
  let counterparty = $state(untrack(() => initial?.counterparty ?? ""));
  let description = $state(untrack(() => initial?.description ?? ""));
  let date = $state(
    untrack(() =>
      initial?.date ? initial.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
    )
  );
  let category_id = $state(untrack(() => initial?.category_id ?? ""));
  let status = $state<TransactionStatus>(
    untrack(
      () =>
        initial?.status ??
        suggestStatusForDate(
          initial?.date ? initial.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
        )
    )
  );
  // Soft prefill: while false, status tracks the date; a manual pick locks it.
  let statusTouched = $state(false);

  // Re-suggest status as the date changes, until the user picks one manually.
  $effect(() => {
    const d = date;
    if (!statusTouched) status = suggestStatusForDate(d);
  });
  let is_recurring = $state(untrack(() => initial?.is_recurring ?? false));
  let recurring_day = $state(untrack(() => initial?.recurring_day ?? new Date().getDate()));
  let recurrence_frequency = $state<RecurrenceFrequency>(
    untrack(() => initial?.recurrence_frequency ?? "monthly")
  );
  let recurrence_interval = $state(untrack(() => initial?.recurrence_interval ?? 1));
  // ISO weekday 1=Mon..7=Sun. JS getDay() is 0=Sun..6=Sat → map to ISO.
  let recurrence_weekday = $state(
    untrack(() => initial?.recurrence_weekday ?? (new Date().getDay() || 7))
  );
  let recurrence_month = $state(
    untrack(() => initial?.recurrence_month ?? new Date().getMonth() + 1)
  );
  let recurrenceEndDate = $state<string>("");
  let group_id = $state<string>(untrack(() => initial?.group_id ?? ""));
  let formError = $state<string | null>(null);

  $effect(() => {
    if (open) {
      formError = null;
      type = initial?.type ?? planContext?.type ?? "expense";
      amount = initial ? String(Math.abs(initial.amount)) : "";
      counterparty = initial?.counterparty ?? "";
      description = initial?.description ?? "";
      date = initial?.date ? initial.date.slice(0, 10) : new Date().toISOString().slice(0, 10);
      category_id = initial?.category_id ?? planContext?.categoryId ?? "";
      statusTouched = initial?.status != null;
      status = initial?.status ?? suggestStatusForDate(date);
      is_recurring = initial?.recurring_template_id ? false : (initial?.is_recurring ?? false);
      recurring_day = initial?.recurring_day ?? new Date().getDate();
      recurrence_frequency = initial?.recurrence_frequency ?? "monthly";
      recurrence_interval = initial?.recurrence_interval ?? 1;
      recurrence_weekday = initial?.recurrence_weekday ?? (new Date().getDay() || 7);
      recurrence_month = initial?.recurrence_month ?? new Date().getMonth() + 1;
      recurrenceEndDate = initial?.recurrence_end_date ?? "";
      group_id = initial?.group_id ?? planContext?.groupId ?? "";
    }
  });

  const recurrencePreview = $derived(
    recurrenceSummary({
      frequency: recurrence_frequency,
      interval: recurrence_interval,
      weekday: recurrence_weekday,
      day: recurring_day,
      month: recurrence_month,
    })
  );

  const filteredCategories = $derived(categoriesQuery.data?.filter((c) => c.type === type) ?? []);

  $effect(() => {
    if (category_id && categoriesQuery.data) {
      const cat = categoriesQuery.data.find((c) => c.id === category_id);
      if (cat && cat.type !== type) category_id = "";
    }
  });

  const isEdit = $derived(!!initial);
  const isRecurringOccurrenceEdit = $derived(!!initial?.recurring_template_id);
  const title = $derived(isEdit ? m.transaction_form_title_edit() : m.transaction_form_title_add());

  const mutation = createMutation(() => ({
    mutationFn: async (input: Parameters<typeof createTransaction>[0]) => {
      const tx = isEdit
        ? await updateTransaction(initial!.id, input)
        : await createTransaction(input);
      if (!isEdit && planContext) {
        await linkPlanTransaction(planContext.planId, tx.id);
      }
      return tx;
    },
    onSuccess: async (_tx, input) => {
      if (input.is_recurring) {
        await materializeRecurringOccurrencesForNearTerm();
      }
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      if (planContext) {
        await queryClient.invalidateQueries({ queryKey: ["plan-links", planContext.planId] });
        await queryClient.invalidateQueries({ queryKey: ["plan-ranked", planContext.planId] });
        await queryClient.invalidateQueries({ queryKey: ["plan-eligible", planContext.planId] });
        await queryClient.invalidateQueries({ queryKey: ["plan-progress"] });
        await queryClient.invalidateQueries({ queryKey: ["plan-progress-list"] });
        await queryClient.invalidateQueries({ queryKey: ["plans"] });
        toast.success(m.plan_settle_linked());
      } else {
        toast.success(isEdit ? m.toast_transaction_updated() : m.toast_transaction_created());
        maybeOfferRuleCapture();
      }
      onclose();
    },
    onError: (err) => toastError(err),
  }));

  async function applyRuleRetro(categoryId: string, ids: string[]): Promise<void> {
    try {
      await updateTransactionsCategory(ids, categoryId);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress"] });
      toast.success(m.rule_apply_done({ count: ids.length }));
    } catch (err) {
      toastError(err);
    }
  }

  function maybeOfferRuleCapture(): void {
    // Learn from the correction: when an existing transaction is moved to a different category,
    // offer (never auto-create) a rule so future imports apply it. Plan-linked saves are skipped.
    if (!isEdit || !initial) return;
    if (!category_id || category_id === initial.category_id) return;
    const draft = suggestRuleFromRow({
      type,
      description,
      counterparty: counterparty.trim() || null,
    });
    if (!draft) return;
    const targetCategoryId = category_id;
    const token = draft.match_counterparty || draft.match_description;
    toast(m.rule_capture_offer({ text: token }), {
      action: {
        label: m.rule_capture_action(),
        onClick: () => {
          void (async () => {
            try {
              const created = await createCategorizationRule({
                ...draft,
                category_id: targetCategoryId,
                priority: 10,
              });
              await queryClient.invalidateQueries({ queryKey: ["categorization_rules"] });
              const matchIds = await findRetroMatchIds(created);
              if (matchIds.length > 0) {
                toast.success(m.rule_capture_created(), {
                  action: {
                    label: m.rule_apply_action({ count: matchIds.length }),
                    onClick: () => void applyRuleRetro(created.category_id, matchIds),
                  },
                });
              } else {
                toast.success(m.rule_capture_created());
              }
            } catch {
              toast.info(m.rule_capture_exists());
            }
          })();
        },
      },
    });
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    formError = null;
    // A plan-linked transaction must fall within the plan period, or the link RPC rejects it
    // and leaves an orphan transaction. Validate up front and tell the user the allowed range.
    if (planContext?.startDate && planContext?.endDate) {
      if (date < planContext.startDate || date > planContext.endDate) {
        formError = m.transaction_plan_period_error({
          from: formatDate(planContext.startDate),
          to: formatDate(planContext.endDate),
        });
        return;
      }
    }
    const saveAsRecurring = is_recurring && !isRecurringOccurrenceEdit;
    const usesDay =
      saveAsRecurring && (recurrence_frequency === "monthly" || recurrence_frequency === "yearly");
    mutation.mutate({
      amount: parseFloat(amount),
      type,
      counterparty: counterparty.trim() || null,
      description,
      date,
      category_id,
      status,
      is_recurring: saveAsRecurring,
      recurrence_frequency: saveAsRecurring ? recurrence_frequency : null,
      recurrence_interval: saveAsRecurring ? Math.max(recurrence_interval, 1) : 1,
      recurring_day: usesDay ? recurring_day : null,
      recurrence_weekday:
        saveAsRecurring && recurrence_frequency === "weekly" ? recurrence_weekday : null,
      recurrence_month:
        saveAsRecurring && recurrence_frequency === "yearly" ? recurrence_month : null,
      recurrence_end_date: saveAsRecurring ? recurrenceEndDate || null : null,
      group_id: group_id || null,
    });
  }

  const inputClass =
    "w-full scroll-mb-32 rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 backdrop-blur focus:border-accent/40 focus:ring-2 focus:ring-accent/30 focus:outline-none";
  const labelClass = "text-eyebrow block text-slate-400";
</script>

<Dialog {open} {onclose} {title}>
  <form onsubmit={handleSubmit} class="space-y-4">
    {#if !planContext}
      <!-- Type toggle -->
      <div
        class="flex overflow-hidden rounded-full border border-white/10 bg-slate-900/60 p-1 text-sm"
      >
        <button
          type="button"
          onclick={() => (type = "expense")}
          class="flex-1 rounded-full py-1.5 font-medium transition-colors {type === 'expense'
            ? 'bg-rose-500/90 text-white shadow-[0_0_18px_rgba(244,63,94,0.25)]'
            : 'text-slate-300 hover:text-slate-100'}"
        >
          {m.common_expense()}
        </button>
        <button
          type="button"
          onclick={() => (type = "income")}
          class="flex-1 rounded-full py-1.5 font-medium transition-colors {type === 'income'
            ? 'bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]'
            : 'text-slate-300 hover:text-slate-100'}"
        >
          {m.common_income()}
        </button>
      </div>
    {/if}

    <div class="space-y-1">
      <label class={labelClass} for="tx-amount">{m.transaction_form_amount()}</label>
      <input
        id="tx-amount"
        type="number"
        min="0.01"
        step="0.01"
        required
        bind:value={amount}
        class={inputClass}
      />
    </div>

    <div class="space-y-1">
      <label class={labelClass} for="tx-counterparty">{m.transaction_form_counterparty()}</label>
      <input
        id="tx-counterparty"
        type="text"
        bind:value={counterparty}
        placeholder={m.transaction_form_counterparty_hint()}
        class={inputClass}
      />
    </div>

    <div class="space-y-1">
      <label class={labelClass} for="tx-desc">{m.transaction_form_description()}</label>
      <input id="tx-desc" type="text" required bind:value={description} class={inputClass} />
    </div>

    <div class="space-y-1">
      <label class={labelClass} for="tx-date">{m.transaction_form_date()}</label>
      <DayPicker
        id="tx-date"
        bind:value={date}
        label={m.transaction_form_date()}
        showLabel={false}
        required
      />
    </div>

    <div class="space-y-1">
      <label class={labelClass} for="tx-cat">{m.transaction_form_category()}</label>
      <CategorySelect
        id="tx-cat"
        categories={filteredCategories}
        selectedId={category_id || null}
        {type}
        onchange={(id) => (category_id = id ?? "")}
        oncreate={createCategoryInline}
        required
      />
    </div>

    <div class="space-y-1">
      <label class={labelClass} for="tx-status">{m.transaction_form_status()}</label>
      <select
        id="tx-status"
        bind:value={status}
        onchange={() => (statusTouched = true)}
        class={inputClass}
      >
        <option value="paid">{m.transactions_status_paid()}</option>
        <option value="upcoming">{m.transactions_status_upcoming()}</option>
        <option value="draft">{m.transactions_status_draft()}</option>
        <option value="overdue">{m.transactions_status_overdue()}</option>
      </select>
    </div>

    {#if groupsQuery.data && groupsQuery.data.length > 0}
      <div class="space-y-1">
        <label class={labelClass} for="tx-group">{m.group_assign_label()}</label>
        <select id="tx-group" bind:value={group_id} class={inputClass}>
          <option value="">{m.group_assign_none()}</option>
          {#each groupsQuery.data as g (g.id)}
            <option value={g.id}>{g.name}</option>
          {/each}
        </select>
        <p class="text-xs text-slate-400">{m.group_assign_help()}</p>
      </div>
    {/if}

    {#if !isRecurringOccurrenceEdit}
      <label class="flex cursor-pointer items-center gap-3 select-none">
        <input type="checkbox" bind:checked={is_recurring} class="sr-only" />
        <div
          class="relative h-5 w-9 rounded-full transition-colors {is_recurring
            ? 'bg-accent-gradient shadow-[0_0_12px_var(--color-accent-glow)]'
            : 'bg-slate-700'}"
        >
          <div
            class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform {is_recurring
              ? 'translate-x-4'
              : 'translate-x-0'}"
          ></div>
        </div>
        <span class="text-sm text-slate-200">{m.transaction_form_recurring()}</span>
      </label>
    {/if}

    {#if is_recurring && !isRecurringOccurrenceEdit}
      <div class="space-y-3 rounded-xl border border-white/5 bg-slate-900/40 p-3">
        <!-- Frequency segmented control -->
        <div class="space-y-1">
          <span class={labelClass}>{m.transaction_form_recurrence_frequency()}</span>
          <div
            class="flex overflow-hidden rounded-full border border-white/10 bg-slate-900/60 p-1 text-xs"
          >
            {#each [["daily", m.transaction_form_recurrence_freq_daily()], ["weekly", m.transaction_form_recurrence_freq_weekly()], ["monthly", m.transaction_form_recurrence_freq_monthly()], ["yearly", m.transaction_form_recurrence_freq_yearly()]] as [value, label] (value)}
              <button
                type="button"
                onclick={() => (recurrence_frequency = value as RecurrenceFrequency)}
                class="flex-1 rounded-full py-1.5 font-medium transition-colors {recurrence_frequency ===
                value
                  ? 'bg-accent-gradient text-slate-900'
                  : 'text-slate-300 hover:text-slate-100'}"
              >
                {label}
              </button>
            {/each}
          </div>
        </div>

        <div class="flex gap-3">
          <!-- Interval -->
          <div class="w-24 space-y-1">
            <label class={labelClass} for="tx-rec-interval"
              >{m.transaction_form_recurrence_interval()}</label
            >
            <input
              id="tx-rec-interval"
              type="number"
              min="1"
              max="99"
              bind:value={recurrence_interval}
              class={inputClass}
            />
          </div>

          <!-- Weekly: weekday -->
          {#if recurrence_frequency === "weekly"}
            <div class="flex-1 space-y-1">
              <label class={labelClass} for="tx-rec-weekday"
                >{m.transaction_form_recurrence_weekday()}</label
              >
              <select id="tx-rec-weekday" bind:value={recurrence_weekday} class={inputClass}>
                {#each [1, 2, 3, 4, 5, 6, 7] as wd (wd)}
                  <option value={wd}>{isoWeekdayName(wd)}</option>
                {/each}
              </select>
            </div>
          {/if}

          <!-- Yearly: month -->
          {#if recurrence_frequency === "yearly"}
            <div class="flex-1 space-y-1">
              <label class={labelClass} for="tx-rec-month"
                >{m.transaction_form_recurrence_month()}</label
              >
              <select id="tx-rec-month" bind:value={recurrence_month} class={inputClass}>
                {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as mo (mo)}
                  <option value={mo}>{monthName(mo)}</option>
                {/each}
              </select>
            </div>
          {/if}

          <!-- Monthly / yearly: day of month -->
          {#if recurrence_frequency === "monthly" || recurrence_frequency === "yearly"}
            <div class="flex-1 space-y-1">
              <label class={labelClass} for="tx-recday">{m.transaction_form_recurring_day()}</label>
              <input
                id="tx-recday"
                type="number"
                min="1"
                max="31"
                bind:value={recurring_day}
                class={inputClass}
              />
            </div>
          {/if}
        </div>

        <!-- End date (optional) -->
        <label class="block">
          <span class="text-eyebrow mb-1 block text-slate-400"
            >{m.transaction_form_recurrence_end()}</span
          >
          <input
            type="date"
            bind:value={recurrenceEndDate}
            class="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
          />
        </label>

        <!-- Live, auditable preview -->
        <p class="text-accent/90 text-sm">{recurrencePreview}</p>
        <p class="text-xs text-slate-400">{m.transaction_form_recurring_hint()}</p>
      </div>
    {/if}

    {#if mutation.isError}
      <p class="text-sm text-rose-300">{errorMessage(mutation.error)}</p>
    {/if}

    {#if formError}
      <p class="text-sm text-rose-300">{formError}</p>
    {/if}
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={onclose}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={mutation.isPending}
        class="bg-accent-gradient focus-visible:ring-accent flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
      >
        {mutation.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>
