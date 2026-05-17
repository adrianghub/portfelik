<script lang="ts">
  interface Props {
    value: number;
    size?: number;
    stroke?: number;
    label?: string;
    /** Render a soft glow halo behind the stroke (used on dashboard hero). */
    glow?: boolean;
  }

  let { value, size = 28, stroke = 3, label, glow = false }: Props = $props();

  const radius = $derived((size - stroke) / 2);
  const circumference = $derived(2 * Math.PI * radius);
  const clamped = $derived(Math.max(0, Math.min(1, value)));
  const dashOffset = $derived(circumference * (1 - clamped));
  const uid = $derived(`pr-${Math.random().toString(36).slice(2, 8)}`);
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 {size} {size}"
  role="img"
  aria-label={label ?? `${Math.round(clamped * 100)}%`}
  style={glow ? "filter: drop-shadow(0 0 6px var(--color-accent-glow));" : undefined}
>
  <defs>
    <linearGradient id={uid} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="var(--color-accent-from)" />
      <stop offset="100%" stop-color="var(--color-accent-to)" />
    </linearGradient>
  </defs>
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
    stroke={`url(#${uid})`}
    stroke-width={stroke}
    fill="none"
    stroke-linecap="round"
    stroke-dasharray={circumference}
    stroke-dashoffset={dashOffset}
    transform="rotate(-90 {size / 2} {size / 2})"
    class="transition-[stroke-dashoffset] duration-300"
  />
</svg>
