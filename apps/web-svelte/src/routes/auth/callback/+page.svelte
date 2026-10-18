<script lang="ts">
  import { afterNavigate, goto, replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import { completeAuthCallback } from "$lib/auth/callback";
  import * as m from "$lib/paraglide/messages";

  let error = $state<string | null>(null);

  let consumed = false;
  afterNavigate(() => {
    if (consumed) return;
    consumed = true;
    const currentUrl = new URL(window.location.href);
    // Keep credentials out of browser history even when verification fails.
    const cleanUrl = new URL(currentUrl);
    cleanUrl.hash = "";
    cleanUrl.searchParams.delete("code");
    replaceState(cleanUrl.pathname + cleanUrl.search, page.state);
    void completeAuthCallback(currentUrl)
      .then((target) => goto(target, { replaceState: true }))
      .catch(() => {
        error = m.auth_callback_error();
      });
  });
</script>

<div
  class="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 pt-(--safe-top)"
>
  {#if error}
    <div
      role="alert"
      class="rounded-xl border border-rose-500/20 bg-rose-500/10 px-6 py-4 text-sm text-rose-300"
    >
      {error}
      <a href="/login" class="ml-2 underline">{m.auth_callback_back_to_login()}</a>
    </div>
  {:else}
    <p class="text-sm text-slate-400">{m.common_loading()}</p>
  {/if}
</div>
