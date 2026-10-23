<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import BrandMark from "$lib/components/BrandMark.svelte";
  import { loginUrlForTarget, rememberLoginRedirect } from "$lib/auth-redirect";
  import { claimInvitation, fetchInvitationPreview } from "$lib/services/groups";
  import { oauthCallbackUrl, signInWithGoogleOAuth } from "$lib/services/oauth";
  import { supabase } from "$lib/supabase";
  import {
    beginAccountSwitchReinit,
    clearGoTrueClientStorage,
    isDemoAccountUser,
    parkInactiveSession,
  } from "$lib/demo/identity-session";
  import { flushDeviceAuthStorage } from "$lib/auth/device-storage";
  import type { GroupInvitationPreview } from "$lib/types";
  import * as m from "$lib/paraglide/messages";

  let preview = $state<GroupInvitationPreview | null>(null);
  let authenticated = $state(false);
  let demoActive = $state(false);
  let loading = $state(true);
  let submitting = $state(false);
  let email = $state("");
  let error = $state<string | null>(null);
  let magicLinkSent = $state(false);
  let emailMismatch = $state(false);
  let setupPassword = $state(true);

  const token = $derived(page.url.pathname.split("/").at(-1) ?? "");
  const target = $derived(`/invite/${token}`);

  onMount(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      authenticated = !!session;
      demoActive = isDemoAccountUser(session?.user);
    });
    void loadInvitation();
    return () => subscription.unsubscribe();
  });

  async function loadInvitation() {
    try {
      preview = (await fetchInvitationPreview(token)) as GroupInvitationPreview | null;
      const { data } = await supabase.auth.getSession();
      authenticated = !!data.session;
      demoActive = isDemoAccountUser(data.session?.user);
    } catch {
      error = m.invite_preview_error();
    } finally {
      loading = false;
    }
  }

  async function claim() {
    submitting = true;
    error = null;
    emailMismatch = false;
    try {
      const group = await claimInvitation(token);
      await goto(`/settings?tab=groups&group=${encodeURIComponent(group.groupId)}`, {
        replaceState: true,
      });
    } catch (claimError) {
      const claimMessage =
        claimError instanceof Error
          ? claimError.message
          : typeof claimError === "object" &&
              claimError !== null &&
              "message" in claimError &&
              typeof (claimError as { message: unknown }).message === "string"
            ? (claimError as { message: string }).message
            : String(claimError ?? "");
      const mismatch = claimMessage.includes("email_mismatch");
      emailMismatch = mismatch;
      error = mismatch ? m.invite_email_mismatch() : m.invite_claim_error();
      submitting = false;
    }
  }

  async function switchAccount() {
    submitting = true;
    error = null;
    emailMismatch = false;
    rememberLoginRedirect(target);
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      error = m.invite_claim_error();
      submitting = false;
      return;
    }
    if (data.session && isDemoAccountUser(data.session.user)) {
      // Leave demo recoverable while the invitation authenticates a real account.
      try {
        parkInactiveSession(data.session);
        beginAccountSwitchReinit();
        clearGoTrueClientStorage();
        await flushDeviceAuthStorage();
        window.location.replace(target);
      } catch {
        error = m.demo_switch_expired();
        submitting = false;
      }
      return;
    }
    await supabase.auth.signOut();
    authenticated = false;
    submitting = false;
  }

  async function signInWithGoogle() {
    submitting = true;
    error = null;
    rememberLoginRedirect(target);
    const { error: authError } = await signInWithGoogleOAuth(oauthCallbackUrl(target));
    if (authError) error = m.login_error_generic();
    // Native Google completes in-place; its auth event reveals the claim button.
    submitting = false;
  }

  async function sendMagicLink(event: SubmitEvent) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      error = m.login_error_email_required();
      return;
    }
    submitting = true;
    error = null;
    rememberLoginRedirect(target);
    const { data, error: authError } = await supabase.functions.invoke("send-group-invitation", {
      body: { action: "access", token, email: normalizedEmail, setupPassword },
    });
    if (authError || !data?.sent) {
      error = m.auth_invite_send_error();
    } else {
      magicLinkSent = true;
    }
    submitting = false;
  }
</script>

<svelte:head><title>{m.invite_page_title()}</title></svelte:head>

<main class="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
  <section class="w-full max-w-md">
    <BrandMark size="sm" class="mb-6" />
    {#if loading}
      <div class="h-56 animate-pulse rounded-lg bg-slate-900"></div>
    {:else if !preview}
      <div class="rounded-lg border border-white/10 bg-slate-900 p-6">
        <h1 class="text-xl font-semibold text-slate-100">{m.invite_unavailable_title()}</h1>
        {#if error}
          <p role="alert" class="mt-4 text-sm text-rose-300">{error}</p>
        {:else}
          <p class="mt-2 text-sm text-slate-400">{m.invite_unavailable_body()}</p>
        {/if}
      </div>
    {:else}
      <div class="rounded-lg border border-white/10 bg-slate-900 p-6">
        <p class="text-sm text-slate-400">{m.invite_from({ inviter: preview.inviterName })}</p>
        <h1 class="mt-1 text-2xl font-semibold text-slate-100">{preview.groupName}</h1>
        <p class="mt-3 text-sm text-slate-400">
          {m.invite_recipient({ email: preview.recipientMasked })}
        </p>

        {#if error}
          <p class="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300" role="alert">
            {error}
          </p>
        {/if}

        {#if demoActive}
          <button
            type="button"
            onclick={switchAccount}
            disabled={submitting}
            class="bg-accent-gradient mt-6 w-full rounded-full px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {m.demo_switch_to_real()}
          </button>
        {:else if authenticated}
          <button
            type="button"
            onclick={claim}
            disabled={submitting}
            class="bg-accent-gradient mt-6 w-full rounded-full px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {submitting ? m.common_saving() : m.invite_join()}
          </button>
          <button
            type="button"
            onclick={switchAccount}
            disabled={submitting}
            class="mt-3 w-full rounded-full border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50"
          >
            {emailMismatch ? m.invite_switch_account() : m.invite_use_other_account()}
          </button>
        {:else if magicLinkSent}
          <p
            role="status"
            class="mt-6 rounded-lg bg-emerald-500/10 px-3 py-3 text-sm text-emerald-300"
          >
            {m.invite_magic_link_sent()}
          </p>
        {:else}
          <button
            type="button"
            onclick={signInWithGoogle}
            disabled={submitting}
            class="mt-6 w-full rounded-full border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-100 hover:bg-white/5 disabled:opacity-50"
          >
            {m.login_sign_in_google()}
          </button>
          <p class="mt-2 text-xs text-slate-400">{m.auth_google_invite_hint()}</p>
          <div class="my-4 flex items-center gap-3 text-xs text-slate-500">
            <span class="h-px flex-1 bg-white/10"></span>{m.common_or()}<span
              class="h-px flex-1 bg-white/10"
            ></span>
          </div>
          <a
            href={loginUrlForTarget(target)}
            class="mt-3 block text-center text-sm text-slate-300 underline"
            >{m.auth_existing_password()}</a
          >
          <form onsubmit={sendMagicLink} class="space-y-3">
            <label for="invite-email" class="block text-sm font-medium text-slate-200"
              >{m.login_email()}</label
            >
            <input
              id="invite-email"
              type="email"
              required
              autocomplete="email"
              bind:value={email}
              placeholder={m.login_email_placeholder()}
              class="focus:border-accent/40 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none"
            />
            <label class="flex items-start gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                bind:checked={setupPassword}
                disabled={submitting}
                class="mt-1"
              />
              {m.auth_invite_setup_option()}
            </label>
            <p class="text-xs text-slate-400">{m.auth_invite_verify_first()}</p>
            <button
              type="submit"
              disabled={submitting}
              class="bg-accent-gradient w-full rounded-full px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {setupPassword ? m.auth_invite_verify_email() : m.invite_send_magic_link()}
            </button>
          </form>
        {/if}
      </div>
    {/if}
  </section>
</main>
