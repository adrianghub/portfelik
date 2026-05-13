<script lang="ts">
  interface Props {
    value: number;
    size?: number;
    stroke?: number;
    label?: string;
  }

  let { value, size = 28, stroke = 3, label }: Props = $props();

  const radius = $derived((size - stroke) / 2);
  const circumference = $derived(2 * Math.PI * radius);
  const clamped = $derived(Math.max(0, Math.min(1, value)));
  const dashOffset = $derived(circumference * (1 - clamped));
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 {size} {size}"
  role="img"
  aria-label={label ?? `${Math.round(clamped * 100)}%`}
>
  <circle
    cx={size / 2}
    cy={size / 2}
    r={radius}
    stroke="currentColor"
    stroke-width={stroke}
    fill="none"
    class="text-slate-200 dark:text-slate-700"
  />
  <circle
    cx={size / 2}
    cy={size / 2}
    r={radius}
    stroke="currentColor"
    stroke-width={stroke}
    fill="none"
    stroke-linecap="round"
    stroke-dasharray={circumference}
    stroke-dashoffset={dashOffset}
    transform="rotate(-90 {size / 2} {size / 2})"
    class="text-emerald-500 transition-[stroke-dashoffset] duration-300"
  />
</svg>
