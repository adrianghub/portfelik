<script lang="ts">
  interface Props {
    value: number;
    max: number;
    label?: string;
  }
  let { value, max, label }: Props = $props();
  const pct = $derived(max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0);
</script>

<div
  role="progressbar"
  aria-valuemin={0}
  aria-valuemax={max}
  aria-valuenow={value}
  aria-label={label}
  class="h-1.5 w-full overflow-hidden rounded-full bg-slate-800"
>
  <div
    class="h-full rounded-full bg-emerald-500 transition-all duration-300"
    style="width: {pct}%"
  ></div>
</div>
