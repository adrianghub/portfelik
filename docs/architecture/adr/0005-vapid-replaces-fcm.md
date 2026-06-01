# ADR 0005 - VAPID web-push instead of FCM

**Status:** Accepted (2026-04, Phase 5)

## Context

The legacy app used Firebase Cloud Messaging for push: client subscribed via Firebase Messaging SDK, tokens stored in `users.fcmTokens[]`, server-side Cloud Functions sent via the Firebase Admin SDK. The SDK weighs ~200KB compressed and pulls in the rest of Firebase as a transitive dependency.

VAPID web-push is the W3C standard underneath FCM. The browser exposes `navigator.serviceWorker` + `PushManager`; the server signs payloads with a VAPID keypair and POSTs to the subscription's endpoint URL. FCM, Mozilla autopush, and Apple Push Notification Service all implement the same wire protocol on the receiving side.

For a personal app moving to a runtime that already has `web-push` available as an npm package on the Edge Function side, the cost-benefit shifted: the SDK was paying for nothing we used.

## Decision

**Use raw VAPID web-push.** Drop Firebase Messaging entirely.

- Generate a VAPID keypair (`npx web-push generate-vapid-keys`). Public key → `PUBLIC_VAPID_KEY` env (shipped in client bundle); private key → Supabase Edge Function secret `VAPID_PRIVATE_KEY`. `VAPID_SUBJECT` is `mailto:zinko.adrian00@gmail.com`.
- Client subscribes via `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID public })` and upserts `{ endpoint, p256dh, auth }` into `push_subscriptions`. `services/push.ts:autoSubscribePush` runs silently on every sign-in (only if permission already granted); `requestAndSubscribePush` runs from a user-gesture banner.
- Send side runs in `supabase/functions/send-push/index.ts` using `npm:web-push@3.6.7`. Triggered by `AFTER INSERT ON notifications`, fans out to every subscription for the user, prunes 404/410 in-line.
- **Do not migrate FCM tokens.** VAPID `endpoint/p256dh/auth` are a different format from FCM tokens; the migration is one-way. Users re-subscribe on first SvelteKit login.

## Consequences

**Good**

- ~200KB removed from the client bundle.
- One vendor fewer in the runtime path. Push works without any Firebase product enabled.
- The send side is ~40 lines of Deno. Easy to read, easy to log, easy to swap.
- Receiver compatibility is unchanged - the underlying push services are the same; only the wrapper SDK is gone.
- Dead-subscription pruning is automatic and visible (one DELETE per 404/410).

**Bad**

- Setup ceremony at Phase 5 cutover: re-key generation, secret stewardship, Vault wiring. One-time cost.
- Users had to opt back into push on first SvelteKit login. Acknowledged as part of the cutover plan.
- Apple Web Push has historically been quirkier than FCM; we have not seen issues but the surface is larger if it appears.

**Neutral**

- The browser permission UX is identical (it's the same permission).

## Alternatives considered

- **Stay on FCM.** Would have required keeping Firebase Messaging, a Firebase Admin SDK on the send side, and per-platform token mechanics. Defeats the broader Supabase migration goal.
- **OneSignal / Pusher Beams / similar.** Adds a third party for a problem we can solve with `web-push` + 40 lines of Deno.
- **No push, in-app bell only.** Insufficient - the weekly admin summary needs to land when the tab is closed.
