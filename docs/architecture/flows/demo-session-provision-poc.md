# Demo session provision PoC (2026-10-18)

**Verdict for session issuance: GO.**  
**Verdict for shipping a public Edge provisioner: NO-GO until B1/B2 guards land.**

Local invite-only Auth (`GOTRUE_DISABLE_SIGNUP=true`, email provider on, anonymous
off) can create a demo UID via Admin `createUser`, emit a one-time
`hashed_token` through Admin `generateLink({ type: "magiclink" })`, and let the
anon client exchange it with `verifyOtp({ token_hash, type: "email" })` (also
works with `type: "magiclink"`). No hand-rolled JWT. No Anonymous Auth. No public
signup. Sessions are issued by GoTrue.

This is **not** approval to deploy the product Edge Function. The PoC also
proved required security preconditions that are still missing in the app schema.

## Environment

- Ordinary local stack after `config.toml` fix (global signup off, email provider on).
- Runner: [`apps/web-svelte/experiments/demo-session-provision/`](../../../apps/web-svelte/experiments/demo-session-provision/).
- Auth/SDK: GoTrue from local CLI stack + `@supabase/supabase-js@2.112.4`.
- Findings file (no token material): `/tmp/jakstoimy-demo-session-poc-findings.json`.

## Matrix

| Check | Result | Implication |
| --- | --- | --- |
| Public `signUp` denied | Pass | Invite-only preserved |
| `verifyOtp` type `email` issues session | Pass | Supported contract |
| `verifyOtp` type `magiclink` also works | Pass | Document both; prefer `email` per docs for token hash |
| Wrong type (`invite`) denied | Pass | Type must match |
| Replay of same `hashed_token` denied | Pass | One-time credential |
| Parallel provisions → distinct UIDs | Pass | No shared demo identity |
| `app_metadata.account_kind=demo` survives client `updateUser` | Pass | Durable claim candidate |
| Client cannot set `app_metadata.account_kind` | Pass | Elevation not via client metadata |
| Duplicate `createUser` over existing real email denied | Pass | Collision safe |
| `generateLink` on existing **real** email succeeds | **Gap** | Edge must refuse any email not freshly created as demo in the same request |
| `create_group` for demo UID succeeds | **Gap** | Server guards required before ship (not only UI) |
| `resetPasswordForEmail` on `@demo.jakstoimy.local` | Denied locally | Good for synthetic domain; still audit recovery after real email attach |

## Sensitive credential rules (mandatory for any product Edge)

Treat `hashed_token` as a full access credential:

- Never log, never put in URLs, analytics, error messages, or PR bodies.
- Return only over HTTPS body to the caller that requested provision.
- Bind to the UID created in the same transaction/request; never accept a
  caller-supplied existing user id/email for `generateLink`.
- Short TTL from GoTrue; never reuse; rate-limit provision + verify.

## Preconditions before product Edge (B1/B2)

1. Trusted registry / `is_demo_account()` independent of mutable `is_anonymous`.
2. Deny demo on: `create_group`, invitation delivery/claim, membership insert,
   admin RPCs, privileged Edge paths — not only `create_group`.
3. Edge allowlist: create new synthetic demo identity only; never
   `generateLink(existingRealEmail)`.
4. Rate limits, automation resistance, global demo capacity, retention policy.
5. After conversion (email/password/Google): claim stays `demo`.
6. Separate Demo/Real session storage and cache clear on switch.

## Decision

| Scope | Decision |
| --- | --- |
| Session mechanism (`generateLink` → `verifyOtp`) | **GO** — proceed to design B1/B2 |
| Deploy public `open-demo-account` now | **NO-GO** |
| Third Supabase project / Anonymous Auth / hand-rolled JWT | Still rejected |

Next: implement B1 guards + registry, then B2 Edge with abuse tests, keeping Auth
PR #399 separate. Destructive reset and production enablement need separate approval.
