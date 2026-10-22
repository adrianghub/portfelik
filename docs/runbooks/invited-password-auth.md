# Invite-only password authentication

## Account creation and membership are separate

The owner creates a group invitation through `send-group-invitation`. The
recipient can log into an existing account using Google or email/password.
For a new account, the invitation page requests an email verification link with
`setupPassword: true` by default. The Edge Function checks the existing
server-side quota and verifies the live token/email pair before calling Auth
Admin. It never accepts a password or returns an Auth action link to the browser.

Auth Admin first attempts an invite link. If the address is already registered,
the existing magic-link path authenticates that account. After verification,
`/auth/setup` reads the current identity from the Auth server, shows its email,
and saves the display name in the existing `profiles.name` field. It sets the
password through `auth.updateUser`. It does not create a second account, unlink
Google, change roles or add a group membership.

After saving, the user returns to `/invite/<token>` and explicitly chooses
"Dołącz do grupy". The existing `claim_group_invitation` RPC revalidates the
live invitation and recipient email, locks the invitation and adds membership.
An invitation that expired or was revoked during account setup cannot be claimed.
Email verification alone is not membership authorization.

An invited first-time Google user must first provision/verify the invited email
through this link flow; with public signup disabled, a direct OAuth login cannot
be relied on to create a new Auth user. Once the verified account exists, normal
Supabase linking can associate a matching verified Google identity. Do not enable
public signup or manual linking as a workaround.

## Callback and password recovery

`auth/callback.ts` consumes PKCE codes or implicit access/refresh tokens and then
checks the identity with `getUser`. Explicit callback failures never fall back to
a previously cached session. The Supabase client disables automatic URL detection
so a single-use code is not consumed twice. The browser callback removes
credentials from history after router initialization.

The native handler consumes both cold-start (`App.getLaunchUrl`) and warm-start
(`appUrlOpen`) links through the same callback function. Recovery goes to
`/auth/setup?mode=recovery`. The login reset action uses `resetPasswordForEmail`
and preserves the invitation return destination through the nested callback URL.
Passwords never enter URLs, invitation metadata, analytics or application storage.
Native Google completes in place; the invitation page subscribes to Auth changes
and releases the pending button state so membership can be confirmed separately.

## Local verification

Local `supabase/config.toml` disables public and anonymous signup. Restart the
local stack after changing Auth configuration; a running GoTrue container keeps
its old settings. Tests use Admin provisioning and do not require public signup.
Never apply local configuration to a remote project implicitly.

## Demo and real-account boundary

An invitation opened while demo is active first offers switching to the real
account context. Park the demo and flush its credential storage before the hard
reload; never revoke demo Auth as a side effect of accepting a real invitation.
Demo cannot claim membership or use real profile/password setup. Setup rechecks
the exact Auth UID at submission, not only its email. Email/password entry and
recovery remain available on both web and native Android.

## Email delivery

Group invitations and their verification links use the configured Resend sender.
Password recovery uses Supabase Auth email delivery, a separate configuration.
Configure Custom SMTP in the intended project before accepting external-recipient
recovery as a release gate. Supabase's default mail service is restricted and
must not be treated as general production email delivery. A success response from
the client is not proof of delivery: record receipt, callback, password change
and subsequent sign-in. Never include action links, passwords or tokens in reports.

From `apps/web-svelte`:

```sh
pnpm check
pnpm lint
pnpm format:check
pnpm test:unit
pnpm test:components
pnpm test:rls
pnpm test:e2e
```

The `invited-password-auth` integration suite uses the real local Auth and
Postgres APIs. It provisions a synthetic Google-only identity in the local Auth
schema to verify existing-user identity retention. Its `psql` fixture rejects
non-local targets. It checks signup denial, new/existing identities, names and
passwords, interruption/relogin, link replay, expiry/revocation, explicit claims,
parallel access quotas and password recovery. This does not replace a real Google
OAuth exchange or Android device validation.

## Staging and Android acceptance

Use independent test addresses and profiles; do not commit credentials. Before
remote rollout, verify the intended project's signup policy and allowed web/custom
scheme callback URLs. Provision through invitations rather than public `signUp`.

| Scenario | Required evidence |
| --- | --- |
| New invited account | Verify email, set name/password, log out/in, then explicitly claim once |
| Existing Google account | Record user ID, profile and Google identity; add password; sign in through both methods; IDs and finance access stay unchanged |
| Existing password account | Login returns to the correct invitation, no duplicate profile |
| Wrong recipient | Server rejects membership; switch-account action remains usable |
| Revoked/expired invitation | Rejection before access link and at claim after account setup |
| Interrupted setup | Reopen a valid/new email link; no automatic group membership |
| Recovery on Android | Request link, open with app running and app stopped, save new password, return to invitation, test Android back |
| Replayed Auth link | Explicit error even if another account is already signed in |
| Replayed group link | No duplicate member or restored token |
| Multiple accounts | Signing out clears identity-scoped caches; private data stays private |

Keep the Auth changes separate from any eventual demo schema/reset rollout.
No staging migration, Auth setting change, production release or physical-device
result is implied by passing local/mock suites.
