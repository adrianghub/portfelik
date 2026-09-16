<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { consumeLoginRedirect } from "$lib/auth-redirect";
  import { supabase } from "$lib/supabase";
  import * as m from "$lib/paraglide/messages";

  let error = $state<string | null>(null);

  onMount(async () => {
    const currentUrl = new URL(window.location.href);
    // PKCE flow: Supabase redirects with ?code=
    const code = currentUrl.searchParams.get("code");
    if (code) {
      const { error: authError } = await supabase.auth.exchangeCodeForSession(code);
      if (authError) {
        error = m.login_error_generic();
        return;
      }
      goto(consumeLoginRedirect(currentUrl), { replaceState: true });
      return;
    }

    // Implicit flow: Supabase client auto-exchanges tokens from URL hash.
    // Session may already be set in localStorage by the time we get here.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      goto(consumeLoginRedirect(currentUrl), { replaceState: true });
      return;
    }

    // Wait up to 3s for auth state change in case client is still processing hash
    const timer = setTimeout(() => {
      error = m.login_error_generic();
    }, 3000);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        clearTimeout(timer);
        subscription.unsubscribe();
        goto(consumeLoginRedirect(currentUrl), { replaceState: true });
      }
    });
  });
</script>

<div
  class="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 pt-(--safe-top)"
>
  {#if error}
    <div
      class="rounded-xl border border-rose-500/20 bg-rose-500/10 px-6 py-4 text-sm text-rose-300"
    >
      {error}
      <a href="/login" class="ml-2 underline">{m.auth_callback_back_to_login()}</a>
    </div>
  {:else}
    <p class="text-sm text-slate-400">{m.common_loading()}</p>
  {/if}
</div>
