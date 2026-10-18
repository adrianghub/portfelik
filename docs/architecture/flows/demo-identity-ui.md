# Demo 2.0 UI + session switching (prep)

**Branch:** `codex/jakstoimy-1-4-demo-ui`  
**Depends on:** B1 guards + B2 provisioner (local Edge with kill switch).  
**Not in scope:** destructive reset, public Edge enablement.

## Product slice

1. Login CTA **Otwórz konto demo** → `open-demo-account` → `verifyOtp` → `/dashboard`.
2. Dual session storage (`demo` / `real`) so switching restores the other identity.
3. Persistent DEMO badge in navigation when `app_metadata.account_kind === "demo"`.
4. Sample CSV at `/sample-imports/jakstoimy-demo.csv` (same fixture as Auth PoC) for the
   first optional hint; import uses the production importer only.
5. Three optional hints (`import_csv`, `open_analyses`, `confirm_balance`) — dismissible,
   never blocking.

## Local enablement

```bash
# After B1+B2 migrations applied locally:
# Deploy or serve Edge with DEMO_PROVISION_ENABLED=true (local only).
pnpm --dir apps/web-svelte dev
```

Without the Edge kill switch open, the CTA shows a disabled/unavailable error —
screens remain implementable against a controlled local stack.

## Tests

- Unit: partitioned sessions + hint picker
- E2E (follow-up): open demo → download CSV → import → Analizy (requires local Edge)
