# Portfelik

Personal finance PWA — SvelteKit + Supabase + Cloudflare Pages.

## Stack

- **Frontend:** SvelteKit 5 (adapter-static) + Tailwind v4 + shadcn-svelte + Paraglide (PL i18n)
- **Backend:** Supabase (Postgres + Auth + Edge Functions + pg_cron)
- **Hosting:** Cloudflare Pages (CI/CD via GitHub Actions on push to `main`)

## Development

```bash
cd apps/web-svelte
pnpm install
pnpm dev
```

## Structure

```
apps/web-svelte/   ← SvelteKit app
supabase/          ← Migrations + Edge Functions
.github/workflows/ ← CI/CD (typecheck + lint + deploy)
```

## Deploy

Push to `main` — GitHub Actions builds and deploys to Cloudflare Pages automatically.
