# ADR 0006 - Cloudflare Pages with `adapter-static`

**Status:** Accepted (2026-04, Phase 3)

## Context

The legacy app was hosted on Firebase Hosting as a CRA-style SPA. Cutover required a hosting target that:

- handled a static SPA (no SSR needed - auth gating is client-side, all data calls go straight to Supabase),
- had a sane PWA story (manifest + service worker served correctly with the right cache headers),
- supported per-branch preview deploys for staging,
- ran on infrastructure we already paid for (Cloudflare DNS + Tunnel were already in place for the Pi homelab).

## Decision

**Cloudflare Pages with SvelteKit's `adapter-static`.**

- `svelte.config.js` configures `adapter-static({ fallback: 'index.html' })`. The whole app builds to a `build/` directory of static files.
- Production: `main` branch → `portfelik.adrianzinko.com`.
- Staging: `dev` branch → `dev.portfelik.pages.dev`.
- No `+server.ts` files. No SSR. Every API call goes from browser to Supabase directly.
- GitHub Actions builds and uses `wrangler pages deploy` to push.

## Consequences

**Good**

- Smallest possible runtime surface. The hosting tier just serves files.
- Edge cache via Cloudflare's network. Free tier, generous limits.
- Per-branch preview deploys come for free - every PR lands on a preview URL.
- PWA shape unchanged from the legacy app: same `manifest.json`, same service worker, served from `static/`.
- Cloudflare DNS already manages the apex; flipping `portfelik.adrianzinko.com` was a CNAME change.

**Bad**

- No server-side runtime means we cannot do anything that needs a request context (e.g. pre-rendered SSR for SEO, request-bound logging). For a private personal-finance app, neither matters.
- We rely on the SPA's client-side auth guard. There is no server-side route protection, so a route that needs auth must `goto('/login')` from `onMount`. Acceptable but worth noting.
- `@supabase/ssr` cannot be used (it needs a Node/edge runtime to hold cookies). The base `@supabase/supabase-js` client is the only correct choice; `localStorage` holds the session.

**Neutral**

- Two simultaneous environments (prod and staging) live in the same Cloudflare Pages project. See ADR 0011 (which supersedes ADR 0010) for the Supabase side of the split - the Pages project stays shared, but the staging branch deploys against a dedicated `portfelik-staging` Supabase project.

## Alternatives considered

- **Cloudflare Pages with `adapter-cloudflare`.** Would let us write `+server.ts` routes that run on Workers. Tempting but premature: nothing in the app needs server-side routing today.
- **Vercel.** Pleasant DX, but pulls us into a fourth vendor (Cloudflare DNS, Supabase, GitHub, Vercel). Cloudflare already owns DNS; sticking with one vendor is simpler.
- **Self-host on the Pi.** Possible (nginx + the existing Cloudflare Tunnel) but for a static frontend, edge CDN > home ISP. Edge cache wins.
- **Stay on Firebase Hosting.** Would defeat the whole "drop Firebase" decision.
