<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { redirectTargetFromUrl } from "$lib/auth-redirect";
  import { supabase } from "$lib/supabase";
  import { isDemoAccountUser } from "$lib/demo/identity-session";
  import { fetchProfile, updateProfile } from "$lib/services/profiles";
  import BrandMark from "$lib/components/BrandMark.svelte";
  import * as m from "$lib/paraglide/messages";

  const recovery = $derived(page.url.searchParams.get("mode") === "recovery");
  let name = $state("");
  let password = $state("");
  let confirmation = $state("");
  let email = $state("");
  let userId = $state("");
  let ready = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user?.email_confirmed_at || isDemoAccountUser(data.user))
        throw new Error("unverified");
      email = data.user.email ?? "";
      userId = data.user.id;
      if (!recovery) name = (await fetchProfile(data.user.id)).name ?? "";
      ready = true;
    } catch {
      error = m.auth_setup_session_error();
    }
  });

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!ready || saving) return;
    if (!recovery && !name.trim()) {
      error = m.auth_display_name_required();
      return;
    }
    if (password !== confirmation) {
      error = m.auth_password_mismatch();
      return;
    }
    saving = true;
    error = null;
    try {
      // Revalidate the identity at submission; never trust an identity from a URL.
      const { data, error: authError } = await supabase.auth.getUser();
      if (
        authError ||
        !data.user?.email_confirmed_at ||
        isDemoAccountUser(data.user) ||
        data.user.id !== userId ||
        data.user.email !== email
      ) {
        throw new Error("unverified");
      }
      if (!recovery) await updateProfile(data.user.id, { name: name.trim() });
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;
      password = "";
      confirmation = "";
      await goto(redirectTargetFromUrl(page.url), { replaceState: true });
    } catch {
      error = m.auth_setup_save_error();
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>{m.auth_setup_title()} | {m.app_name()}</title></svelte:head>

<main class="mx-auto min-h-screen w-full max-w-md px-4 py-12">
  <BrandMark size="sm" class="mb-6" />
  <section class="rounded-2xl border border-white/10 bg-slate-900 p-6">
    <h1 class="text-2xl font-semibold text-slate-100">{m.auth_setup_title()}</h1>
    <p class="mt-3 text-sm text-slate-400">
      {recovery ? m.auth_recovery_body() : m.auth_setup_body()}
    </p>
    {#if error}<p role="alert" class="mt-4 text-sm text-rose-300">{error}</p>{/if}
    {#if ready}
      <p class="mt-4 text-sm text-slate-300">{email}</p>
      <form onsubmit={save} class="mt-5 space-y-4">
        {#if !recovery}
          <div>
            <label for="setup-name" class="mb-1 block text-sm text-slate-200"
              >{m.auth_display_name()}</label
            >
            <input
              id="setup-name"
              bind:value={name}
              required
              maxlength="80"
              autocomplete="nickname"
              disabled={saving}
              class="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-slate-100"
            />
          </div>
        {/if}
        <div>
          <label for="setup-password" class="mb-1 block text-sm text-slate-200"
            >{m.login_password()}</label
          >
          <input
            id="setup-password"
            type="password"
            bind:value={password}
            required
            minlength="8"
            autocomplete="new-password"
            disabled={saving}
            aria-describedby="password-hint"
            class="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-slate-100"
          />
          <p id="password-hint" class="mt-1 text-xs text-slate-400">{m.auth_password_hint()}</p>
        </div>
        <div>
          <label for="setup-confirmation" class="mb-1 block text-sm text-slate-200"
            >{m.auth_confirm_password()}</label
          >
          <input
            id="setup-confirmation"
            type="password"
            bind:value={confirmation}
            required
            minlength="8"
            autocomplete="new-password"
            disabled={saving}
            class="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-slate-100"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          class="bg-accent-gradient w-full rounded-full px-4 py-2.5 font-semibold text-slate-950 disabled:opacity-50"
          >{saving ? m.common_saving() : m.auth_save_and_continue()}</button
        >
      </form>
    {:else if !error}
      <p role="status" class="mt-4 text-sm text-slate-400">{m.common_loading()}</p>
    {/if}
    <a href="/login" class="mt-5 block text-sm text-slate-400 underline"
      >{m.auth_callback_back_to_login()}</a
    >
  </section>
</main>
