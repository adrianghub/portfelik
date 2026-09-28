<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { fetchLastCommittedImportSession } from "$lib/services/bank-import";
  import { isCommittedImportStale } from "$lib/services/import-staleness";
  import { fetchProfile } from "$lib/services/profiles";
  import { getBankImportReminder } from "$lib/profile-settings";
  import { supabase } from "$lib/supabase";
  import { createQuery } from "@tanstack/svelte-query";
  import { session } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";
  import { ChevronRight } from "lucide-svelte";

  const profileQuery = createQuery(() => ({
    queryKey: qk.profile(session.userId!),
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("not_authenticated");
      return fetchProfile(user.id);
    },
    enabled: () => !!session.userId,
  }));

  const importHealthQuery = createQuery(() => ({
    queryKey: qk.importHealth(session.userId!),
    queryFn: fetchLastCommittedImportSession,
    enabled: () => !!session.userId,
  }));

  const reminder = $derived(getBankImportReminder(profileQuery.data?.settings));

  const daysSinceImport = $derived.by(() => {
    const committedAt = importHealthQuery.data?.committed_at;
    if (!committedAt) return null;
    const committed = new Date(committedAt);
    const now = new Date();
    return Math.floor((now.getTime() - committed.getTime()) / (1000 * 60 * 60 * 24));
  });

  const show = $derived(
    profileQuery.isSuccess &&
      importHealthQuery.isSuccess &&
      isCommittedImportStale({
        enabled: reminder.enabled,
        committedAt: importHealthQuery.data?.committed_at ?? null,
        cadenceDays: reminder.cadenceDays,
        now: new Date(),
      })
  );
</script>

{#if show && daysSinceImport !== null}
  <a
    href="/import"
    class="focus-visible:ring-accent inline-flex items-center gap-1 text-sm font-medium text-amber-200 focus-visible:ring-2 focus-visible:outline-none"
  >
    {m.dashboard_import_health_stale({ days: daysSinceImport })}
    <ChevronRight size={14} aria-hidden="true" />
  </a>
{/if}
