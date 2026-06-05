# ARCHIVED — superseded by public launch (2026-06)

This note applied to the closed beta period. Public launch uses updated privacy
copy and onboarding; keep this file for historical reference only.

# Nota onboardingowa dla testerów beta

Ostatnia aktualizacja: 5 czerwca 2026

Krótka, prosta wiadomość do zaufanych testerów. Pełne zasady opisuje
[polityka prywatności](../legal/privacy-policy.md). Wersja do wysłania (np.
wiadomość/onboarding) poniżej.

---

**Witaj w becie Portfelika 👋**

Dziękujemy, że pomagasz testować Portfelik. Zanim wgrasz dane, kilka rzeczy
wprost:

- **To jest wersja beta.** Funkcje i zakres danych mogą się zmieniać.
- **Wgrywaj tylko potrzebną historię.** Zaimportuj wyłącznie tyle wyciągów
  bankowych, ile potrzebujesz do testów — nie musisz wrzucać całej historii.
- **Brak szyfrowania end-to-end.** Twoje dane finansowe są przechowywane w
  formie surowej, bo są potrzebne do importów, kategoryzacji i podsumowań.
  Chronimy je kontrolą dostępu na poziomie konta, a narzędzia administracyjne
  pokazują dane zamaskowane — ale operator produkcyjny technicznie może je
  odczytać.
- **Możesz usunąć dane w każdej chwili.** Usunięcie konta i danych jest dostępne
  w **Ustawienia → Profil**.
- **Eksport jest częściowy.** W becie wyeksportujesz transakcje do CSV; pełny
  eksport konta (kategorie, plany, grupy, reguły, metadane importów) jest w
  przygotowaniu.

Pełne informacje: polityka prywatności w aplikacji (`/privacy`).

Miłego testowania! Każda uwaga się przyda.

---

## Notatki wewnętrzne (nie wysyłać testerom)

- Komunikat ma być pokazany/wysłany **zanim** tester wgra realną historię banku.
- Spójność: te same fakty (beta, brak E2E, usuwanie teraz, eksport częściowy) są
  w `docs/legal/privacy-policy.md` i na stronie `/privacy`. Przy zmianie jednego
  miejsca zaktualizuj pozostałe.
