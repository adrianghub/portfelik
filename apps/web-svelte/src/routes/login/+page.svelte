<script lang="ts">
  import { supabase } from "$lib/supabase";
  import { goto } from "$app/navigation";
  import * as m from "$lib/paraglide/messages";

  let email = $state("");
  let password = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function signInWithEmail(e: SubmitEvent) {
    e.preventDefault();
    if (!email) {
      error = m.login_error_email_required();
      return;
    }
    if (!password) {
      error = m.login_error_password_required();
      return;
    }

    loading = true;
    error = null;

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      if (authError.message.includes("Invalid login credentials")) {
        error = m.login_error_invalid_credentials();
      } else if (authError.status === 429) {
        error = m.login_error_too_many_attempts();
      } else {
        error = m.login_error_generic();
      }
      loading = false;
      return;
    }

    goto("/");
  }

  async function signInWithGoogle() {
    loading = true;
    error = null;
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) {
      error = m.login_error_generic();
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>{m.app_name()} – {m.login_sign_in()}</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
  <div class="w-full max-w-sm rounded-2xl border border-zinc-100 bg-white p-8 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
    <h1 class="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{m.login_title()}</h1>
    <p class="mb-6 text-sm text-zinc-500 dark:text-zinc-400">{m.login_description()}</p>

    {#if error}
      <div class="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
        {error}
      </div>
    {/if}

    <form onsubmit={signInWithEmail} class="space-y-4">
      <div>
        <label for="email" class="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {m.login_email()}
        </label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder={m.login_email_placeholder()}
          autocomplete="email"
          disabled={loading}
          class="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 focus:outline-none disabled:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400 dark:focus:ring-zinc-400 dark:disabled:bg-zinc-700"
        />
      </div>

      <div>
        <label for="password" class="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {m.login_password()}
        </label>
        <input
          id="password"
          type="password"
          bind:value={password}
          autocomplete="current-password"
          disabled={loading}
          class="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 focus:outline-none disabled:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400 dark:focus:ring-zinc-400 dark:disabled:bg-zinc-700"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        class="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
      >
        {loading ? m.login_signing_in() : m.login_sign_in()}
      </button>
    </form>

    <div class="my-5 flex items-center gap-3">
      <div class="h-px flex-1 bg-zinc-200 dark:bg-zinc-700"></div>
      <span class="text-xs text-zinc-400 dark:text-zinc-500">lub</span>
      <div class="h-px flex-1 bg-zinc-200 dark:bg-zinc-700"></div>
    </div>

    <button
      type="button"
      onclick={signInWithGoogle}
      disabled={loading}
      class="flex w-full items-center justify-center gap-2.5 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-100"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M17.64 9.2045C17.64 8.5663 17.5827 7.9527 17.4764 7.3636H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.2045Z"
          fill="#4285F4"
        />
        <path
          d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65591 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z"
          fill="#34A853"
        />
        <path
          d="M3.96409 10.71C3.78409 10.17 3.68182 9.5931 3.68182 9C3.68182 8.4069 3.78409 7.83 3.96409 7.29V4.9582H0.957275C0.347727 6.1731 0 7.5477 0 9C0 10.4523 0.347727 11.8269 0.957275 13.0418L3.96409 10.71Z"
          fill="#FBBC05"
        />
        <path
          d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z"
          fill="#EA4335"
        />
      </svg>
      {m.login_sign_in_google()}
    </button>
  </div>
</div>
