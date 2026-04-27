<script lang="ts">
  import { monthName } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    year: number;
    month: number;
    onchange: (year: number, month: number) => void;
  }
  let { year, month, onchange }: Props = $props();

  function prev() {
    if (month === 1) onchange(year - 1, 12);
    else onchange(year, month - 1);
  }

  function next() {
    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
    if (isCurrentMonth) return;
    if (month === 12) onchange(year + 1, 1);
    else onchange(year, month + 1);
  }

  const isCurrent = $derived(() => {
    const now = new Date();
    return year === now.getFullYear() && month === now.getMonth() + 1;
  });
</script>

<div class="flex items-center gap-1">
  <button
    type="button"
    onclick={prev}
    aria-label={m.month_picker_prev()}
    class="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg
    >
  </button>

  <span class="w-32 text-center text-sm font-medium text-zinc-900 capitalize select-none">
    {monthName(month)}
    {year}
  </span>

  <button
    type="button"
    onclick={next}
    disabled={isCurrent()}
    aria-label={m.month_picker_next()}
    class="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg
    >
  </button>
</div>
