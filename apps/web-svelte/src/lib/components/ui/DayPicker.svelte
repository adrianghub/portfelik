<script lang="ts">
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import * as m from "$lib/paraglide/messages";
  import { cn } from "$lib/utils";
  import { getLocalTimeZone, parseDate, today, type DateValue } from "@internationalized/date";
  import { Calendar } from "bits-ui";
  import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-svelte";
  import { MediaQuery } from "svelte/reactivity";

  interface Props {
    value?: string;
    id?: string;
    label: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    /** Render the built-in label. Set false when an external label already
        describes the field (e.g. a form using its own eyebrow labels). */
    showLabel?: boolean;
  }

  const uid = $props.id();
  let {
    value = $bindable(""),
    id = `${uid}-day-picker`,
    label,
    placeholder = m.day_picker_placeholder(),
    required = false,
    disabled = false,
    showLabel = true,
  }: Props = $props();

  const isDesktop = new MediaQuery("(min-width: 640px)");
  const locale = "pl";
  const tz = getLocalTimeZone();
  let open = $state(false);
  const selected = $derived(toValue(value));

  function toValue(iso: string | null | undefined): DateValue | undefined {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
    try {
      return parseDate(iso);
    } catch {
      return undefined;
    }
  }

  function toDisplay(iso: string): string {
    const parsed = toValue(iso);
    if (!parsed) return iso;
    return new Intl.DateTimeFormat("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(parsed.year, parsed.month - 1, parsed.day));
  }

  function handleValueChange(next: DateValue | undefined) {
    if (!next) {
      value = "";
      return;
    }
    value = next.toString();
    open = false;
  }

  function clickOutside(e: MouseEvent) {
    if (!isDesktop.current) return;
    const target = e.target as HTMLElement;
    if (!target.closest(`[data-day-picker="${id}"]`)) open = false;
  }
</script>

{#snippet calendarPanel()}
  <Calendar.Root
    class="rounded-xl border border-white/5 bg-slate-900/60 p-3"
    type="single"
    value={selected}
    onValueChange={handleValueChange}
    placeholder={selected ?? today(tz)}
    {locale}
    weekdayFormat="short"
    weekStartsOn={1}
    fixedWeeks
    disableDaysOutsideMonth={false}
    calendarLabel={label}
  >
    {#snippet children({ months, weekdays })}
      <Calendar.Header class="mb-2 flex items-center justify-between">
        <Calendar.PrevButton
          class="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/5"
          aria-label={m.day_picker_previous_month()}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </Calendar.PrevButton>
        <Calendar.Heading class="text-sm font-medium text-slate-100 capitalize" />
        <Calendar.NextButton
          class="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/5"
          aria-label={m.day_picker_next_month()}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </Calendar.NextButton>
      </Calendar.Header>
      {#each months as month (month.value.toString())}
        <Calendar.Grid class="w-full border-collapse select-none">
          <Calendar.GridHead>
            <Calendar.GridRow class="mb-1 flex justify-between">
              {#each weekdays as day (day)}
                <Calendar.HeadCell
                  class="w-9 text-center text-[0.65rem] font-medium text-slate-400 capitalize"
                >
                  {day}
                </Calendar.HeadCell>
              {/each}
            </Calendar.GridRow>
          </Calendar.GridHead>
          <Calendar.GridBody>
            {#each month.weeks as weekDates (weekDates[0].toString())}
              <Calendar.GridRow class="flex w-full justify-between">
                {#each weekDates as date (date.toString())}
                  <Calendar.Cell {date} month={month.value} class="p-0">
                    <Calendar.Day
                      data-date={date.toString()}
                      class="data-selected:bg-accent flex h-9 w-9 items-center justify-center rounded-md text-sm text-slate-300 transition-colors hover:bg-white/5 data-disabled:text-slate-700 data-disabled:opacity-40 data-outside-month:text-slate-600 data-selected:font-semibold data-selected:text-slate-900 data-unavailable:line-through"
                    />
                  </Calendar.Cell>
                {/each}
              </Calendar.GridRow>
            {/each}
          </Calendar.GridBody>
        </Calendar.Grid>
      {/each}
    {/snippet}
  </Calendar.Root>
{/snippet}

<svelte:window onclick={clickOutside} />

<div class="relative space-y-1" data-day-picker={id}>
  {#if showLabel}
    <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for={id}>{label}</label>
  {/if}
  <button
    {id}
    type="button"
    onclick={() => {
      if (!disabled) open = !open;
    }}
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label={label}
    {disabled}
    class={cn(
      "focus:border-accent/40 focus:ring-accent/30 flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-left text-sm text-slate-100 backdrop-blur transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
      !value && "text-slate-400"
    )}
  >
    <span>{value ? toDisplay(value) : placeholder}</span>
    <CalendarDays size={16} class="shrink-0 text-slate-400" aria-hidden="true" />
  </button>
  {#if required}
    <input tabindex="-1" class="sr-only" required bind:value />
  {/if}

  {#if open && isDesktop.current}
    <div
      class="absolute top-[calc(100%+0.5rem)] left-0 z-[100] min-w-72 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/95 p-4 shadow-[0_0_40px_rgba(0,0,0,0.4)] backdrop-blur"
      role="dialog"
      aria-label={label}
    >
      {@render calendarPanel()}
    </div>
  {/if}
</div>

{#if !isDesktop.current}
  <Sheet {open} onclose={() => (open = false)} title={label}>
    {@render calendarPanel()}
  </Sheet>
{/if}
