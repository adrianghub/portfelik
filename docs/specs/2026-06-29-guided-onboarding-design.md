# Spec — Guided onboarding (demo + przewodnik)

Date: 2026-06-29  
Status: In progress — A+B+C landed (engine, chrome, welcome, all 13 scenes wired)  
Replaces: passive `DashboardOnboardingChecklist` („Pierwsze kroki”)  
Depends on: existing demo seed (`demo-data.ts`), glossary (`glossary.ts`), Plausible events

## Copy principles (locked)

- Naturalny polski, bez myślników i pauz typu „—”.
- Krótko. Jedna myśl na krok.
- Bez żargonu finansowego bez wyjaśnienia (link do słowniczka).
- Bez redundancji z banerem demo ani z hintami na ekranie.
- Ton: jak znajomy tłumaczy aplikację, nie jak system.

## Problem

„Pierwsze kroki” to pasywna lista na już przeładowanym Pulpicie. Demo i onboarding nie współpracują. Słownik jest w Ustawieniach, a nie w momencie nauki. Nowy użytkownik nie widzi, **gdzie** klikać.

## Rozwiązanie

**Tryb przewodnika** po załadowaniu danych przykładowych:

1. Ekran powitalny: „Zobacz przykład” / „Mam już wyciąg”.
2. Przykład → auto `seedDemoData()` → start przewodnika (bez dodatkowego kliku).
3. Pasek ze **światłami** (rozdziały) + Wstecz / Dalej / Pomiń.
4. **Spotlight** na jeden element UI na krok.
5. Koniec → zachęta do importu własnych danych.

Karta „Pierwsze kroki” znika z Pulpicu.

## Rozdziały i sceny

### Rozdział 1 · Pulpit

| Scena | Element | Copy (PL) |
| --- | --- | --- |
| 1.1 | Pierścień bilansu | „Przychody minus wydatki w wybranym okresie.” |
| 1.2 | Co wymaga uwagi | „Tu widać, co warto przejrzeć.” |
| 1.3 | Wydatki w okresie | „Rozkład wydatków. Porównania pojawią się od następnego dodanego okresu.” |

Scena 1.3: ukryć hint `dashboard_spending_first_period` podczas przewodnika (copy i tak w scenie).

### Rozdział 2 · Transakcje

| Scena | Element | Copy (PL) |
| --- | --- | --- |
| 2.1 | Lista transakcji | „Lista dodanych transakcji. Możesz je poprawić albo oznaczyć jako opłacone.” |
| 2.2 | Filtry / widoki | „Filtruj po okresie, statusie albo tym, co nie jest jeszcze przy planie.” |
| 2.3 | Przycisk importu | „Gdy będziesz gotowy na dodanie swoich danych, transakcje mogą zostać dodane na podstawie wgranego importu.” *(pokaz, bez uruchamiania)* |

### Rozdział 3 · Plany

| Scena | Element | Copy (PL) |
| --- | --- | --- |
| 3.1 | Majątek netto | „Ustaw, ile masz na koncie i ile jesteś winien. Reszta liczy się sama z transakcji.” |
| 3.2 | Cel oszczędnościowy (demo) | „Cel to plan na przyszłość. Postęp widać po powiązaniu wpłat z listy transakcji.” |
| 3.3 | Rozliczenie | „Tu łączysz transakcję z celem albo ratą kredytu.” |

### Rozdział 4 · Ustawienia (wariant C — grupy zawsze)

Grupy są kluczową funkcją produktu; każdy newcomer widzi scenę o współpracy.

| Scena | Element | Copy (PL) |
| --- | --- | --- |
| 4.1 | Przypomnienia o imporcie | „Opcjonalnie: przypomnienie, żeby regularnie dogrywać wyciągi.” |
| 4.2 | Słowniczek | „Nie znasz słowa? Tu są krótkie wyjaśnienia.” |
| 4.3 | Kategorie / reguły | „Po pierwszym imporcie możesz dostosować kategorie i reguły.” |
| 4.4 | Grupy | „Możesz zaprosić drugą osobę i wspólnie śledzić transakcje oraz plany.” |

### Zakończenie

| Scena | Copy (PL) |
| --- | --- |
| Exit | „Gotowe. Chcesz dodać swoje dane? Wgraj import z banku.” |
| CTA | „Importuj” → `/import` · „Zostaw przykład” → zamknij przewodnik |

## Demo

- Auto przy ścieżce „Zobacz przykład”.
- Baner: „Przeglądasz dane przykładowe” (bez zmian).
- Wzbogacić seed o wyraźny cel z postępem i jedną ratę kredytu do rozliczenia (bez nowych migracji).
- `canSeedDemo` bez zmian: blokada gdy są realne transakcje.

## Stan

```ts
interface GuidedTourProgress {
  dismissed?: boolean;
  completedSceneIds?: string[];
  path?: "demo" | "import";
}
```

`profiles.settings.guidedTour` + opcjonalny mirror `localStorage`.

## Analytics

`guided_tour_started`, `guided_tour_scene_viewed`, `guided_tour_completed`, `guided_tour_skipped` — props: `scene_id`, `chapter`.

## Pliki (plan)

- `services/guided-tour.ts` — definicje scen, postęp
- `components/onboarding/GuidedTourChrome.svelte` — światła + nawigacja
- `components/onboarding/TourSpotlight.svelte` — overlay + `data-tour-id`
- `routes/dashboard/+page.svelte` — usunąć checklist, podłączyć chrome
- `messages/pl.json` — klucze `tour_*` (przy implementacji)
- Usunąć: `DashboardOnboardingChecklist.svelte`, `onboarding-progress` kroki UI (sygnały mogą zostać dla analytics)

## Copy już zaktualizowane (2026-06-29)

- `dashboard_spending_first_period`
- `onboarding_subtitle`, `onboarding_step_done`
- `glossary_*` (krótkie i długie, bez myślników)
- `demo_settings_body`, `attention_overdue`, `dashboard_balance_ring_no_spending`

## Poza zakresem

- Pełny import wizard w tourze
- Belka / scenariusze / refinansowanie
- Coachmarki (zastąpione przewodnikiem)
- Self-serve signup

## Testy

- Unit: postęp scen, skip, complete
- E2E: ścieżka demo → 3 sceny → skip; exit → import link
- Glossary: istniejące testy po copy pass

## Metryki (po Plausible)

- % użytkowników kończących przewodnik
- % przechodzących z demo do importu w 7 dni

## Pulpit — uproszczenie układu (2026-06-29)

| Warstwa | Decyzja |
| --- | --- |
| Nagłówek | Powitanie + tytuł, bez cytatu dnia |
| Bilans + wydatki | `md:items-start` — karty mają naturalną wysokość (bez rozciągania) |
| Bilans | Pierścień wyśrodkowany w sekcji; legenda na dole karty (jak Szczegóły) |
| Wydatki | Bez `h-full` / `flex-1`; max 3 kategorie + 3 szczegóły, reszta w dialogu „Zobacz więcej” |
| Pierwszy okres | Hint w ramce z przerywaną obwódką tuż pod Top kategorie (nie na dole karty) |
| Wykres historii | Pełna szerokość |
| Status | 2×2: uwaga (max 3 + dialog), plany (max 3 + dialog), import, majątek |
| Nadchodzące | Max 3 wiersze na Pulpicie |

Checklist „Pierwsze kroki” zastąpi przewodnik z tego specu (~12 scen, wariant C).

## Maintainer — edycja bez grzebania w komponentach

**Struktura (kolejność rozdziałów, scen, przycisków demo):**  
`apps/web-svelte/src/lib/content/onboarding.ts`

| Co zmieniasz | Gdzie w manifeście |
| --- | --- |
| Kolejność rozdziałów (światła w chrome) | `ONBOARDING_CHAPTER_ORDER` |
| Kolejność kroków przewodnika, route, spotlight | `ONBOARDING_SCENES` |
| Przyciski panelu Ustawienia → Profil | `DEMO_WALKTHROUGH_ACTIONS` (`when`, `variant`, kolejność) |
| Przyciski banera na Pulpicie | `DEMO_BANNER_ACTIONS` |

**Copy (teksty dialogów):**  
`apps/web-svelte/messages/pl.json` — klucze `tour_*` i `demo_*`.  
Mapowanie scen → klucze: `ONBOARDING_SCENE_COPY` w manifeście (dodaj wpis przy nowej scenie).

Po zmianie copy: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`  
Walidacja struktury: `pnpm test:unit tests/unit/onboarding-manifest.spec.ts`
