<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { supabase } from "$lib/supabase";
  import { fetchProfile } from "$lib/services/profiles";
  import type { Profile } from "$lib/types";
  import { formatDate } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  let profiles = $state<Profile[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      goto("/login");
      return;
    }

    const currentProfile = await fetchProfile(sessionData.session.user.id).catch(() => null);
    if (currentProfile?.role !== "admin") {
      goto("/transactions");
      return;
    }

    const { data, error: err } = await supabase
      .from("profiles")
      .select("id, email, name, role, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (err) {
      error = err.message;
    } else {
      profiles = (data ?? []) as Profile[];
    }
    loading = false;
  });
</script>

<div class="container mx-auto max-w-4xl space-y-4 px-4 py-6">
  <h1 class="text-xl font-semibold text-zinc-900">{m.admin_title()}</h1>
  <h2 class="text-base font-medium text-zinc-700">{m.admin_users_title()}</h2>

  {#if loading}
    <div class="space-y-2">
      {#each [0, 1, 2, 3] as _, i (i)}
        <div class="h-10 animate-pulse rounded-lg bg-zinc-100"></div>
      {/each}
    </div>
  {:else if error}
    <p class="text-sm text-rose-600">{error}</p>
  {:else if profiles.length === 0}
    <p class="py-8 text-center text-sm text-zinc-400">{m.admin_users_empty()}</p>
  {:else}
    <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-zinc-100 bg-zinc-50">
            <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500"
              >{m.admin_users_col_email()}</th
            >
            <th class="hidden px-4 py-3 text-left text-xs font-medium text-zinc-500 sm:table-cell"
              >{m.admin_users_col_name()}</th
            >
            <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500"
              >{m.admin_users_col_role()}</th
            >
            <th class="hidden px-4 py-3 text-left text-xs font-medium text-zinc-500 md:table-cell"
              >{m.admin_users_col_created()}</th
            >
          </tr>
        </thead>
        <tbody>
          {#each profiles as p (p.id)}
            <tr class="border-b border-zinc-50 last:border-0">
              <td class="px-4 py-3 text-zinc-900">{p.email}</td>
              <td class="hidden px-4 py-3 text-zinc-500 sm:table-cell">{p.name ?? "—"}</td>
              <td class="px-4 py-3 text-zinc-500">{p.role}</td>
              <td class="hidden px-4 py-3 text-zinc-400 md:table-cell"
                >{formatDate(p.created_at)}</td
              >
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
