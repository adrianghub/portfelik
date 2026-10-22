<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { supabase } from "$lib/supabase";
  import { isDemoAccountUser } from "$lib/demo/identity-session";
  import { updateDemoName } from "$lib/services/profiles";
  import BrandMark from "$lib/components/BrandMark.svelte";
  import * as m from "$lib/paraglide/messages";

  let name = $state("");
  let ready = $state(false);
  let saving = $state(false);
  let error = $state(false);

  onMount(() => {
    let disposed = false;
    void supabase.auth
      .getUser()
      .then(({ data, error: authError }) => {
        if (disposed) return;
        if (authError || !data.user) {
          error = true;
        } else if (!isDemoAccountUser(data.user)) {
          void goto("/dashboard", { replaceState: true });
        } else {
          ready = true;
        }
      })
      .catch(() => {
        if (!disposed) error = true;
      });
    return () => {
      disposed = true;
    };
  });

  function finish() {
    // Refresh the layout profile too, so the account menu immediately uses the name.
    window.location.replace("/dashboard");
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!ready || saving || name.trim().length > 30) return;
    if (!name.trim()) return finish();
    saving = true;
    error = false;
    try {
      await updateDemoName(name);
      finish();
    } catch {
      error = true;
      saving = false;
    }
  }
</script>

<svelte:head><title>{m.demo_name_welcome()} · JakStoimy</title></svelte:head>

<section
  class="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/65 p-6 shadow-xl sm:p-8"
>
  <BrandMark />
  <h1 class="mt-8 text-2xl font-semibold text-slate-100">{m.demo_name_welcome()}</h1>
  <p class="mt-2 text-slate-300">{m.demo_name_question()}</p>
  <form class="mt-6 space-y-4" onsubmit={submit}>
    <label class="block text-sm text-slate-300">
      {m.demo_name_label()}
      <input
        type="text"
        bind:value={name}
        maxlength="30"
        autocomplete="nickname"
        aria-describedby="demo-name-optional"
        disabled={!ready || saving}
        class="focus:border-accent/40 mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-base text-slate-100 focus:outline-none"
      />
    </label>
    <p id="demo-name-optional" class="text-xs text-slate-400">{m.demo_name_optional()}</p>
    {#if error}<p role="alert" class="text-sm text-rose-300">{m.demo_name_error()}</p>{/if}
    <button
      type="submit"
      disabled={!ready || saving}
      class="bg-accent-gradient min-h-11 w-full rounded-full px-4 font-semibold text-slate-950 disabled:opacity-50"
    >
      {saving ? m.common_saving() : m.demo_name_continue()}
    </button>
    <button
      type="button"
      onclick={finish}
      disabled={saving}
      class="min-h-11 w-full rounded-full border border-white/10 px-4 text-sm text-slate-300 disabled:opacity-50"
    >
      {m.demo_name_skip()}
    </button>
  </form>
</section>
