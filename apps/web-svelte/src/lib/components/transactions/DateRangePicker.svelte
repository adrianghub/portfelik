<script lang="ts">
  import { RangeCalendar } from "bits-ui";
  import {
    CalendarDate,
    endOfMonth,
    endOfWeek,
    getLocalTimeZone,
    parseDate,
    startOfMonth,
    startOfWeek,
    today,
    type DateValue,
  } from "@internationalized/date";
  import { ChevronLeft, ChevronRight, X } from "lucide-svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { untrack } from "svelte";
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import { cn } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    label: string;
    startDate: string | null;
    endDate: string | null;
    onchange: (start: string, end: string) => void;
    clearable?: boolean;
    onclear?: () => void;
  }

  let { label, startDate, endDate, onchange, clearable = false, onclear }: Props = $props();

  const isDesktop = new MediaQuery("(min-width: 640px)");
  const locale = "pl";
  const tz = getLocalTimeZone();
  const monthShort = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat("pl-PL", { month: "short" }).format(new Date(2000, i, 1))
  );

  let open = $state(false);
  let mode = $state<"months" | "days">("months");

  function toValue(iso: string | null): DateValue | undefined {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
    try {
      return parseDate(iso);
    } catch {
      return undefined;
    }
  }

  // Shared draft range edited by both months + days views; applied on demand.
  let draft = $state<{ start: DateValue | undefined; end: DateValue | undefined }>({
    start: untrack(() => toValue(startDate)),
    end: untrack(() => toValue(endDate)),
  });
  let monthAnchor = $state<{ y: number; m: number } | null>(null);
  let viewYear = $state(untrack(() => toValue(startDate)?.year ?? today(tz).year));

  $effect(() => {
    if (open) {
      const s = toValue(startDate);
      const e = toValue(endDate);
      draft = { start: s, end: e };
      monthAnchor = null;
      viewYear = s?.year ?? today(tz).year;
      mode = "months";
    }
  });

  function apply() {
    if (draft.start && draft.end) {
      const [s, e] =
        draft.start.compare(draft.end) <= 0 ? [draft.start, draft.end] : [draft.end, draft.start];
      onchange(s.toString(), e.toString());
      open = false;
    }
  }

  function emit(start: DateValue, end: DateValue) {
    onchange(start.toString(), end.toString());
    open = false;
  }

  // --- Months view ---
  function clickMonth(month: number) {
    if (monthAnchor === null) {
      const first = new CalendarDate(viewYear, month, 1);
      draft = { start: first, end: endOfMonth(first) };
      monthAnchor = { y: viewYear, m: month };
    } else {
      const a = new CalendarDate(monthAnchor.y, monthAnchor.m, 1);
      const b = new CalendarDate(viewYear, month, 1);
      const [lo, hi] = a.compare(b) <= 0 ? [a, b] : [b, a];
      draft = { start: lo, end: endOfMonth(hi) };
      monthAnchor = null;
    }
  }

  function monthSelected(month: number): boolean {
    if (!draft.start || !draft.end) return false;
    const key = viewYear * 12 + (month - 1);
    const lo = draft.start.year * 12 + (draft.start.month - 1);
    const hi = draft.end.year * 12 + (draft.end.month - 1);
    return key >= lo && key <= hi;
  }

  // --- Days view ---
  function onValueChange(v: { start: DateValue | undefined; end: DateValue | undefined }) {
    draft = v;
  }

  // --- Presets (apply immediately) ---
  function applyThisMonth() {
    const now = today(tz);
    emit(startOfMonth(now), endOfMonth(now));
  }
  function applyLastMonth() {
    const ref = today(tz).subtract({ months: 1 });
    emit(startOfMonth(ref), endOfMonth(ref));
  }
  function applyThisWeek() {
    const now = today(tz);
    emit(startOfWeek(now, locale), endOfWeek(now, locale));
  }
  function applyLastWeek() {
    const ref = today(tz).subtract({ weeks: 1 });
    emit(startOfWeek(ref, locale), endOfWeek(ref, locale));
  }

  const presets = [
    { label: m.transactions_date_preset_this_month(), action: applyThisMonth },
    { label: m.transactions_date_preset_last_month(), action: applyLastMonth },
    { label: m.transactions_date_preset_this_week(), action: applyThisWeek },
    { label: m.transactions_date_preset_last_week(), action: applyLastWeek },
  ];

  function clickOutside(e: MouseEvent) {
    if (!isDesktop.current) return;
    const t = e.target as HTMLElement;
    if (!t.closest("[data-date-range-picker]")) open = false;
  }
</script>

{#snippet panel(calMonths: 1 | 2)}
  <div class="space-y-3">
    <!-- Presets -->
    <div class="flex flex-wrap gap-1.5">
      {#each presets as preset (preset.label)}
        <button
          type="button"
          onclick={preset.action}
          class="focus-visible:ring-accent rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
        >
          {preset.label}
        </button>
      {/each}
    </div>

    <!-- Mode toggle: months first, drill down to days -->
    <div class="flex rounded-full border border-white/10 p-0.5 text-xs font-medium">
      <button
        type="button"
        onclick={() => (mode = "months")}
        class={cn(
          "flex-1 rounded-full px-3 py-1 transition-colors",
          mode === "months"
            ? "bg-accent-gradient text-slate-900"
            : "text-slate-300 hover:bg-white/5"
        )}
      >
        {m.transactions_date_mode_months()}
      </button>
      <button
        type="button"
        onclick={() => (mode = "days")}
        class={cn(
          "flex-1 rounded-full px-3 py-1 transition-colors",
          mode === "days" ? "bg-accent-gradient text-slate-900" : "text-slate-300 hover:bg-white/5"
        )}
      >
        {m.transactions_date_mode_days()}
      </button>
    </div>

    {#if mode === "months"}
      <div class="rounded-xl border border-white/5 bg-slate-900/60 p-3">
        <div class="mb-3 flex items-center justify-between">
          <button
            type="button"
            onclick={() => (viewYear -= 1)}
            class="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/5"
            aria-label={m.transactions_date_prev_year()}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span class="text-sm font-medium text-slate-100">{viewYear}</span>
          <button
            type="button"
            onclick={() => (viewYear += 1)}
            class="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/5"
            aria-label={m.transactions_date_next_year()}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        <div class="grid grid-cols-3 gap-1.5">
          {#each monthShort as name, i (name)}
            <button
              type="button"
              onclick={() => clickMonth(i + 1)}
              class={cn(
                "rounded-lg py-2 text-sm capitalize transition-colors",
                monthSelected(i + 1)
                  ? "bg-accent font-semibold text-slate-900"
                  : "text-slate-200 hover:bg-white/5"
              )}
            >
              {name}
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <RangeCalendar.Root
        class="rounded-xl border border-white/5 bg-slate-900/60 p-3"
        bind:value={draft}
        {onValueChange}
        {locale}
        numberOfMonths={calMonths}
        weekdayFormat="short"
        weekStartsOn={1}
        fixedWeeks
        pagedNavigation
      >
        {#snippet children({ months: visibleMonths, weekdays })}
          <RangeCalendar.Header class="mb-2 flex items-center justify-between">
            <RangeCalendar.PrevButton
              class="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/5"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </RangeCalendar.PrevButton>
            <RangeCalendar.Heading class="text-sm font-medium text-slate-100 capitalize" />
            <RangeCalendar.NextButton
              class="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/5"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </RangeCalendar.NextButton>
          </RangeCalendar.Header>
          <div class="flex flex-col gap-4 sm:flex-row">
            {#each visibleMonths as month (month.value.toString())}
              <RangeCalendar.Grid class="w-full border-collapse select-none">
                <RangeCalendar.GridHead>
                  <RangeCalendar.GridRow class="mb-1 flex justify-between">
                    {#each weekdays as day (day)}
                      <RangeCalendar.HeadCell
                        class="w-9 text-center text-[0.65rem] font-medium text-slate-400 capitalize"
                      >
                        {day}
                      </RangeCalendar.HeadCell>
                    {/each}
                  </RangeCalendar.GridRow>
                </RangeCalendar.GridHead>
                <RangeCalendar.GridBody>
                  {#each month.weeks as weekDates (weekDates[0].toString())}
                    <RangeCalendar.GridRow class="flex w-full justify-between">
                      {#each weekDates as date (date.toString())}
                        <RangeCalendar.Cell {date} month={month.value} class="p-0">
                          <RangeCalendar.Day
                            class="data-highlighted:bg-accent/10 data-selected:bg-accent/10 data-selection-end:bg-accent data-selection-start:bg-accent flex h-9 w-9 items-center justify-center rounded-md text-sm text-slate-300 transition-colors hover:bg-white/5 data-disabled:text-slate-700 data-disabled:opacity-40 data-outside-month:text-slate-600 data-selected:rounded-none data-selected:text-slate-100 data-selection-end:rounded-r-md data-selection-end:font-semibold data-selection-end:text-slate-900 data-selection-start:rounded-l-md data-selection-start:font-semibold data-selection-start:text-slate-900 data-unavailable:line-through"
                          />
                        </RangeCalendar.Cell>
                      {/each}
                    </RangeCalendar.GridRow>
                  {/each}
                </RangeCalendar.GridBody>
              </RangeCalendar.Grid>
            {/each}
          </div>
        {/snippet}
      </RangeCalendar.Root>
    {/if}

    <!-- Apply -->
    <button
      type="button"
      onclick={apply}
      disabled={!draft.start || !draft.end}
      class="bg-accent-gradient focus-visible:ring-accent w-full rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
    >
      {m.transactions_date_apply()}
    </button>
  </div>
{/snippet}

<svelte:window onclick={clickOutside} />

<div class="relative shrink-0" data-date-range-picker>
  <div
    class="flex h-9 items-center gap-1 rounded-full border border-white/10 bg-slate-900/60 pr-1 pl-3.5 text-sm text-slate-200 backdrop-blur"
  >
    <button
      type="button"
      onclick={() => (open = !open)}
      class="focus-visible:ring-accent flex min-w-0 flex-1 items-center gap-2 rounded-full py-1.5 transition-colors hover:text-white focus-visible:ring-2 focus-visible:outline-none"
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        ><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line
          x1="16"
          x2="16"
          y1="2"
          y2="6"
        /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg
      >
      <span class="capitalize">{label}</span>
    </button>
    {#if clearable && onclear}
      <button
        type="button"
        onclick={onclear}
        class="focus-visible:ring-accent shrink-0 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100 focus-visible:ring-2 focus-visible:outline-none"
        aria-label={m.transactions_date_clear()}
      >
        <X size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    {/if}
  </div>

  {#if open && isDesktop.current}
    <div
      class="absolute top-11 left-0 z-50 w-auto min-w-72 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/95 p-4 shadow-[0_0_40px_rgba(0,0,0,0.4)] backdrop-blur"
      role="dialog"
      aria-label={m.transactions_date_range_label()}
    >
      {@render panel(mode === "days" ? 2 : 1)}
    </div>
  {/if}
</div>

{#if !isDesktop.current}
  <Sheet {open} onclose={() => (open = false)} title={m.transactions_date_range_label()}>
    {@render panel(1)}
  </Sheet>
{/if}
