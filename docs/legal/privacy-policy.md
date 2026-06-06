# Polityka prywatności

Ostatnia aktualizacja: 5 czerwca 2026

Portfelik jest aplikacją do zarządzania finansami osobistymi. Ten dokument opisuje
prostym językiem, jakie dane przechowujemy,
dlaczego, kto technicznie ma do nich dostęp oraz jakie masz prawa. Treść tej
strony jest źródłem dla widoku `/privacy` w aplikacji — zmiany utrzymuj w obu
miejscach spójnie.

## Jakie dane przechowujemy

- **Transakcje** — kwota, waluta, data, opis, kontrahent/odbiorca, kategoria,
  typ (przychód/wydatek) oraz oznaczenie czy są prywatne, czy współdzielone w
  grupie.
- **Importy z banku** — pliki CSV wgrane przez Ciebie są przetwarzane na
  transakcje; przechowujemy metadane sesji importu (np. źródło, status, czas
  zatwierdzenia) potrzebne do wykrywania duplikatów i podsumowań.
- **Plany** — przyszłe zamiary finansowe (wewnętrznie wciąż oparte o strukturę
  list zakupowych).
- **Grupy i zaproszenia** — członkostwo, role oraz adres e-mail osoby
  zapraszanej/zaproszonej (widoczny w ramach współdzielenia z grupą).
- **Profil** — adres e-mail logowania, ustawienia (w tym opcjonalne przypomnienia
  o imporcie), rola konta.
- **Powiadomienia** — treść powiadomień w aplikacji oraz, jeśli włączysz push w
  przeglądarce, pseudonimowy token subskrypcji push danego urządzenia.

## Dlaczego przechowujemy dane surowe

Surowe dane finansowe istnieją w produkcyjnej bazie danych, ponieważ są
niezbędne do działania produktu: importów, kategoryzacji, podsumowań, pulpitu
oraz przyszłego rozliczania planów względem transakcji. Aplikacja **nie jest
szyfrowana end-to-end** — ochrona polega na kontroli dostępu na poziomie konta i
prywatności narzędzi administracyjnych, a nie na kryptograficznym ukryciu danych
przed operatorem.

## Kto technicznie ma dostęp

- Twoje dane są chronione kontrolą dostępu na poziomie konta (RLS — Row-Level
  Security). Inni użytkownicy nie widzą Twoich danych, poza danymi celowo
  współdzielonymi w grupie.
- Jedyny adres e-mail, który może zobaczyć inny użytkownik, to e-mail powiązany z
  zaproszeniem/współdzieleniem w grupie.
- Narzędzia administracyjne/wsparcia są **maskujące**: pokazują dane
  zdiagnozowane w formie zamaskowanej (kwoty w przedziałach, opisy jako
  `[masked]`, e-maile jako `a***@domena`). Surowe szczegóły finansowe nie są
  dostępne przez zwykłe ekrany administracyjne.
- Mimo to właściciel bazy danych / posiadacz klucza service-role / operator
  produkcyjny **technicznie** może odczytać dane surowe. Dostęp produkcyjny jest
  ograniczony do operatorów, którzy go potrzebują (patrz runbook Layer 2).

## Powiadomienia push

Jeśli włączysz powiadomienia push, przechowujemy pseudonimowy token subskrypcji
przeglądarki, aby móc dostarczać powiadomienia. Klucz publiczny VAPID jest
elementem standardu Web Push i nie identyfikuje Ciebie.

## Usuwanie i eksport danych

Możesz usunąć konto i dane z poziomu aplikacji. W **Ustawienia → Profil**
dostępny jest pełny eksport konta (JSON): transakcje, kategorie, reguły,
plany, grupy, konta bankowe i metadane sesji importu. Eksport transakcji do CSV
pozostaje dostępny na ekranie Transakcje.

Usunięcie konta realizuje funkcja `delete_account()` i trwale usuwa Twoje dane.
