---
name: deploy
description: Deploy Portfelik SvelteKit app to Cloudflare Pages production. Use when user says "deploy", "ship to production", "push to prod", or asks how to deploy.
allowed-tools:
  - Bash
  - Read
---

# Deploy to Cloudflare Pages

**Pre-flight:**
1. Get publishable anon key from Supabase Dashboard → Settings → API (starts with `sb_publishable_`)
2. Confirm you're on `main` branch or have a clean `--commit-dirty=true` reason

**Build + deploy (from `apps/web-svelte/`):**

```bash
PUBLIC_SUPABASE_URL=https://emqzcygfwcvbmhxhfkcc.supabase.co \
PUBLIC_SUPABASE_ANON_KEY=<sb_publishable_... from dashboard> \
PUBLIC_VAPID_KEY=BHKoiccZwq3Y5Qw5dmFxVLJIA7w9zcSZkchPKWk-vxBeR421yieZW7gGxuluBBa6sRmpIsFXRSuFyRarLcdvqT4 \
pnpm build && npx wrangler pages deploy build --project-name portfelik --commit-dirty=true
```

**Automated deploy (recommended):** Push to `main` → GitHub Actions triggers Cloudflare Pages deployment automatically. All secrets already set as GitHub secrets.

**Check deployment:** https://portfelik.adrianzinko.com

**Notes:**
- `PUBLIC_*` vars are baked at build time — must pass them inline or via `.env.production` (gitignored)
- Supabase anon key rotates occasionally — always get fresh from dashboard before manual deploy
- VAPID public key is stable (keypair set 2026-04-26)
