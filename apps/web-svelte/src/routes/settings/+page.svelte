<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { createQuery } from "@tanstack/svelte-query";
  import { supabase } from "$lib/supabase";
  import { fetchProfile } from "$lib/services/profiles";
  import CategoriesTab from "$lib/components/settings/CategoriesTab.svelte";
  import GroupsTab from "$lib/components/settings/GroupsTab.svelte";
  import ProfileTab from "$lib/components/settings/ProfileTab.svelte";
  import PersonalizationTab from "$lib/components/settings/PersonalizationTab.svelte";
  import ShoppingItemCategoriesTab from "$lib/components/settings/ShoppingItemCategoriesTab.svelte";
  import RulesTab from "$lib/components/settings/RulesTab.svelte";
  import { cn } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  type Tab =
    | "personalization"
    | "categories"
    | "shopping-item-categories"
    | "rules"
    | "groups"
    | "profile";

  const activeTab = $derived(($page.url.searchParams.get("tab") ?? "categories") as Tab);

  const tabs: { id: Tab; label: string }[] = [
    { id: "categories", label: m.settings_tab_categories() },
    { id: "shopping-item-categories", label: m.settings_tab_shopping_item_categories() },
    { id: "rules", label: m.settings_tab_rules() },
    { id: "groups", label: m.settings_tab_groups() },
    { id: "profile", label: m.settings_tab_profile() },
    { id: "personalization", label: m.settings_tab_personalization() },
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

<svelte:head>
  <title>{m.settings_title()} · Portfelik</title>
</svelte:head>

<div class="container mx-auto max-w-3xl space-y-4 px-4 py-6">
  <h1 class="text-hero font-semibold text-slate-100">{m.settings_title()}</h1>

  <div class="relative">
    <div
      role="tablist"
      aria-label={m.settings_title()}
      class="no-accent-scrollbar flex w-full gap-1 overflow-x-auto rounded-full border border-white/5 bg-slate-900/60 p-1 backdrop-blur md:grid md:grid-cols-6 md:overflow-visible"
    >
      {#each tabs as tab (tab.id)}
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === tab.id}
          tabindex={activeTab === tab.id ? 0 : -1}
          onclick={() => setTab(tab.id)}
          class={cn(
            "focus-visible:ring-accent shrink-0 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none md:min-w-0 md:shrink",
            activeTab === tab.id
              ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
              : "text-slate-400 hover:text-slate-100"
          )}
        >
          {tab.label}
        </button>
      {/each}
    </div>
    <div
      class="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-full bg-linear-to-l from-slate-950 to-transparent md:hidden"
      aria-hidden="true"
    ></div>
  </div>

  <div role="tabpanel">
    {#if activeTab === "categories"}
      <CategoriesTab />
    {:else if activeTab === "shopping-item-categories"}
      <ShoppingItemCategoriesTab />
    {:else if activeTab === "rules"}
      <RulesTab />
    {:else if activeTab === "groups"}
      <GroupsTab />
    {:else if activeTab === "profile"}
      <ProfileTab {profile} />
    {:else if activeTab === "personalization"}
      <PersonalizationTab {profile} />
    {/if}
  </div>
</div>
