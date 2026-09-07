# JakStoimy

Zobacz, na co idą Twoje pieniądze.

Importujesz wyciąg z banku, ogarniasz transakcje i plany (cele + kredyty),
a Kokpit pokazuje, jak wygląda miesiąc — bez ściemy i bez ręcznego
przepisywania historii.

**[Otwórz aplikację →](https://app.jakstoimy.pl)** · staging:
[dev.portfelik.pages.dev](https://dev.portfelik.pages.dev)

Dostęp jest **tylko na zaproszenie**. Na co dzień logujesz się Google;
e-mail/hasło zostawiamy pod lokalne i stagingowe testy.

## Co robi apka

| | |
| --- | --- |
| **Kokpit** | Wpływy, wydatki, bilans, postęp planów, rzeczy do ogarnięcia |
| **Transakcje** | Historia + nadchodzące; import wyciągu; prywatna gotówka |
| **Plany** | Cele i kredyty — postęp z prawdziwych transakcji |
| **Ustawienia** | Kategorie, reguły, grupy, wygląd, powiadomienia |

Bank import = źródło prawdy. Ręczny wpis to korekta albo brakujący wiersz.
Plany nie wymyślają historii — łączysz je z tym, co już masz.

## Stack

SvelteKit (Svelte 5) · Tailwind 4 · TanStack Query · Paraglide (PL) ·
Supabase (Auth, Postgres, RLS, Edge) · Cloudflare Pages

```text
apps/web-svelte/   aplikacja
supabase/          migracje + Edge Functions
docs/product/      kierunek produktu + głos copy
docs/architecture/ jak to jest zbudowane
docs/runbooks/     operacje
```

Kod i migracje są SSOT. Docs opisują decyzje i procedury — nie dublują
zaimplementowanego zachowania.

## Lokalnie

Docker + Node + `pnpm`.

```bash
supabase start && supabase db reset
cd apps/web-svelte
pnpm install && pnpm seed:local && pnpm dev
```

| Komenda | Po co |
| --- | --- |
| `pnpm check` | typowanie |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm test:unit` | unit |
| `pnpm test:e2e` | Playwright (mocked) |
| `pnpm test:rls` | RLS + RPC (lokalny Supabase) |
| `pnpm build` | build → `build/` |

Środowiska: `dev` → staging, `main` → produkcja. Feature z aktualnego `dev`.
PR: `./scripts/open-pr.sh`. Env map:
[docs/architecture/env-workflow.md](docs/architecture/env-workflow.md).

## Docs

| | |
| --- | --- |
| [Kierunek produktu](docs/product/product-direction.md) | teza, moduły, import/plany |
| [Głos PL](docs/product/polish-voice.md) | jak piszemy w apce |
| [Architektura](docs/architecture/README.md) | system, baza, flowy, ADR |
| [Runbooki](docs/runbooks/) | invite, sekrety, ops |
| [CLAUDE.md](CLAUDE.md) | reguły agentów |

Prywatny produkt · invite-only beta · brand **JakStoimy** (repo: `portfelik`).
