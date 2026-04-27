<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { createQuery } from "@tanstack/svelte-query";
  import { supabase } from "$lib/supabase";
  import { fetchProfile } from "$lib/services/profiles";
  import CategoriesTab from "$lib/components/settings/CategoriesTab.svelte";
  import GroupsTab from "$lib/components/settings/GroupsTab.svelte";
  import ProfileTab from "$lib/components/settings/ProfileTab.svelte";
  import { cn } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  type Tab = "categories" | "groups" | "profile";

  const activeTab = $derived(($page.url.searchParams.get("tab") ?? "categories") as Tab);

  const tabs: { id: Tab; label: string }[] = [
    { id: "categories", label: m.settings_tab_categories() },
    { id: "groups", label: m.settings_tab_groups() },
    { id: "profile", label: m.settings_tab_profile() },
  ];

  let userId = $state<string | undefined>(undefined);
  supabase.auth.getSession().then(({ data }) => {
    userId = data.session?.user.id;
  });

  const profileQuery = createQuery(() => ({
    queryKey: ["profile", userId],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  }));

  const profile = $derived(profileQuery.data ?? null);

  function setTab(tab: Tab) {
    const params = new URLSearchParams($page.url.searchParams);
    params.set("tab", tab);
    goto(`/settings?${params.toString()}`, { replaceState: true });
  }
</script>

<div class="container mx-auto max-w-3xl space-y-4 px-4 py-6">
  <h1 class="text-xl font-semibold text-zinc-900">{m.settings_title()}</h1>

  <div role="tablist" aria-label={m.settings_title()} class="flex gap-1 rounded-xl bg-zinc-100 p-1">
    {#each tabs as tab (tab.id)}
      <button
        role="tab"
        type="button"
        aria-selected={activeTab === tab.id}
        tabindex={activeTab === tab.id ? 0 : -1}
        onclick={() => setTab(tab.id)}
        class={cn(
          "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none",
          activeTab === tab.id
            ? "bg-white text-zinc-900 shadow-sm"
            : "text-zinc-500 hover:text-zinc-700"
        )}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <div role="tabpanel">
    {#if activeTab === "categories"}
      <CategoriesTab />
    {:else if activeTab === "groups"}
      <GroupsTab />
    {:else if activeTab === "profile"}
      <ProfileTab {profile} />
    {/if}
  </div>
</div>
