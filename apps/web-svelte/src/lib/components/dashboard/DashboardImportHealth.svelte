<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { fetchLastCommittedImportSession } from "$lib/services/bank-import";
  import { fetchProfile } from "$lib/services/profiles";
  import { supabase } from "$lib/supabase";
  import { formatDate } from "$lib/utils";
  import { createQuery } from "@tanstack/svelte-query";
  import { Landmark } from "lucide-svelte";

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

  const cadenceDays = $derived(
    profileQuery.data?.settings.alerts?.bankImportReminder?.cadenceDays ?? 30
  );

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
  class="rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
  aria-labelledby="dashboard-import-health-title"
>
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <p id="dashboard-import-health-title" class="text-eyebrow text-slate-400">
        {m.dashboard_import_health_title()}
      </p>
      {#if importHealthQuery.isPending}
        <div class="mt-2 h-5 w-48 animate-pulse rounded bg-slate-800/60"></div>
      {:else if importHealthQuery.data?.committed_at}
        <p class="mt-1 text-sm text-slate-200">
          {m.dashboard_import_health_last({
            date: formatDate(importHealthQuery.data.committed_at),
          })}
        </p>
        {#if isStale && daysSinceImport !== null}
          <p class="mt-0.5 text-xs text-amber-300/90">
            {m.dashboard_import_health_stale({ days: daysSinceImport })}
          </p>
        {:else if !isStale}
          <p class="mt-0.5 text-xs text-emerald-300/90">{m.dashboard_import_health_fresh()}</p>
        {/if}
      {:else}
        <p class="mt-1 text-sm text-slate-300">{m.dashboard_import_health_never()}</p>
      {/if}
    </div>
    <Landmark size={20} class="shrink-0 text-slate-400" aria-hidden="true" />
  </div>
  {#if isStale}
    <a
      href="/import"
      class="bg-accent-gradient mt-3 inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-colors hover:brightness-110"
    >
      {m.dashboard_import_health_cta()}
    </a>
  {/if}
</section>
