<script lang="ts">
  import * as m from "$lib/paraglide/messages";

  let { onclick }: { onclick: () => void } = $props();
</script>

<button
  type="button"
  class="focus-visible:ring-accent mt-2 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
  {onclick}
>
  {m.dashboard_see_more()} →
</button>
