<script lang="ts">
  import { untrack } from "svelte";
  import { monthName, monthYearLabel } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
    onchange: (startYear: number, startMonth: number, endYear: number, endMonth: number) => void;
  }
  let { startYear, startMonth, endYear, endMonth, onchange }: Props = $props();

  let open = $state(false);
  let draftStartYear = $state(untrack(() => startYear));
  let draftStartMonth = $state(untrack(() => startMonth));
  let draftEndYear = $state(untrack(() => endYear));
  let draftEndMonth = $state(untrack(() => endMonth));

  const isSingleMonth = $derived(startYear === endYear && startMonth === endMonth);
  const label = $derived(
    isSingleMonth
      ? monthYearLabel(startYear, startMonth)
      : `${monthYearLabel(startYear, startMonth)} – ${monthYearLabel(endYear, endMonth)}`
  );

  const now = new Date();
  const currentYear = now.getFullYear();
  const years = Array.from({ length: 12 }, (_, i) => currentYear + 1 - i); // next year + current + 10 years back
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  function openPicker() {
    draftStartYear = startYear;
    draftStartMonth = startMonth;
    draftEndYear = endYear;
    draftEndMonth = endMonth;
    open = true;
  }

  function apply() {
    // Swap if end < start
    const startMs = new Date(draftStartYear, draftStartMonth - 1).getTime();
    const endMs = new Date(draftEndYear, draftEndMonth - 1).getTime();
    if (endMs < startMs) {
      onchange(draftEndYear, draftEndMonth, draftStartYear, draftStartMonth);
    } else {
      onchange(draftStartYear, draftStartMonth, draftEndYear, draftEndMonth);
    }
    open = false;
  }

  function clickOutside(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (!t.closest("[data-month-range-picker]")) open = false;
  }
</script>

<svelte:window onclick={clickOutside} />

<div class="relative" data-month-range-picker>
  <button
    type="button"
    onclick={openPicker}
    class="flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none"
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

  {#if open}
    <div
      class="absolute top-11 left-0 z-50 w-72 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg"
      role="dialog"
      aria-label="Wybierz zakres miesięcy"
    >
      <div class="space-y-3">
        <div>
          <p class="mb-1.5 text-xs font-medium text-zinc-500">Od</p>
          <div class="flex gap-2">
            <select
              bind:value={draftStartMonth}
              class="flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm capitalize focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
            >
              {#each months as mo (mo)}
                <option value={mo} class="capitalize">{monthName(mo)}</option>
              {/each}
            </select>
            <select
              bind:value={draftStartYear}
              class="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
            >
              {#each years as yr (yr)}
                <option value={yr}>{yr}</option>
              {/each}
            </select>
          </div>
        </div>

        <div>
          <p class="mb-1.5 text-xs font-medium text-zinc-500">Do</p>
          <div class="flex gap-2">
            <select
              bind:value={draftEndMonth}
              class="flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm capitalize focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
            >
              {#each months as mo (mo)}
                <option value={mo} class="capitalize">{monthName(mo)}</option>
              {/each}
            </select>
            <select
              bind:value={draftEndYear}
              class="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
            >
              {#each years as yr (yr)}
                <option value={yr}>{yr}</option>
              {/each}
            </select>
          </div>
        </div>
      </div>

      <div class="mt-4 flex gap-2">
        <button
          type="button"
          onclick={() => (open = false)}
          class="flex-1 rounded-lg border border-zinc-200 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          {m.common_cancel()}
        </button>
        <button
          type="button"
          onclick={apply}
          class="flex-1 rounded-lg bg-zinc-900 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          {m.common_apply()}
        </button>
      </div>
    </div>
  {/if}
</div>
