# Secret rotation runbook

Last updated: 2026-05-14

Covers rotation of the four secrets that gate push notifications and internal Edge Function calls in Portfelik.

| Secret | Where it lives | Used by | Rotation impact |
|---|---|---|---|
| `internal_trigger_secret` | Supabase Vault (`vault.create_secret`) + Edge Function secrets | DB triggers that POST to Edge Functions; Edge Functions verify header `x-internal-secret` | Internal triggers fail until both sides are updated. No user-visible impact if done in the same window. |
| `VAPID_PRIVATE_KEY` | Edge Function secrets (`send-push`) | Signs web-push messages | Existing browser subscriptions stay valid only if the *public* key did not change. Pair with public-key rotation only when subscriptions need to be invalidated. |
| `VAPID_PUBLIC_KEY` | Edge Function secrets + `apps/web-svelte/.env.production` (build-time `PUBLIC_VAPID_KEY`) | Browser `pushManager.subscribe({ applicationServerKey })`; passed to `urlBase64ToUint8Array` in `services/push.ts` | All existing `push_subscriptions` rows become invalid. Browsers re-subscribe on next visit; users who never return are silently dropped. |
| `VAPID_SUBJECT` | Edge Function secrets | `web-push` library header (`mailto:` or HTTPS URL identifying the sender) | None on existing subscriptions; only future sends use the new value. Safe to rotate any time. |

## When to rotate

- **Routine:** every 12 months (calendar reminder).
- **On suspected compromise:** immediately. Treat any leak of `service_role` JWT, the `internal_trigger_secret`, or `VAPID_PRIVATE_KEY` as a full rotation event.
- **On `web-push` library upgrade with new constraints:** check release notes; sometimes the subject format changes (must be `mailto:` or absolute HTTPS).

## Pre-flight

1. Check current Edge Function secrets:
   ```bash
   supabase secrets list --project-ref emqzcygfwcvbmhxhfkcc
   ```
2. Confirm production traffic is healthy (`gh pr checks` green on `main`, dashboard reachable, recent push delivery via `/admin/notifications`).
3. Announce window in #portfelik or to relevant stakeholders if push is critical.
4. Snapshot the current `push_subscriptions` count so post-rotation drop-off can be measured.
   ```sql
   select count(*) from push_subscriptions;
   ```

## Rotate `internal_trigger_secret`

Used by DB triggers (`trigger_send_notification_email`, weekly summary cron) to call Edge Functions over the public URL. Both sides must agree.

1. Generate a new 32-byte hex value:
   ```bash
   NEW_SECRET=$(openssl rand -hex 32)
   echo "$NEW_SECRET"   # capture for the next step
   ```
2. Update Edge Function secret:
   ```bash
   supabase secrets set INTERNAL_TRIGGER_SECRET="$NEW_SECRET" \
     --project-ref emqzcygfwcvbmhxhfkcc
   ```
3. Update Supabase Vault (read by DB triggers via `vault.decrypted_secrets`):
   ```sql
   -- via Supabase Dashboard SQL Editor or MCP execute_sql
   update vault.secrets
      set secret = vault.encrypt_secret('<NEW_SECRET>', '<existing-key-id>')
    where name = 'internal_trigger_secret';
   ```
   If the row does not exist (initial setup case), use `select vault.create_secret('<NEW_SECRET>', 'internal_trigger_secret');` instead.
4. **Verify both sides** before discarding the old value:
   - Trigger a manual notification (`/admin/notifications` → "Wyślij testowe powiadomienie") and confirm the Edge Function log shows `x-internal-secret` matched.
   - Tail the function: `supabase functions logs send-notification-email --project-ref emqzcygfwcvbmhxhfkcc | grep -E 'auth|secret|401|403'`.
5. If both green, the old value is no longer needed. If the verification fails, restore the previous value via the same two-step write.

## Rotate VAPID keys (public + private together)

Web-push requires the public key inside `pushManager.subscribe()` to match the private key on the server. Rotating one without the other breaks delivery silently. Always rotate as a pair.

1. Generate a new keypair:
   ```bash
   npx web-push generate-vapid-keys
   # outputs:
   # Public Key:  B...
   # Private Key: ...
   ```
2. Update Edge Function secrets:
   ```bash
   supabase secrets set \
     VAPID_PUBLIC_KEY="<NEW_PUBLIC>" \
     VAPID_PRIVATE_KEY="<NEW_PRIVATE>" \
     VAPID_SUBJECT="mailto:zinko.adrian00@gmail.com" \
     --project-ref emqzcygfwcvbmhxhfkcc
   ```
3. Update build-time public key in **two** places:
   - `apps/web-svelte/.env.production` → `PUBLIC_VAPID_KEY=<NEW_PUBLIC>` (commit if tracked, else update CI secret).
   - GitHub Actions repo secret `PUBLIC_VAPID_KEY` (used by the deploy workflow).
4. **Invalidate old subscriptions** - they will fail with `410 Gone` on next send, but eager cleanup avoids one round of dead-letter:
   ```sql
   delete from push_subscriptions;
   ```
   (Users re-subscribe on next visit via `autoSubscribePush` in `+layout.svelte`.)
5. Build + deploy:
   ```bash
   PUBLIC_SUPABASE_URL=https://emqzcygfwcvbmhxhfkcc.supabase.co \
   PUBLIC_SUPABASE_ANON_KEY=<sb_publishable_... from dashboard> \
   PUBLIC_VAPID_KEY=<NEW_PUBLIC> \
     pnpm -C apps/web-svelte build && \
   npx wrangler pages deploy apps/web-svelte/build \
     --project-name portfelik --commit-dirty=true
   ```
6. **Verify** by opening the deployed site in a fresh browser profile:
   - Sign in via Google.
   - Accept the push permission prompt.
   - Confirm a new row appears in `push_subscriptions` for your user.
   - Trigger a test push from `/admin/notifications` and confirm delivery.

### Rotate `VAPID_SUBJECT` only

No subscription invalidation. Update secret + redeploy. No client change needed.

```bash
supabase secrets set VAPID_SUBJECT="mailto:new@example.com" \
  --project-ref emqzcygfwcvbmhxhfkcc
```

## Post-rotation

- Update this runbook's "Last updated" date.
- Note the rotation in `CLAUDE.md` if the key fingerprint is referenced anywhere (e.g. `PUBLIC_VAPID_KEY` constant in deploy command - Phase 11.3 confirmed it currently is).
- Monitor `push_subscriptions` count for 24h; expect a one-time dip after a VAPID rotation as inactive users are dropped.
- If push delivery error rate exceeds baseline, check Edge Function logs for `WebPushError`.

## Recovery

If a rotation broke push end-to-end:

1. Revert the relevant secret(s) to the previous value via the same `supabase secrets set` / `vault.encrypt_secret` calls.
2. If VAPID was rotated and subscriptions wiped, users must re-subscribe - there is no path to restore the deleted rows. Plan rotations during low-engagement windows.
3. If `INTERNAL_TRIGGER_SECRET` mismatch caused weekly-summary failures, manually fire `process_recurring_transactions()` and the summary RPC after restoring.

## References

- `supabase/migrations/20260425000001_phase5_2_edge_function_hooks.sql` - DB triggers using `internal_trigger_secret`.
- `supabase/functions/send-notification-email/` - server verification of `x-internal-secret`.
- `apps/web-svelte/src/lib/services/push.ts` - browser `pushManager.subscribe` call site.
- `apps/web-svelte/src/routes/+layout.svelte` - `autoSubscribePush` on auth state changes.
- Supabase Vault docs: https://supabase.com/docs/guides/database/vault
- web-push library: https://github.com/web-push-libs/web-push
