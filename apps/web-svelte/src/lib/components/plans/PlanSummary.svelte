<script lang="ts">
  import type { Snippet } from "svelte";
  let { children, label }: { children: Snippet; label: string } = $props();
</script>

<section
  class="rounded-2xl border border-white/5 bg-slate-900/60 p-5 sm:p-6"
  aria-label={label}
  data-testid="plan-summary"
>
  {@render children()}
</section>
