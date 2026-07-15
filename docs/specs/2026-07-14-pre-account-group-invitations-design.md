# Pre-account group invitations

**Date:** 2026-07-14  
**Status:** Implemented locally on `dev`; awaiting manual commits and deployment

## Decision

Extend the existing email-based `group_invitations` flow. Do not create a
parallel invitation model. Today the database already permits a pending invite
for an email with no Auth user, exempts that email from the invite-only signup
cap, and creates its in-app notification after signup. The missing pieces are
email delivery, a safe public deep link, expiry, and automatic post-auth claim.

An invitation grants no financial access until an authenticated user with the
same normalized email claims it. The emailed URL carries a high-entropy,
single-use token; the database stores only its hash.

## User flow

1. A group owner enters an email in the existing Groups dialog.
2. A new `send-group-invitation` Edge Function creates or rotates the pending
   invitation through a caller-authenticated RPC, then sends transactional
   email. The UI shows `sent`, `delivery failed - retry`, or `pending` rather
   than treating the database insert as successful delivery.
3. The email links to `/invite/<token>`. The public preview reveals only group
   name, inviter display name, expiry, and a masked recipient email. It never
   exposes members, transactions, plans, or balances.
4. Existing users sign in; new users use Google OAuth or an invite-only magic
   link. The existing `redirectTo` mechanism preserves the invite route across
   Auth callbacks.
5. After authentication, `claim_group_invitation(token)` verifies the token,
   pending state, expiry, and exact JWT email match in one database transaction.
   It inserts membership idempotently, marks the invite accepted, and consumes
   the token.
6. The client invalidates groups plus every financial query-key family. This is
   required because joining and leaving change transaction, plan, debt,
   settlement, cash-flow, and dashboard visibility.

The owner opens the action from a specific group, so group scope is locked and
visible rather than selected again. Role defaults to `member` and expiry to
seven days; advanced role/expiry controls stay hidden until the product supports
real alternatives. Recipient email is never prefilled from a prior invitation.
Resend reuses the existing invitation context but rotates its token. On the
recipient side, the primary action is the single valid next step: sign in or
create the invited account, then accept. No financial setup questions appear
during claim.

## Schema and RPCs

Add to `group_invitations`:

- `token_hash bytea unique`
- `expires_at timestamptz not null` (seven-day product default)
- `sent_at timestamptz`
- `delivery_status text` constrained to `pending|sent|failed`
- `delivery_attempts integer not null default 0`

Do not store the raw token or provider response bodies. A resend rotates the
token and expiry, invalidating every older link. Cancellation consumes the
token. Expired pending rows do not qualify for the signup-cap exemption.

Add narrow RPCs:

- `create_group_invitation_for_delivery(group_id, email)` - authenticated group
  owner only; validates membership/duplicates/rate limit and returns the raw
  token once to the Edge Function.
- `get_group_invitation_preview(token)` - callable before auth; returns the
  minimal preview only for a valid, pending, unexpired token.
- `claim_group_invitation(token)` - authenticated; locks the invitation row,
  checks JWT email, inserts membership, accepts, and consumes atomically.
- `record_group_invitation_delivery(id, outcome)` - service role only; updates
  delivery metadata without exposing provider data.

Keep the current email-matched received-invitations view as a fallback for
signed-in users. Update `accept_invitation(id)` to enforce expiry too, so the
settings path cannot bypass the token flow's lifecycle rule.

## Delivery

Keep delivery server-side. The browser calls the Supabase Edge Function with
the user's JWT; the function calls the RPC, renders plain-text and HTML email,
and invokes Resend's REST API directly. Resend's free transactional tier is a
better launch fit than Cloudflare Email Sending, which currently requires a
Workers Paid plan:
<https://resend.com/docs/api-reference/emails/send-email>.

Required secrets belong in Supabase Edge Function secrets, never the client:
a narrowly scoped Resend API key, sender address, and the canonical app origin.
Verify the sender domain and its DNS records before enabling real delivery.
Always send both HTML and text bodies.

Concrete keys: `RESEND_API_KEY`, `GROUP_INVITATION_FROM_EMAIL`,
`PUBLIC_APP_ORIGIN`, optional `APP_ORIGINS`, and
`GROUP_INVITATION_RECIPIENT_ALLOWLIST` (required on staging).

Implementation note: token hashes live in a separate table with no
anon/authenticated Data API grants. Token minting and invite-only Auth link
generation are service-role-only; the Edge Function validates the caller or
the exact pending token/email pair before either operation.

The provider remains isolated behind `sendEmail`; substituting another REST
provider later does not change the database, token, or Auth design.

## Abuse and privacy controls

- Normalize email once in SQL and compare it to the authenticated JWT email.
- Use at least 256 bits of randomness and SHA-256 token hashes.
- Return generic invalid/expired responses; do not reveal whether an email has
  an account.
- Rate-limit per inviter, group, and recipient; cap resend attempts and require
  a cooldown.
- Log invitation ID, actor, outcome, and timestamps, never tokens or financial
  data.
- Do not auto-join at signup. Claim remains an explicit user action.
- Cancellation, expiry, owner loss, group deletion, and accepted state all make
  the token unusable.

## Verification

RLS/RPC tests:

- owner can invite; member/non-member cannot
- raw token is never selectable from the table
- public preview is minimal and rejects invalid, expired, cancelled, used tokens
- wrong authenticated email cannot claim
- correct email claims exactly once and gains only that group's RLS visibility
- expired invite does not bypass the signup cap
- resend invalidates the prior token; cancellation invalidates the current token

Application/Edge Function tests:

- no-account email delivery -> OAuth/magic-link callback -> preview -> claim
- existing-account login -> claim
- delivery failure remains retryable and never reports `sent`
- joining and leaving invalidate all group-dependent financial queries
- mocked E2E fails on unknown backend calls instead of returning empty success

## Rollout

1. Ship schema/RPC lifecycle and RLS tests without enabling email.
2. Add the Edge Function, provider secrets, sender-domain authentication, and a
   non-production recipient allowlist.
3. Ship the public invite/auth/claim route and strict mocked E2E.
4. Dogfood cancellation, resend, wrong-account, expiry, and duplicate-click
   paths on staging.
5. Enable production delivery for the first invited cohort, monitor delivery
   failures and claim conversion, then remove the allowlist.
