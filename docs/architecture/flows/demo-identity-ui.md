# Demo 2.0 UI + session switching (prep)

**Branch:** `codex/jakstoimy-1-4-demo-ui`  
**Depends on:** B1 guards + B2 provisioner (local Edge with kill switch).  
**Not in scope:** destructive reset, public Edge enablement, rewrite of the legacy demo month subsystem.

## Product slice

1. Login CTA **Otwórz konto demo** → `open-demo-account` → `verifyOtp` → hard reinit → `/dashboard`.
2. At most one **parked** inactive session (Demo or Real) so switching can restore the other identity.
3. Persistent DEMO badge in navigation when `app_metadata.account_kind === "demo"`.
4. Sample CSV at `/sample-imports/jakstoimy-demo.csv` (past-only history) for the first optional hint; import uses the production importer only.
5. Three optional hints (`import_csv`, `open_analyses`, `confirm_balance`) — dismissible, never blocking.

## Session isolation (P0)

Switching must never show another identity’s financial rows, even briefly.

| Layer | Rule |
| --- | --- |
| Active credentials | Live only in the Supabase GoTrue storage key |
| Parked credentials | At most the inactive kind under `jakstoimy.auth.{demo\|real}.session.v1` |
| Switch path | Park inactive → write `pending_switch` → clear GoTrue keys → `location.assign` → `bootstrapPendingAccountSwitch` before queries |
| Cache | New JS heap + new `QueryClient` on hard reinit; `loadAuthenticatedUser` also `queryClient.clear()` on user id change |
| Logout | `clearAllIdentitySessionState()` so intentional sign-out cannot revive a parked session |
| Failed `setSession` | Clears parked target + pending; after GoTrue wipe there is no prior session to fall back to |

We intentionally **do not** keep two live Supabase clients in 1.4.0.

## Local enablement

```bash
# After B1+B2 migrations applied locally:
# Deploy or serve Edge with DEMO_PROVISION_ENABLED=true (local only).
pnpm --dir apps/web-svelte dev
```

Without the Edge kill switch open, the CTA shows a user-facing unavailable message —
screens remain implementable against a controlled local stack.

## Tests

- Unit: parked sessions, pending one-shot switch, logout wipe, failed bootstrap
- Unit: CSV past-only bounds + grosze totals
- E2E mocked: open demo → CSV → Historia/Analizy/prognoza → switch real → back to demo
