# JakStoimy 1.4.0: audyt języka interfejsu

Zakres: nowe i przebudowywane Auth oraz zaproszenia; projekt tekstów Demo 2.0,
importu i pierwszego kontaktu z finansami. Dokument nie zatwierdza implementacji
konta demo ani nie zmienia wszystkich tekstów aplikacji.

## Wzorce i źródła

Przegląd publicznych materiałów pomocy z 18 października 2026. To analiza dostępnych
instrukcji produktu, nie audyt ekranów po zalogowaniu ani deklaracja zgodności z
bankowymi standardami bezpieczeństwa. Poniższe wnioski są parafrazą; nie kopiujemy
tekstów ani mechanizmów autoryzacji banków.

| Źródło | Przydatny wzorzec | Zastosowanie w JakStoimy |
| --- | --- | --- |
| [ING: utracone hasło](https://www.ing.pl/pomoc-i-kontakt/centrum-pomocy-moje-ing/co-robic-gdy-nie-pamietam-hasla) | Opis sytuacji użytkownika prowadzi do konkretnej czynności | Błąd podaje następny krok: otwarcie aktualnej wiadomości lub powrót do logowania |
| [mBank: aktywacja i odblokowanie](https://www.mbank.pl/indywidualny/aplikacja-i-serwis/pytania-i-odpowiedzi-serwis/aktywacja-odblokowanie/) | Rozróżnienie logowania, odzyskania dostępu i aktywacji | Osobne komunikaty dla logowania, wysyłki linku i ustawienia hasła |
| [XTB: konto demo](https://www.xtb.com/pl/centrum-pomocy/rachunek-inwestycyjny/konto-demo) | Demo nazwane jako środowisko produktu, z własnymi zasadami korzystania | Stałe oznaczenie DEMO; zasady trwałości wynikają z naszej architektury, nie z oferty XTB |
| [PKO BP: odzyskanie hasła](https://www.pkobp.pl/klient-indywidualny/bankowosc-elektroniczna/centrum-wsparcia-bankowosci-elektronicznej/nie-pamietam-hasla) | Etykiety czynności i rozdzielenie sposobów odzyskania dostępu | Jeden jednoznaczny przycisk dla danego działania; opis skutku przed potwierdzeniem |
| [Pekao: odzyskanie dostępu](https://www.pekao.com.pl/klient-indywidualny/bankowosc-elektroniczna/zdalne-odzyskiwanie-hasel.html) | Instrukcja zakończenia operacji i ścieżka na wypadek problemu | Powrót do logowania i możliwość ponowienia nieudanej wysyłki |
| [Erste: odzyskanie hasła](https://www.erste.pl/klient-indywidualny/bankowosc-internetowa/odzyskaj-haslo) | Warunki i wymagane potwierdzenie opisane przy czynności | Weryfikacja adresu i dołączenie do grupy są wyraźnie oddzielone |

## Reguły i słownik

Stosujemy [istniejący styl produktu](polish-voice.md). Krótkie zdania, rzeczowe
nagłówki, czynność na przycisku. Bez sloganów, żartów, technicznych nazw i podawania
surowych błędów serwera. Błąd opisuje znany problem i dostępny następny krok.
Nie przypisujemy ogólnemu błędowi sieci konkretnej przyczyny, np. złego hasła.

Konto demo i Konto rzeczywiste to środowiska aplikacji, nie rachunki płatnicze.
Historia transakcji, Importuj transakcje, Analiza wpływów i wydatków, Prognoza salda,
Planowane wpływy i Planowane wydatki są nazwami treści i czynności. Nie zmieniamy
przy tej okazji całej nawigacji Kokpit / Transakcje / Plany / Import / Ustawienia.
Kwota z prognozy ma datę i źródła; nie nazywamy jej potwierdzonym saldem.

## Teksty zmienione w Auth i zaproszeniach

Porównanie z bazą gałęzi `a36a1a5`, do wykorzystania w opisie PR-a. „Nowy stan”
oznacza nowy komunikat, nie tekst usunięty z wcześniejszej wersji.

| Klucz lokalizacji | Poprzednio | Teraz |
| --- | --- | --- |
| `login_intro_body` | Importujesz wyciąg. Kokpit pokazuje miesiąc. Plany na cele i kredyty. | Importuj transakcje, analizuj wpływy i wydatki oraz planuj przyszłe operacje. |
| `invite_magic_link_sent` | Sprawdź skrzynkę i otwórz link z maila. | Otwórz link z wiadomości e-mail, aby kontynuować. Dołączenie do grupy potwierdzisz osobno. |
| `invite_unavailable_body` | Link wygasł, został użyty albo anulowany. | Zaproszenie wygasło, zostało przyjęte lub anulowane. Poproś osobę zapraszającą o nowe. |
| `invite_preview_error` | Nie udało się odczytać zaproszenia. | Nie udało się odczytać zaproszenia. Odśwież stronę i spróbuj ponownie. |
| `invite_claim_error` | Nie udało się dołączyć do grupy. | Nie udało się dołączyć do grupy. Spróbuj ponownie. Jeśli problem się powtórzy, poproś o nowe zaproszenie. |
| `invite_email_mismatch` | Zaloguj się na e-mail, na który poszło zaproszenie. | Zaloguj się na konto z adresem e-mail, na który wysłano zaproszenie. |
| `invite_use_other_account` | Użyj innego konta | Wyloguj się i użyj innego konta |
| `auth_existing_password` | Nowy stan / brak komunikatu | Zaloguj się hasłem |
| `auth_invite_verify_email` | Nowy stan / brak komunikatu | Wyślij link do ustawienia hasła |
| `auth_setup_title` | Nowy stan / brak komunikatu | Ustaw hasło do konta |
| `auth_setup_body` | Nowy stan / brak komunikatu | Hasło pozwoli Ci logować się przez e-mail na telefonie i komputerze. Dołączenie do grupy potwierdzisz osobno. |
| `auth_recovery_body` | Nowy stan / brak komunikatu | Ustaw nowe hasło do tego konta. Następnie wrócisz do aplikacji. |
| `auth_reset_sent` | Nowy stan / brak komunikatu | Jeśli konto istnieje, otrzymasz e-mail z linkiem do ustawienia hasła. |
| `auth_callback_error` | Nie udało się zalogować. Spróbuj ponownie za chwilę. (wspólny komunikat logowania) | Nie udało się potwierdzić logowania. Otwórz najnowszy link z wiadomości e-mail lub wróć do logowania. |
| `auth_reset_error` | Nowy stan / brak komunikatu | Nie udało się wysłać linku do zmiany hasła. Spróbuj ponownie za chwilę. |
| `auth_invite_send_error` | Nowy stan / brak komunikatu | Nie udało się wysłać linku. Sprawdź adres e-mail i spróbuj ponownie za chwilę. |
| `auth_setup_save_error` | Nowy stan / brak komunikatu | Nie udało się ustawić hasła. Spróbuj ponownie. |
| `auth_password_hint` | Nowy stan / brak komunikatu | Użyj co najmniej 8 znaków. |
| `auth_save_and_continue` | Nowy stan / brak komunikatu | Ustaw hasło |

Potwierdzenie wysyłki nie oznacza doręczenia do skrzynki ani przyjęcia zaproszenia.
Reset hasła nie ujawnia, czy konto istnieje. Ustawienie hasła nie nadaje członkostwa;
wymagana jest osobna decyzja użytkownika i autoryzacja serwerowa.

## Demo i import: teksty docelowe, jeszcze niewdrożone

Stare teksty przykładowego miesiąca pozostają do usunięcia wraz ze starym procesem.
Nie podmieniamy ich na obietnice izolacji, dopóki ta izolacja nie działa.

| Powierzchnia / poprzednio | Proponowany tekst | Warunek wdrożenia |
| --- | --- | --- |
| Wejście do starego demo po logowaniu | Otwórz konto demo / Zaloguj się | Zatwierdzona tożsamość demo i zachowanie rzeczywistej sesji |
| Makieta: import pozwoli sprawdzić historię, wydatki i prognozę salda | Zaimportuj przykładowy wyciąg, aby przeanalizować wpływy i wydatki. | Działający importer; bez obietnicy prognozy na podstawie samej historii |
| Nagłówek pustego demo | Rozpocznij od importu transakcji | Wskazówka 1, pomijalna, tylko w pustym demo |
| Opis pliku | Przykładowy wyciąg CSV · 6 miesięcy · 96 transakcji · dane fikcyjne | Plik i deterministyczny manifest zgodne z opisem |
| Akcje pliku | Pobierz plik / Importuj transakcje | Działające pobranie i otwarcie produkcyjnego importera, także na Androidzie |
| Gwarancja w makiecie | Korzystasz z danych fikcyjnych. Zmiany na koncie demo nie wpływają na dane konta rzeczywistego. | Testy izolacji, uprawnień i przełączania sesji |
| Po zatwierdzonym imporcie | Transakcje zostały zaimportowane. Zobacz analizę wpływów i wydatków. | Wskazówka 2; dopiero po zatwierdzeniu zapisu, nie po wczytaniu pliku |
| Pierwsza prognoza | Potwierdź saldo i dodaj planowane wpływy oraz wydatki, aby przygotować prognozę. | Wskazówka 3; działające saldo i cykle, bez narzuconej kolejności |
| Brak czynności na teraz | Pomiń | Pominięcie wskazówki nie usuwa danych ani nie blokuje funkcji |
| Zmiana konta | Przejdź do konta rzeczywistego | Prawdziwa sesja zostaje odzyskana lub użytkownik loguje się ponownie; demo pozostaje zachowane |
| Reset | Usuń dane konta demo | Wyłącznie po zatwierdzeniu projektu resetu; potwierdzenie pokazuje zakres, nie samo „Czy na pewno?” |

Makieta jest propozycją tekstów. Nie dodajemy jej stopki projektowej do produktu.
Nie pokazujemy sukcesu pobrania, importu, zmiany konta ani resetu przed faktycznym
zakończeniem odpowiedniej operacji. Nie dodajemy przycisku resetu przed jego akceptacją.

## Import i pierwszy kontakt: ograniczony backlog

| Obszar / obecny problem | Propozycja | Granica zmiany |
| --- | --- | --- |
| „Wgraj plik” przed odczytem | Wybierz plik | Etykieta wyboru, bez deklarowania zapisu transakcji |
| „Czytam plik...” | Odczytywanie pliku… | Stan parsowania, nie import zakończony |
| „Niezapisany import” mimo zachowanej wersji roboczej | Niedokończony import | Wyłącznie gdy dane robocze rzeczywiście zapisano |
| „Szkic został.” | Wersja robocza została zachowana. Możesz wrócić do importu później. | Dopiero po potwierdzonym zapisie |
| CSV bez poprawnych operacji | Nie znaleziono transakcji do importu. Sprawdź format i mapowanie kolumn. | Błąd walidacji, bez sugerowania usunięcia pliku |
| Wszystkie wiersze już istnieją | Te transakcje są już w historii. Nie dodano nowych transakcji. | Faktyczny wynik deduplikacji w obrębie tego samego konta |
| Pierwszy Kokpit | Saldo z transakcji / Bilans okresu | Zachować datę, PLN i źródło; bilans okresu nie jest dostępnym saldem |
| Pusta Historia | Brak transakcji. Importuj wyciąg lub dodaj transakcję. | Zwykły pusty stan, bez kolejnej obowiązkowej wskazówki |
| Pierwsze Analizy | Analiza wpływów i wydatków | Zakres dat i wynik istniejących obliczeń; nie oceniamy decyzji użytkownika |

Te propozycje wchodzą z PR-ami importu i onboardingu, przez Paraglide. Do każdego
PR-a należy dopisać faktyczne stare/nowe klucze, stany ładowania, błędu i sukcesu.
Nie zmieniamy komunikatów dla niewspieranych obecnie funkcji ani całego katalogu.

## Testy i kryteria przeglądu

- Ustawienie nazwy i hasła: rozbieżne hasła nie zapisują danych; sukces prowadzi
  do zaproszenia, członkostwo dopiero po osobnym potwierdzeniu.
- Brak zweryfikowanej sesji: wskazówka otwarcia aktualnego linku, brak formularza.
- Odzyskanie hasła: potwierdzenie warunkowe bez ujawnienia istnienia konta;
  odrzucenie wysyłki nie pokazuje sukcesu i pozwala ponowić próbę.
- Wysyłka linku zaproszenia: błąd z następnym krokiem, brak pozornego sukcesu;
  udana ponowna próba przypomina o osobnym dołączeniu do grupy.
- Wygasły callback nie korzysta z wcześniejszej sesji; błędny adres zaproszenia
  prowadzi do jawnego wylogowania i użycia właściwego konta.
- Responsywne testy przeglądarkowe są regresją języka i zachowania, a nie dowodem
  prawidłowej obsługi linków na fizycznym Androidzie.

Wszystkie wdrożone teksty mają klucze w `messages/pl.json`; po zmianie wymagane
są kompilacja Paraglide, kontrola typów i testy ekranów. Polski pozostaje jedynym
zmienianym katalogiem zgodnie z istniejącą konfiguracją projektu.
