# Plany Free i Premium

Status: decyzja produktowa. Progi liczbowe poniżej są hipotezą do porównania
z rzeczywistym użyciem, nie konfiguracją do włączenia. W becie nie egzekwujemy
limitów. Ten dokument nie uruchamia płatności.

JakStoimy sprzedaje wygodę i dalsze planowanie. Nie sprzedaje prawa do
zapisania własnej historii.

## Czego nie robimy

- Nie ma miesięcznego limitu transakcji ani importów. Limit rzędu dwudziestu
  nowych zapisów miesięcznie nie wystarcza do domowego budżetu.
- Zapis `2 / 3` nie wchodzi do interfejsu. Nie wiadomo z niego, czy to
  wykorzystanie, czy reszta. Sam kolor liczby też tego nie mówi.
- Zmiana wersji, migracja bazy i zmiana planu nie usuwają historii, importów
  ani istniejących planów. Reset danych przy zmianie architektury nie jest
  akceptowalnym kosztem w finansach osobistych.
- Limity nie żyją w komponentach Svelte. Jest jeden model uprawnień. Zapis
  sprawdza go serwer, także przy dwóch równoległych żądaniach. Ekran tylko
  pokazuje ten sam stan.

## Co zostaje bez limitu

Na Free i na Premium, także po zakończeniu bety:

| Zasób | Limit |
| --- | --- |
| Transakcje i historia | Bez limitu |
| Import CSV | Bez limitu |
| Podstawowa prognoza salda | Dostępna |
| Nadchodzące rachunki | Dostępne |

Podstawowa prognoza to obecna prognoza salda na horyzoncie 90 dni. Nadchodzące
rachunki to istniejące zobowiązania. To jest główna wartość aplikacji i zostaje
w Free.

## Hipoteza progów

Do sprawdzenia na prawdziwych kontach, zanim beta zamieni się w Free:

| Funkcja | Free | Premium |
| --- | --- | --- |
| Konta bankowe | 2 | Bez limitu |
| Aktywne reguły kategoryzacji | 10 | Bez limitu |
| Aktywne plany | 3 | Bez limitu |
| Pozycje jednego planu wydatkowego | 10 | Bez limitu |
| Limity kategorii | 5 | Bez limitu |
| Wspólny Dom | 2 osoby | Bez tego progu |
| Prognoza | Podstawowa | Rozszerzona |
| Symulacje finansowe | 1 aktywny scenariusz | Bez limitu |

Znaczenie liczników:

- Konto bankowe to `bank_accounts`, czyli cel importu. Księga transakcji nie
  wchodzi do tego licznika.
- Aktywny plan ma status `active` i okres aktualny albo przyszły. Plan
  zakończony datą oraz dług `closed` albo `refinanced` zostają w historii i nie
  zajmują miejsca.
- 10 pozycji dotyczy jednego aktywnego planu `spend`, nie całego konta. Jedna
  podróż nie może wyczerpać limitu wszystkich przedsięwzięć. Gdyby testy pokazały,
  że ludzie potrzebują innego cięcia, zmieniamy hipotezę przed włączeniem progu.
- Limit kategorii to kategoria z ustawionym `cap_amount`.
- Free obejmuje Dom dla dwóch osób. Para jest podstawowym użyciem, nie funkcją
  płatną. Premium zdejmuje próg dwóch osób. Górnej liczby Premium nie ustalamy
  teraz.
- Scenariusz to zapisany what-if, czyli dodatkowa ścieżka obok zwykłej
  prognozy. Jedna prognoza salda na 90 dni, razem z zobowiązaniami i później
  z pozycjami planów, zostaje w Free. Rozszerzona prognoza to porównanie więcej
  niż jednej takiej ścieżki, nie ukrycie podstawowego widoku za płatnością.
  Dopóki scenariusze nie są trwałymi obiektami, nie ma czego liczyć.
- Reguła po osiągnięciu limitu nadal kategoryzuje. Blokada dotyczy tylko nowej
  reguły.

## Beta

Każde konto w becie ma plan `beta`. Wszystkie progi są wyłączone, funkcje
włączone. Ustawienia mogą pokazać samo wykorzystanie, na przykład „Aktywne
plany: 2”, bez mianownika i bez „z 3”. Nie uczymy progu, którego jeszcze nie
zatwierdziliśmy.

Gdy włączymy Free, istniejące obiekty ponad próg zostają. Działa odczyt, edycja
i usuwanie. Działają istniejące reguły. Serwer odmawia tylko utworzenia kolejnego
obiektu danego typu. Zejście z Premium na Free używa tej samej zasady i niczego
nie kasuje.

## Ekran, gdy progi są włączone

Przykład docelowego Ustawień, nie widok bety i nie dane konkretnego konta:

```text
Twój plan
Free

Aktywne plany
2 z 3
Możesz utworzyć jeszcze 1 plan.

Reguły kategoryzacji
10 z 10
Limit osiągnięty. Istniejące reguły nadal działają.

Importy i historia transakcji
Bez limitu
```

Zasady kopii:

- Używamy „2 z 3”, nie „2 / 3”.
- Przy pozostałym miejscu jest zdanie, co jeszcze można utworzyć.
- Przy zerze nie piszemy „jeszcze 0”. Pisze się, że limit jest osiągnięty i że
  istniejące obiekty dalej działają.
- Bez progu jest „Bez limitu”, bez zdania o reszcie.
- Odmiana polska jest obowiązkowa: 1 plan, 2 plany, 5 planów.
- Liczniki odświeżają się po utworzeniu i usunięciu, bez ręcznego przeładowania.
- Przycisk tworzenia jest nieaktywny razem z tym zdaniem, zanim otworzy się
  formularz. Odmowa serwera używa tego samego wyjaśnienia.

## Model

Jeden moduł zwraca plan, wykorzystanie i decyzję `canCreate` dla kluczy:

- `bank_accounts`
- `active_rules`
- `active_plans`
- `spend_plan_items` (liczone w jednym planie)
- `category_caps`
- `household_members`
- `active_scenarios`

`forecast_extended` jest flagą funkcji, nie licznikiem. `forecast_basic`,
transakcje i import CSV nie mają progu.

Ścieżka tworzenia woła ten moduł po stronie serwera w tej samej operacji co
zapis. Sprawdzenie tylko w przeglądarce nie wystarcza. Komponent nie trzyma
własnej liczby.

Plan `beta` ma puste progi. Plany `free` i `premium` dostaną liczby z tabeli
dopiero po przeglądzie użycia. Podłączenie sklepu później zmienia źródło planu,
nie reguły liczenia.

## Kolejność

| Kiedy | Praca |
| --- | --- |
| Teraz | Dokończenie i przetestowanie importu |
| Następnie | Model `spend`, pozycje planów, rozliczenia |
| Równolegle | Model uprawnień: `beta`, `free`, `premium`, liczniki, bez egzekwowania progów |
| Po planach i po danych z bety | Decyzja, które progi z hipotezy włączyć |
| Przed publiczną monetyzacją | Billing, zejście na Free, odzyskanie zakupów, anulowanie subskrypcji |

Rozliczenie planowanej płatności aktualizuje transakcję, plan i prognozę jednym
przepływem. Szczegóły są w `future-financial-plans.md`. To nie jest osobny
system obok entitlementów.

## Co nowego

Drobna, osobna zmiana, nie część billingu. W menu konta przy „Co nowego” jest
kropka, gdy wersja z changelogu jest nowsza niż
`profiles.settings.changelogSeenVersion`. Wejście na `/changelog` zapisuje
bieżącą wersję i kropka znika. Bez osobnego „oznacz jako przeczytane”, bez
modala i bez powiadomienia push.

## Awatar

Biblioteka gotowych memoji (`avatarPresetId`, pliki z `/avatars/`) ma docelowo
zniknąć. Zastępuje ją stabilny awatar pikselowy w motywie finansowym, liczony
z tożsamości użytkownika, na wzór identiconów. Do tego czasu zostają zdjęcie
z logowania i inicjały. Tej zamiany nie robimy razem z modelem planów.

## Reguły i kategorie

Odznaczenie warunku opisu albo kontrahenta ma się zapisać. Jeśli po zmianie
reguła jest tym samym dopasowaniem co inna reguła tego użytkownika, zostaje
jedna: edytowana, z wyższym priorytetem z tej pary. Istniejące dopasowania
dalej działają. Komunikat „Taki wpis już istnieje.” nie opisuje tej sytuacji.
Gdy kolizji nie da się tak złączyć, komunikat brzmi „Taka reguła już istnieje.”

Masowe operacje na regułach i kategoriach (usuwanie wielu, przeniesienie do
innej kategorii, wyłączenie) wymagają osobnej specyfikacji. Nie projektujemy
ich przy entitlementach.

## Poza tym dokumentem

Płatności, cennik, odzyskiwanie zakupów i obsługa anulowania. Włączenie progów
w becie. Miesięczny limit transakcji. Ukrywanie albo kasowanie historii po
zmianie planu. Implementacja awatara pikselowego i masowych operacji.
