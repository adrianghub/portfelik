# JakStoimy

Zobacz, na co idą Twoje pieniądze.

Importujesz wyciąg z banku. Transakcje i plany (cele i kredyty) opierają się
na tym, co naprawdę wpłynęło. Kokpit pokazuje miesiąc bez ręcznego
przepisywania historii.

**[Otwórz aplikację →](https://app.jakstoimy.pl)** · staging:
[dev.portfelik.pages.dev](https://dev.portfelik.pages.dev)

Dostęp jest **tylko na zaproszenie**. Na co dzień logujesz się Google.
E-mail i hasło zostawiamy pod lokalne i stagingowe testy.

Web, zainstalowane PWA i Android (Capacitor, `pl.jakstoimy.app`) to ten sam
produkt. Nawigacja: **Kokpit**, **Transakcje**, **Plany**. Import to ścieżka
z Transakcji i przypomnień, nie osobna pozycja w menu.

## Co robi aplikacja

| | |
| --- | --- |
| **Kokpit** | Dopóki nie ma zatwierdzonej transakcji ani dema: powitanie i wybór importu albo przykładu. Potem wpływy, wydatki, bilans, postęp planów i to, co wymaga uwagi. |
| **Transakcje** | Historia i nadchodzące. Stąd wchodzisz w import wyciągu. Prywatna gotówka. |
| **Import** | Parse, kategorie, duplikaty, zatwierdzenie. Przegląd pokazuje wyjątki. Czyste wiersze wchodzą bez dodatkowej pracy. |
| **Plany** | Cele oszczędnościowe i kredyty. Postęp z prawdziwych transakcji, nie z wymyślonej historii. |
| **Ustawienia** | Kategorie, reguły, grupy, wygląd, powiadomienia. |

Wyciąg bankowy jest źródłem prawdy. Ręczny wpis to korekta albo brakujący wiersz.
Kategoria na jednym wierszu jest jednorazowa, dopóki nie zastosujesz jej do
podobnych albo nie zapiszesz reguły.

Prywatny produkt · invite-only beta · brand **JakStoimy** (repo: `portfelik`).

## Stack

SvelteKit (Svelte 5) · Tailwind 4 · TanStack Query · Paraglide (PL) ·
Supabase (Auth, Postgres, RLS, Edge) · Cloudflare Pages · Capacitor 8 (Android)

```text
apps/web-svelte/   aplikacja (web, PWA, Android WebView)
supabase/          migracje + Edge Functions
docs/product/      kierunek produktu + głos copy
docs/architecture/ jak to jest zbudowane
docs/runbooks/     operacje (invite, sekrety, Play Internal)
```

Kod i migracje są SSOT. Docs opisują decyzje i procedury. Nie dublują
zaimplementowanego zachowania.

## Lokalnie

Docker + Node + `pnpm`.

```bash
supabase start && supabase db reset
cd apps/web-svelte
pnpm install && pnpm seed:local && pnpm dev
```

Komendy z `apps/web-svelte/`. Szczegóły aplikacji:
[apps/web-svelte/README.md](apps/web-svelte/README.md).

| Komenda | Po co |
| --- | --- |
| `pnpm check` | typowanie |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm test:unit` | unit |
| `pnpm test:e2e` | Playwright (mocked) |
| `pnpm test:rls` | RLS + RPC (lokalny Supabase) |
| `pnpm build` | build → `build/` |
| `pnpm android:sync` | `pnpm build` + Capacitor sync |

Android Internal AAB idzie z CI po deployu `main`. Lokalny fallback i sekrety:
[docs/runbooks/play-internal.md](docs/runbooks/play-internal.md).

Środowiska: `dev` → staging, `main` → produkcja. Feature z aktualnego `dev`.
Start: `./scripts/start-work.sh <branch>`. PR: `./scripts/open-pr.sh`.
Tylko `dev` wchodzi na `main`. Mapa:
[docs/architecture/env-workflow.md](docs/architecture/env-workflow.md).

## Docs

| | |
| --- | --- |
| [Kierunek produktu](docs/product/product-direction.md) | teza, spine, import, plany |
| [Głos PL](docs/product/polish-voice.md) | jak piszemy w aplikacji |
| [Architektura](docs/architecture/README.md) | system, baza, flowy, ADR |
| [Runbooki](docs/runbooks/) | invite, sekrety, Play Internal |
| [CLAUDE.md](CLAUDE.md) | reguły agentów |
