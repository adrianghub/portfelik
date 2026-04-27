<script lang="ts">
  import { createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { updateProfile } from "$lib/services/profiles";
  import { deleteAccount } from "$lib/services/groups";
  import { supabase } from "$lib/supabase";
  import { goto } from "$app/navigation";
  import type { Profile } from "$lib/types";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import { toast } from "svelte-sonner";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    profile: Profile | null;
  }
  let { profile }: Props = $props();

  const queryClient = useQueryClient();

  let editing = $state(false);
  let nameInput = $state("");

  function startEdit() {
    nameInput = profile?.name ?? "";
    editing = true;
  }

  const mutation = createMutation(() => ({
    mutationFn: () => updateProfile(profile!.id, { name: nameInput }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(m.toast_profile_updated());
      editing = false;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  let showDeleteConfirm = $state(false);
  let deleteError = $state<string | null>(null);

  const deleteMutation = createMutation(() => ({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      toast.success(m.toast_account_deleted());
      await supabase.auth.signOut();
      goto("/login");
    },
    onError: (err: Error) => {
      if (err.message?.includes("has_owned_groups")) {
        deleteError = m.profile_delete_account_has_groups();
      } else {
        deleteError = null;
        toast.error(m.toast_error());
      }
    },
  }));

  function handleSubmit(e: Event) {
    e.preventDefault();
    mutation.mutate();
  }
</script>

{#if !profile}
  <div class="h-32 animate-pulse rounded-xl bg-zinc-100"></div>
{:else}
  <div class="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
    <div class="flex items-center justify-between gap-3 px-4 py-3">
      <span class="shrink-0 text-sm text-zinc-500">{m.profile_name()}</span>
      {#if editing}
        <form onsubmit={handleSubmit} class="flex flex-1 items-center gap-2">
          <!-- svelte-ignore a11y_autofocus -->
          <input
            type="text"
            bind:value={nameInput}
            autofocus
            class="flex-1 rounded-lg border border-zinc-200 px-2 py-1 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
          />
          <button
            type="submit"
            disabled={mutation.isPending}
            class="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {mutation.isPending ? m.common_saving() : m.common_save()}
          </button>
          <button
            type="button"
            onclick={() => (editing = false)}
            class="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            {m.common_cancel()}
          </button>
        </form>
      {:else}
        <div class="flex items-center gap-2">
          <span class="text-sm text-zinc-900">{profile.name ?? "—"}</span>
          <button
            onclick={startEdit}
            class="p-1 text-zinc-400 transition-colors hover:text-zinc-600"
            aria-label={m.common_edit()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
            >
          </button>
        </div>
      {/if}
    </div>
    <div class="flex justify-between px-4 py-3">
      <span class="text-sm text-zinc-500">{m.profile_email()}</span>
      <span class="text-sm text-zinc-900">{profile.email}</span>
    </div>
    <div class="flex justify-between px-4 py-3">
      <span class="text-sm text-zinc-500">{m.profile_role()}</span>
      <span class="text-sm text-zinc-900">
        {profile.role === "admin" ? m.profile_role_admin() : m.profile_role_user()}
      </span>
    </div>
  </div>

  <div class="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
    <p class="text-sm font-medium text-rose-700">{m.profile_delete_account()}</p>
    <p class="mt-1 text-xs text-rose-600">{m.profile_delete_account_confirm()}</p>
    {#if deleteError}
      <p class="mt-2 text-xs font-medium text-rose-700">{deleteError}</p>
    {/if}
    <button
      type="button"
      onclick={() => {
        deleteError = null;
        showDeleteConfirm = true;
      }}
      class="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-100"
    >
      {m.profile_delete_account()}
    </button>
  </div>
{/if}

<ConfirmDialog
  open={showDeleteConfirm}
  message={m.profile_delete_account_confirm()}
  onconfirm={() => deleteMutation.mutate()}
  onclose={() => (showDeleteConfirm = false)}
  pending={deleteMutation.isPending}
/>
