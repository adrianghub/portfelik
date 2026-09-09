# Polish product voice — JakStoimy

How we write user-facing Polish. Source of truth for wording is also
`apps/web-svelte/messages/pl.json` — keep them aligned.

## Who we sound like

A calm product partner who respects your time. Clear, professional, human.

Inspired by Polish bank *prosty język* (mBank mKanon, ING „Po prostu”, PKO
Prosto, Pekao / Santander–Erste) — especially **logged-in product UI**, not
campaign slogans.

Not a coach. Not ChatGPT marketing. Not slangy chat.

## Two registers

| Register | Where | Tone |
|---|---|---|
| Warm and clear | Login, tour, empty states, demos | *ty*, short, lightly human |
| Calm and precise | Money context, errors, security, permissions | *ty*, no jokes, no pep-talk |

Both registers stay professional. Warm does not mean chatty.

## Rules

1. Lead with what happened or what to do next.
2. Prefer short sentences (about 15–20 words).
3. Use everyday words: *wyciąg*, *przelew*, *kategoria*, *plan*.
4. Prefer verbs: *Importuj wyciąg*, not *Uruchom proces importu*.
5. Keep product nouns stable: **Kokpit**, **Transakcje**, **Plany**, **Import**,
   **Ustawienia**.
6. Errors: what failed + what to try. No blame, no drama.
7. Stay truthful — never promise behavior the product does not do.
8. Do not “refresh” already-plain chrome (*Zaloguj się*, *Dalej*, *Gotowe*)
   just to change wording.
9. **No pause dashes** in UI copy. Prefer a full stop or a comma, not `—`,
   `–`, or ` - ` as a dramatic break. Keep technical forms: *e-mail*, ranges
   like *1-31*, and intentional placeholders.
10. Prefer *aplikacja* over *apka*. Prefer precise verbs over slang
    (*ogarnąć*, *zerknij*).

## Do / don’t

| Do | Don’t |
|---|---|
| Zobacz, na co idą Twoje pieniądze. | Daj każdej złotówce konkretne zadanie. |
| Zacznij od przykładowego miesiąca | Zobacz, jak pieniądze dostają kierunek |
| Importuj wyciąg | Uruchom ścieżkę importu bankowego |
| Nie udało się zalogować. Sprawdź e-mail i hasło. | Wystąpił nieoczekiwany błąd w procesie uwierzytelniania. |
| Brak transakcji w tym miesiącu | Twój miesiąc jeszcze czeka, aż nadasz mu kierunek |
| Nie można usunąć. Kategoria jest już używana. | Nie da się usunąć — coś z tego korzysta. |
| Sprawdź je ręcznie przed zatwierdzeniem. | Zerknij na nie ręcznie |

## Banned / avoid (soft surfaces especially)

- *kierunek pieniędzy*, *dostają kierunek*
- *konkretne zadanie* (for money)
- *poczucie winy*
- *inflacja stylu życia* (as UI copy)
- *świadomie* as filler
- Therapy / guilt / empowerment slogans
- English jargon when a Polish everyday word exists
- Long metaphor stacks
- Pause dashes used as sentence glue
- Chat slang: *apka*, *ogarnąć*, *zerknij*

## Checklist before merging copy

- [ ] Right register (warm vs calm), still professional
- [ ] No pause dashes in user-facing strings
- [ ] No banned slogan phrases or chat slang
- [ ] Still truthful vs product behavior
- [ ] E2E assertions for changed strings updated
- [ ] Paraglide recompiled after `messages/pl.json`
