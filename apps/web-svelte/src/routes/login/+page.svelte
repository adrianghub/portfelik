<script lang="ts">
  import { supabase } from "$lib/supabase";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { forgetDemoAccess, hasDemoBinding, hasParkedSession } from "$lib/demo/identity-session";
  import { flushDeviceAuthStorage, initializeDeviceAuthStorage } from "$lib/auth/device-storage";
  import {
    clearLoginRedirect,
    redirectTargetFromUrl,
    rememberLoginRedirect,
  } from "$lib/auth-redirect";
  import BrandMark from "$lib/components/BrandMark.svelte";
  import DemoTurnstile from "$lib/components/demo/DemoTurnstile.svelte";
  import { oauthCallbackUrl, signInWithGoogleOAuth } from "$lib/services/oauth";
  import { openDemoAccount, requestAccountSwitch } from "$lib/services/open-demo-account";
  import { isNativeCapacitor } from "$lib/services/pwa";
  import { appVersion } from "$lib/content/changelog";
  import * as m from "$lib/paraglide/messages";

  let email = $state("");
  let password = $state("");
  let loading = $state(false);
  let demoLoading = $state(false);
  const demoSiteKey = __DEMO_TURNSTILE_SITE_KEY__;
  let demoToken = $state("");
  let demoChallengeAttempt = $state(0);
  let error = $state<string | null>(null);
  const nativeLogin = $derived(isNativeCapacitor());
  const accountTarget = $derived(page.url.searchParams.get("account"));
  const switchFailed = $derived(page.url.searchParams.has("switchFailed"));
  const showReal = $derived(accountTarget !== "demo" || switchFailed);
  const showDemo = $derived(accountTarget !== "real" && !switchFailed);
  let returnAvailable = $state(false);
  let existingDemo = $state(false);
  let demoStorageReady = $state(false);
  let resumeFailed = $state(false);

  async function forgetUnavailableDemo() {
    if (loading || demoLoading || !window.confirm(m.demo_forget_confirm())) return;
    demoLoading = true;
    try {
      forgetDemoAccess();
      await flushDeviceAuthStorage();
      const target = new URL(window.location.href);
      target.searchParams.delete("switchFailed");
      window.location.replace(`${target.pathname}${target.search}${target.hash}`);
    } catch {
      error = m.demo_resume_failed();
      demoLoading = false;
    }
  }
  onMount(() => {
    if (switchFailed) error = m.demo_switch_expired();
    resumeFailed = page.url.searchParams.get("switchFailed") === "demo";
    void initializeDeviceAuthStorage()
      .then(() => {
        existingDemo = hasDemoBinding();
        returnAvailable = hasParkedSession(accountTarget === "real" ? "demo" : "real");
        demoStorageReady = true;
      })
      .catch(() => {
        error = m.demo_resume_failed();
      });
  });
  async function returnToAccount() {
    if (loading || demoLoading) return;
    loading = true;
    try {
      const result = await requestAccountSwitch(accountTarget === "real" ? "demo" : "real");
      if (!result.ok) throw new Error("account_switch_failed");
    } catch {
      error = m.demo_open_error_generic();
      loading = false;
    }
  }

  async function signInWithEmail(e: SubmitEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      error = m.login_error_email_required();
      return;
    }
    if (!password) {
      error = m.login_error_password_required();
      return;
    }

    loading = true;
    error = null;
    const redirectTarget = redirectTargetFromUrl(page.url);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

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

    clearLoginRedirect();
    await goto(redirectTarget, { replaceState: true });
    loading = false;
  }

  async function signInWithGoogle() {
    loading = true;
    error = null;
    const redirectTarget = redirectTargetFromUrl(page.url);
    rememberLoginRedirect(redirectTarget);
    const { error: authError } = await signInWithGoogleOAuth(oauthCallbackUrl(redirectTarget));
    if (authError) {
      error = m.login_error_generic();
      loading = false;
    }
  }

  async function openDemo() {
    if (!demoStorageReady || demoLoading || (!existingDemo && demoSiteKey && !demoToken)) return;
    demoLoading = true;
    resumeFailed = false;
    error = null;
    const token = demoToken;
    demoToken = "";
    const result = await openDemoAccount({ turnstileToken: token || undefined }).catch(() => ({
      ok: false as const,
      error: "demo_session_failed",
    }));
    if (!result.ok) {
      // Siteverify consumes tokens even when a later provision step fails.
      demoToken = "";
      demoChallengeAttempt += 1;
      existingDemo = hasDemoBinding();
      resumeFailed = existingDemo && result.error === "demo_session_failed";
      error =
        result.error === "demo_session_failed"
          ? m.demo_resume_failed()
          : result.error === "demo_provision_disabled" ||
              result.error === "demo_provision_unavailable"
            ? m.demo_open_error_disabled()
            : m.demo_open_error_generic();
      demoLoading = false;
      return;
    }
    clearLoginRedirect();
    // Hard reinit is already in flight from openDemoAccount — do not soft-goto.
  }
</script>

<svelte:head>
  <title>{m.app_name()} | {m.login_sign_in()}</title>
</svelte:head>

<div
  class="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-8 sm:px-6 lg:flex lg:items-center lg:py-12"
>
  <div
    class="pointer-events-none absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl"
  ></div>
  <div
    class="pointer-events-none absolute right-0 bottom-0 h-80 w-80 rounded-full bg-lime-300/5 blur-3xl"
  ></div>

  <main
    class="relative mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16"
  >
    <section class="mx-auto w-full max-w-xl lg:mx-0">
      <BrandMark size="sm" class="mb-8" />
      <p class="text-eyebrow text-emerald-300">{m.login_intro_eyebrow()}</p>
      <h1
        class="mt-3 text-4xl leading-tight font-semibold tracking-tight text-slate-50 sm:text-5xl"
      >
        {m.login_intro_title()}
      </h1>
      <p class="mt-5 max-w-lg text-base leading-relaxed text-slate-300 sm:text-lg">
        {m.login_intro_body()}
      </p>
      {#if demoStorageReady}
        <p class="mt-6 text-xs leading-relaxed text-slate-500">
          {existingDemo ? m.login_demo_return_note() : m.login_demo_note()}
        </p>
      {/if}
    </section>

    <section
      class="relative mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-white/8 bg-slate-900/65 p-6 shadow-[0_0_70px_rgba(16,185,129,0.1)] backdrop-blur sm:p-8"
      aria-label={m.login_sign_in()}
    >
      {#if error}
        <div
          class="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
          role="alert"
        >
          {error}
        </div>
      {/if}

      {#if !nativeLogin && showReal}
        <form onsubmit={signInWithEmail} class="space-y-4">
          <div>
            <label for="email" class="mb-1.5 block text-sm font-medium text-slate-200">
              {m.login_email()}
            </label>
            <input
              id="email"
              type="email"
              bind:value={email}
              placeholder={m.login_email_placeholder()}
              autocomplete="email"
              disabled={loading}
              class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <label for="password" class="mb-1.5 block text-sm font-medium text-slate-200">
              {m.login_password()}
            </label>
            <input
              id="password"
              type="password"
              bind:value={password}
              autocomplete="current-password"
              disabled={loading}
              class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            class="bg-accent-gradient focus-visible:ring-accent w-full rounded-full px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus-visible:outline-none disabled:opacity-50"
          >
            {loading ? m.login_signing_in() : m.login_sign_in()}
          </button>
        </form>

        {#if showDemo}<div class="my-5 flex items-center gap-3">
            <div class="h-px flex-1 bg-white/10"></div>
            <span class="text-xs text-slate-400">{m.common_or()}</span>
            <div class="h-px flex-1 bg-white/10"></div>
          </div>{/if}
      {/if}

      {#if showDemo}
        {#if demoStorageReady && demoSiteKey && !existingDemo}
          {#key demoChallengeAttempt}
            <DemoTurnstile
              siteKey={demoSiteKey}
              onToken={(token) => {
                demoToken = token;
                if (token) error = null;
              }}
              onError={() => {
                error = m.demo_challenge_error();
              }}
            />
          {/key}
        {/if}

        <button
          type="button"
          onclick={openDemo}
          disabled={!demoStorageReady ||
            loading ||
            demoLoading ||
            (!existingDemo && !!demoSiteKey && !demoToken)}
          data-testid="open-demo-account"
          class="mb-3 flex w-full items-center justify-center rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/20 focus-visible:ring-2 focus-visible:ring-amber-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus-visible:outline-none disabled:opacity-50"
        >
          {demoLoading ? m.demo_open_busy() : existingDemo ? m.demo_resume() : m.demo_open_cta()}
        </button>
        <p class="mb-3 text-xs text-slate-400">{m.demo_browser_binding_note()}</p>
      {/if}
      {#if demoStorageReady && existingDemo && resumeFailed}
        <button
          type="button"
          onclick={forgetUnavailableDemo}
          disabled={loading || demoLoading}
          class="mb-3 text-sm text-slate-400 underline hover:text-slate-200 disabled:opacity-50"
        >
          {m.demo_forget_access()}
        </button>
      {/if}

      {#if showReal}
        <button
          type="button"
          onclick={signInWithGoogle}
          disabled={loading || demoLoading}
          class="focus-visible:ring-accent flex w-full items-center justify-center gap-2.5 rounded-full border border-white/10 bg-slate-900/60 px-4 py-2.5 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus-visible:outline-none disabled:opacity-50"
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
      {/if}
      {#if (accountTarget === "real" || accountTarget === "demo") && returnAvailable}
        <button
          type="button"
          onclick={returnToAccount}
          disabled={loading || demoLoading}
          class="mt-3 min-h-11 w-full rounded-full border border-white/10 px-4 text-sm text-slate-300 disabled:opacity-50"
        >
          {accountTarget === "real" ? m.demo_return_to_demo() : m.demo_return_to_real()}
        </button>
      {/if}

      <p class="mt-6 text-center text-xs leading-relaxed text-slate-400">
        {m.privacy_login_notice()}
        <a href="/privacy" class="text-slate-400 underline hover:text-slate-200"
          >{m.privacy_policy_link()}</a
        >
      </p>
      <p class="mt-3 text-center text-xs text-slate-500">
        <a href="/changelog?from=/login" class="underline hover:text-slate-200">
          {m.changelog_title()}
        </a>
        <span class="mx-1.5" aria-hidden="true">·</span>
        <span>{appVersion}</span>
      </p>
    </section>
  </main>
</div>
