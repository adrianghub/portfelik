<script lang="ts">
  import * as m from "$lib/paraglide/messages";

  let { compact = false }: { compact?: boolean } = $props();
</script>

<span
  class="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold tracking-wide text-amber-200 uppercase"
  data-testid="demo-account-badge"
  title={m.demo_identity_badge_title()}
>
  {compact ? m.demo_identity_badge_short() : m.demo_identity_badge()}
</span>
