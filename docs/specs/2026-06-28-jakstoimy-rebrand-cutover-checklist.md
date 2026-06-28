# Spec 5 — JakStoimy rebrand cutover (operator checklist)

Date: 2026-06-28  
Status: **Operator-owned** — app-side prep largely landed; infra/legal cutover remains  
Owner: Adrian (not agent-implemented)

## Already in the app (reviewed 2026-06-28)

| Area | Status | Notes |
| --- | --- | --- |
| `m.app_name()` | ✅ | `pl.json` → `"Jak$toimy"` |
| `BrandMark` + nav | ✅ | `/jakstoimy-mark.svg`, wordmark with `$` accent |
| `app.html` meta | ✅ | description, apple title → JakStoimy |
| `manifest.webmanifest` | ✅ | name/short_name JakStoimy |
| PWA icons (`static/`) | ⚠️ | Files updated in tree — verify against `JakStoimy-Design-System/assets/logo/` before prod |
| Onboarding/glossary/demo | ✅ | Uses `m.app_name()` — no Portfelik literals |
| Privacy page prose | ✅ | JakStoimy throughout |
| Spec #1 constraint | ✅ | Survives central `app_name` swap |

## Still Portfelik-branded (intentional or pending)

| Area | Risk | Action |
| --- | --- | --- |
| **Production domain** | High | `portfelik.adrianzinko.com` → `jakstoimy.*` DNS + Cloudflare Pages custom domain |
| **Staging URL** | Low | `dev.portfelik.pages.dev` — rename optional; update Plausible domain if tracked |
| **Cloudflare project** | Med | `portfelik` project name — cosmetic unless splitting projects |
| **GitHub repo** | Low | `adrianghub/portfelik` rename optional |
| **Google OAuth** | High | Consent screen product name + redirect URIs for new domain |
| **Supabase Auth emails** | Med | Template sender name / links after domain move |
| **Push notification title** | Med | Edge `send-push` + SW — grep `portfelik` |
| **Internal channel IDs** | Low | `portfelik-notifications`, `portfelik_push_opt_out` — breaking change if renamed mid-flight |
| **Seed persona labels** | Low | `Portfelik Admin` etc. in `seed-personas.mjs` — internal only |
| **Test emails** | Low | `@portfelik.test` — keep for automation |
| **Import export kind** | Low | `portfelik_csv` / `portfelik_export` — data format id, not user-facing |
| **Auth redirect base** | Low | `auth-redirect.ts` `portfelik.local` dev hostname |
| **Docs / CLAUDE.md** | Med | Still say Portfelik in infra sections — sync after domain cut |
| **JakStoimy DS folder** | — | Reference kit under `apps/web-svelte/JakStoimy-Design-System/` — not shipped to users; keep or move to `docs/` |

## Recommended cutover order

1. **Assets lock** — copy canonical icons from DS `assets/logo/` → `static/`; verify maskable safe zone.
2. **Staging dress rehearsal** — deploy to staging with `PUBLIC_PLAUSIBLE_DOMAIN=dev.portfelik.pages.dev`; smoke OAuth + PWA install.
3. **OAuth + Supabase** — add new redirect URLs; keep old domain redirects 301 for one release.
4. **DNS** — point `jakstoimy.*` at Cloudflare Pages; keep `portfelik.adrianzinko.com` redirect.
5. **Comms** — privacy policy date bump; invite email copy.
6. **Repo/docs** — rename references when domain is live (avoid early doc drift).

## Post-cutover verification

- [ ] Login (Google + seeded email on staging)
- [ ] PWA install + push opt-in
- [ ] OG/social preview (add `og:image` if missing)
- [ ] App Store / Play (future Capacitor) bundle id naming

## Agent note

Spec #1 onboarding was built rebrand-safe. **No further product copy work** required for cutover beyond `app_name` and assets you already control.
