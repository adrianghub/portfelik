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
    /** How many years before today appear in the year dropdown. */
    yearsPast?: number;
    /** How many years after today appear in the year dropdown (e.g. loan payoff). */
    yearsAhead?: number;
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
    yearsPast = 100,
    yearsAhead = 35,
  }: Props = $props();

  const isDesktop = new MediaQuery("(min-width: 640px)");
  const locale = "pl";
  const tz = getLocalTimeZone();
  let open = $state(false);
  let triggerRef = $state<HTMLButtonElement | null>(null);
  let dropAnchorY = $state(0);
  let dropLeft = $state(0);
  let dropWidth = $state(320);
  let dropAbove = $state(false);
  let calendarPlaceholder = $state<DateValue>(today(tz));

  const POPOVER_HEIGHT_PX = 380;
  const VIEWPORT_PADDING_PX = 8;

  const selectClass =
    "max-w-[9.5rem] min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 text-sm text-slate-100 capitalize focus:border-accent/40 focus:outline-none";

  const selected = $derived(toValue(value));

  const yearOptions = $derived.by(() => {
    const currentYear = today(tz).year;
    const from = currentYear - yearsPast;
    const to = currentYear + yearsAhead;
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  });

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

  function syncCalendarPlaceholder() {
    calendarPlaceholder = selected ?? today(tz);
  }

  function handleValueChange(next: DateValue | undefined) {
    if (!next) {
      value = "";
      return;
    }
    value = next.toString();
    open = false;
  }

  function updatePopoverPosition() {
    if (!triggerRef || typeof window === "undefined") return;
    const rect = triggerRef.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewTop = vv?.offsetTop ?? 0;
    const viewLeft = vv?.offsetLeft ?? 0;
    const viewHeight = vv?.height ?? window.innerHeight;
    const viewWidth = vv?.width ?? window.innerWidth;
    const viewBottom = viewTop + viewHeight;
    const spaceBelow = viewBottom - rect.bottom - VIEWPORT_PADDING_PX;
    const spaceAbove = rect.top - viewTop - VIEWPORT_PADDING_PX;
    dropAbove = spaceBelow < POPOVER_HEIGHT_PX && spaceAbove > spaceBelow;
    dropWidth = Math.max(rect.width, 320);
    const maxLeft = viewWidth - dropWidth - VIEWPORT_PADDING_PX;
    dropLeft = Math.max(VIEWPORT_PADDING_PX, Math.min(rect.left - viewLeft, maxLeft));
    dropAnchorY = dropAbove ? rect.top - 4 : rect.bottom + 4;
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function toggleOpen() {
    if (disabled) return;
    if (!open) {
      syncCalendarPlaceholder();
      if (isDesktop.current) updatePopoverPosition();
    }
    open = !open;
  }

  function clickOutside(e: MouseEvent) {
    if (!isDesktop.current || !open) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(`[data-day-picker="${id}"]`) ||
      target.closest(`[data-day-picker-popover="${id}"]`)
    ) {
      return;
    }
    open = false;
  }

  $effect(() => {
    if (!open) syncCalendarPlaceholder();
  });

  $effect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    const handler = () => {
      if (open && isDesktop.current) updatePopoverPosition();
    };
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    vv?.addEventListener("resize", handler);
    vv?.addEventListener("scroll", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
      vv?.removeEventListener("resize", handler);
      vv?.removeEventListener("scroll", handler);
    };
  });

  $effect(() => {
    if (open && isDesktop.current) updatePopoverPosition();
  });
</script>

{#snippet calendarPanel()}
  <Calendar.Root
    class="rounded-xl border border-white/5 bg-slate-900/60 p-3"
    type="single"
    value={selected}
    onValueChange={handleValueChange}
    bind:placeholder={calendarPlaceholder}
    {locale}
    weekdayFormat="short"
    weekStartsOn={1}
    fixedWeeks
    disableDaysOutsideMonth={false}
    calendarLabel={label}
  >
    {#snippet children({ months, weekdays })}
      <Calendar.Header class="mb-2 flex items-center justify-between gap-1">
        <Calendar.PrevButton
          class="shrink-0 rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/5"
          aria-label={m.day_picker_previous_month()}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </Calendar.PrevButton>
        <div class="flex min-w-0 flex-1 items-center justify-center gap-1">
          <Calendar.MonthSelect
            class={selectClass}
            monthFormat="long"
            aria-label={m.day_picker_select_month()}
          />
          <Calendar.YearSelect
            class={selectClass}
            years={yearOptions}
            yearFormat="numeric"
            aria-label={m.day_picker_select_year()}
          />
        </div>
        <Calendar.NextButton
          class="shrink-0 rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/5"
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
    bind:this={triggerRef}
    {id}
    type="button"
    onclick={toggleOpen}
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
      use:portal
      data-day-picker-popover={id}
      class="fixed z-[100] overflow-hidden rounded-2xl border border-white/5 bg-slate-900/95 p-4 shadow-[0_0_40px_rgba(0,0,0,0.4)] backdrop-blur"
      style="top: {dropAnchorY}px; left: {dropLeft}px; width: {dropWidth}px; transform: translateY({dropAbove
        ? '-100%'
        : '0'});"
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
