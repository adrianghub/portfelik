---
name: deploy
description: Deploy Portfelik to staging or production via the official branch flow. Use when user says deploy, ship to production, push to prod, promote, or asks how to deploy.
allowed-tools:
  - Bash
  - Read
---

# Deploy Portfelik

Prefer GitHub Actions + repository scripts. Do **not** invent a parallel deploy path.

## Staging

Push/merge to `dev` (normally via `./scripts/open-pr.sh` on a feature branch).
**Deploy staging** migrates the staging Supabase project and deploys
https://dev.portfelik.pages.dev. After smoke, CI comments a soft soak reminder.

## Production

```bash
./scripts/promote.sh           # open/reuse dev → main PR
./scripts/promote.sh --merge   # wait for checks / auto-merge as merge commit
```

Details: `docs/runbooks/promote-and-ship.md`. After merge, `sync-dev.yml`
fast-forwards `dev`. Fallback: `./scripts/sync-dev.sh --push`.

Agents shipping a feature: `/ship`. Production: `/ship --promote` or `promote.sh`.

## Emergency manual Cloudflare Pages (production)

Only when GHA is unavailable. From `apps/web-svelte/`:

```bash
PUBLIC_SUPABASE_URL=https://emqzcygfwcvbmhxhfkcc.supabase.co \
PUBLIC_SUPABASE_ANON_KEY=<sb_publishable_... from dashboard> \
PUBLIC_VAPID_KEY=BHKoiccZwq3Y5Qw5dmFxVLJIA7w9zcSZkchPKWk-vxBeR421yieZW7gGxuluBBa6sRmpIsFXRSuFyRarLcdvqT4 \
pnpm build && npx wrangler pages deploy build --project-name portfelik --commit-dirty=true
```

**Notes:**

- `PUBLIC_*` vars are baked at build time
- Production and staging use **separate** Supabase projects — never reuse credentials
- Live app: https://app.jakstoimy.pl
