# Polityka prywatności

Ostatnia aktualizacja: 7 czerwca 2026

Portfelik jest aplikacją do zarządzania finansami osobistymi. Ten dokument opisuje
prostym językiem, jakie dane przechowujemy, dlaczego, kto technicznie ma do nich
dostęp oraz jakie masz prawa. Treść tej strony jest źródłem dla widoku `/privacy`
w aplikacji - zmiany utrzymuj w obu miejscach spójnie.

**Administrator danych:** Adrian Zinko (kontakt: adres e-mail widoczny w koncie
Portfelik / zaproszeniach do aplikacji).

## Jakie dane przechowujemy

- **Transakcje** - kwota, waluta, data, opis, kategoria, typ (przychód/wydatek)
  oraz oznaczenie, czy wpis jest prywatny, czy współdzielony w grupie.
- **Importy z banku** - wgrane pliki CSV są przetwarzane na transakcje; przechowujemy
  metadane sesji importu (źródło, status, czas zatwierdzenia) potrzebne do wykrywania
  duplikatów i podsumowań. Surowe pliki CSV nie są trwale przechowywane jako osobny
  archiwum po zatwierdzeniu importu.
- **Plany** - przyszłe zamiary finansowe: budżety wydatków (`spend`), cele
  oszczędnościowe (`save`), kredyty (`debt`) wraz z powiązaniami do transakcji
  (rozliczenie planu).
- **Warunki kredytu** - dla planów typu kredyt: kwota początkowa, saldo, oprocentowanie,
  rata (wpisywane ręcznie przez użytkownika).
- **Majątek netto (wpis ręczny)** - opcjonalny snapshot gotówki, inwestycji i
  nieruchomości wraz ze datą stanu; **nie pochodzi z importu bankowego**.
- **Grupy i zaproszenia** - członkostwo, role (właściciel grupy, współwłaściciel,
  członek) oraz adres e-mail osoby zapraszanej (widoczny w ramach współdzielenia).
- **Profil** - adres e-mail logowania, ustawienia (w tym opcjonalne przypomnienia o
  imporcie), rola konta w aplikacji.
- **Powiadomienia** - treść powiadomień w aplikacji oraz, jeśli włączysz push w
  przeglądarce, pseudonimowy token subskrypcji push danego urządzenia.

## Współdzielenie w grupach

Gdy przypiszesz transakcję lub plan do grupy, członkowie tej grupy widzą współdzielone
wpisy zgodnie z rolami:

- **Wszyscy członkowie** mogą czytać współdzielone transakcje i plany oraz powiązywać
  transakcje z planami (rozliczenie).
- **Właściciel grupy i współwłaściciele** mogą edytować współdzielone plany i
  transakcje grupowe.
- **Zwykli członkowie** nie mogą edytować cudzych planów ani cudzych transakcji
  w grupie - tylko je oglądać i rozliczać.
- Import bankowy pozostaje **tylko u właściciela konta**, który go wykonał; metadane
  importu nie są udostępniane innym członkom grupy.

## Dlaczego przechowujemy dane surowe

Surowe dane finansowe istnieją w produkcyjnej bazie danych, ponieważ są niezbędne do
działania produktu: importów, kategoryzacji, podsumowań, pulpitu oraz rozliczania
planów względem transakcji. Aplikacja **nie jest szyfrowana end-to-end** - ochrona
polega na kontroli dostępu na poziomie konta i prywatności narzędzi administracyjnych,
a nie na kryptograficznym ukryciu danych przed operatorem.

## Podmioty przetwarzające

Dane są przechowywane u zaufanych dostawców infrastruktury:

- **Supabase** (baza danych, uwierzytelnianie) - region zgodny z konfiguracją projektu
  produkcyjnego.
- **Cloudflare Pages** (hosting aplikacji webowej).

Umowy i polityki prywatności tych dostawców regulują ich warstwę infrastruktury.

## Kto technicznie ma dostęp

- Twoje dane są chronione kontrolą dostępu na poziomie konta (RLS - Row-Level
  Security). Inni użytkownicy nie widzą Twoich danych, poza danymi celowo
  współdzielonymi w grupie.
- Jedyny adres e-mail, który może zobaczyć inny użytkownik, to e-mail powiązany z
  zaproszeniem/współdzieleniem w grupie.
- Narzędzia administracyjne/wsparcia są **maskujące**: kwoty w przedziałach, opisy jako
  `[masked]`, e-maile jako `a***@domena`. Surowe szczegóły finansowe nie są dostępne
  przez zwykłe ekrany administracyjne.
- Mimo to właściciel bazy danych / posiadacz klucza service-role / operator
  produkcyjny **technicznie** może odczytać dane surowe. Dostęp produkcyjny jest
  ograniczony do operatorów, którzy go potrzebują (patrz runbook Layer 2).

## Okres przechowywania

Przechowujemy dane do momentu usunięcia konta przez użytkownika lub do czasu
zażądania usunięcia. Po usunięciu konta dane są trwale kasowane z bazy (kaskada
z `auth.users`).

## Powiadomienia push

Jeśli włączysz powiadomienia push, przechowujemy pseudonimowy token subskrypcji
przeglądarki, aby móc dostarczać powiadomienia. Klucz publiczny VAPID jest elementem
standardu Web Push i nie identyfikuje Ciebie.

## Usuwanie i eksport danych

Możesz usunąć konto i dane z poziomu aplikacji (**Ustawienia → Profil**). Pełny
eksport konta (JSON) obejmuje: transakcje, kategorie, reguły kategoryzacji, plany z
powiązaniami, warunki kredytów, grupy, członkostwa, konta bankowe (etykiety),
metadane sesji importu, wpis majątku netto oraz profil. Eksport transakcji do CSV
pozostaje dostępny na ekranie Transakcje.

Usunięcie konta realizuje funkcja `delete_account()` i trwale usuwa Twoje dane.
Jeśli jesteś właścicielem grupy, musisz najpierw przekazać własność grupy lub ją
rozwiązać.

## Twoje prawa

Masz prawo do dostępu do swoich danych (eksport), sprostowania (edycja w aplikacji),
usunięcia (usunięcie konta) oraz ograniczenia zakresu danych, które wgrywasz (np.
krótsza historia importu). W sprawach prywatności skontaktuj się z administratorem
pod adresem e-mail powiązanym z kontem Portfelik.
