<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { fetchLastCommittedImportSession } from "$lib/services/bank-import";
  import { fetchProfile } from "$lib/services/profiles";
  import { getBankImportReminder } from "$lib/profile-settings";
  import { supabase } from "$lib/supabase";
  import { cn, formatDate } from "$lib/utils";
  import { createQuery } from "@tanstack/svelte-query";
  import { ChevronRight, Landmark } from "lucide-svelte";

  const profileQuery = createQuery(() => ({
    queryKey: ["profile"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("not_authenticated");
      return fetchProfile(user.id);
    },
  }));

  const importHealthQuery = createQuery(() => ({
    queryKey: ["import-health"],
    queryFn: fetchLastCommittedImportSession,
  }));

  const cadenceDays = $derived(getBankImportReminder(profileQuery.data?.settings).cadenceDays);

  const daysSinceImport = $derived.by(() => {
    const session = importHealthQuery.data;
    if (!session?.committed_at) return null;
    const committed = new Date(session.committed_at);
    const now = new Date();
    return Math.floor((now.getTime() - committed.getTime()) / (1000 * 60 * 60 * 24));
  });

  const isStale = $derived(daysSinceImport === null ? true : daysSinceImport >= cadenceDays);
</script>

<section
  class="flex h-full min-w-0 flex-col overflow-x-clip rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
  aria-labelledby="dashboard-import-health-title"
>
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0 flex-1">
      <p id="dashboard-import-health-title" class="text-eyebrow text-slate-400">
        {m.dashboard_import_health_title()}
      </p>
      {#if importHealthQuery.isPending}
        <div class="mt-2 h-4 w-40 animate-pulse rounded bg-slate-800/60"></div>
      {:else if importHealthQuery.data?.committed_at}
        <p class="mt-1.5 text-sm text-slate-200">
          {m.dashboard_import_health_last({
            date: formatDate(importHealthQuery.data.committed_at),
          })}
        </p>
        <p class={cn("mt-0.5 text-xs", isStale ? "text-amber-300/90" : "text-emerald-300/80")}>
          {#if isStale && daysSinceImport !== null}
            {m.dashboard_import_health_stale({ days: daysSinceImport })}
          {:else if !isStale}
            {m.dashboard_import_health_fresh()}
          {/if}
        </p>
      {:else}
        <p class="mt-1.5 text-sm text-slate-300">{m.dashboard_import_health_never()}</p>
      {/if}
      <p class="mt-1 text-xs text-slate-500">
        {m.dashboard_import_health_cadence({ days: cadenceDays })}
      </p>
    </div>
    <Landmark size={18} class="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
  </div>

  <a
    href="/import"
    class={cn(
      "focus-visible:ring-accent mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none",
      isStale ? "text-emerald-400 hover:underline" : "text-slate-400 hover:text-slate-300"
    )}
  >
    {isStale ? m.dashboard_import_health_cta() : m.dashboard_import_health_review()}
    <ChevronRight size={14} aria-hidden="true" />
  </a>
</section>
