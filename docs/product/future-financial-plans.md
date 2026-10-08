# Przyszłość finansowa — następny milestone

Status: projekt do przeglądu, **nie wdrożone zachowanie**. Stabilizacja importu
jest oddzielną zmianą. Rozszerzamy istniejące Plany; nie dodajemy modułu Wakacje
ani integracji bankowej.

## Rodzaje i zgodność

| Rodzaj                         | Znaczenie                    | Progres           |
| ------------------------------ | ---------------------------- | ----------------- |
| Cel oszczędnościowy (`save`)   | Akumulacja, np. poduszka     | Zgromadzono / cel |
| Plan wydatkowy (`spend`, nowy) | Budżet projektu, np. wakacje | Wydano / budżet   |
| Spłata długu (`debt`)          | Kapitał i odsetki            | Pozostały kapitał |

Obecny `save` liczy powiązane opłacone wydatki i korekty; `debt` ma osobne
warunki kredytu. Nie zmieniamy automatycznie znaczenia istniejących danych.
Kategorie opisują rodzaj kosztu; plan i jego pozycja są drugim wymiarem.
Transport nie staje się kategorią Teneryfa.

## Pozycje i rozliczenia

Nowe `plan_items` należą do planu wydatkowego: etykieta, planowana kwota PLN,
opcjonalny termin DATE i odbiorca. Stan opisuje pewność płatności, nie rezerwację
i nie dowód, że pieniądze wyszły z konta. Szacowane nie ma terminu. Zaplanowana
płatność ma termin orientacyjny i zostaje w limicie budżetu, ale nie w kwocie
do zapłaty. Potwierdzona płatność jest zobowiązaniem, dopóki nie powiążemy
transakcji. Anulowane zostaje w historii i wypada z sum. Rezerwacja jest osobnym
stanem na później. DB używa numeric; obliczenia sumują grosze. Pozycja bez
terminu jest budżetem, nie przepływem przypisanym po cichu do konkretnego miesiąca.
Prognoza, gdy powstanie, odejmuje pozostałą kwotę potwierdzonych pozycji, nie
każdej pozycji z datą.

Istniejące `plan_transaction_links` otrzymują opcjonalne `plan_item_id`.
Pozostało do zapłaty to `max(0, kwota pozycji - opłacone transakcje)`. Nadpłata
zostaje widoczna osobno. Jedna transakcja rozlicza jedną pozycję. Odpięcie
przywraca kwotę. Wspólny plan może przyjąć prywatną wpłatę wołającego, bez
pokazywania opisu tej transakcji pozostałym członkom Domu.
Backend sprawdza zgodność pozycji z planem, zakres prywatności, uprawnienia,
walutę i status faktu. Pozycję może rozliczać kilka rzeczywistych płatności,
np. zaliczka i dopłata. Jedna transakcja nadal należy w całości do jednego
planu i najwyżej jednej pozycji. Podział kwoty pozostaje poza tym milestone.
Link można cofnąć; nie zmienia kategorii ani zakresu transakcji.

Daty zapłaty mogą wyprzedzać daty projektu: lot kupiony w lutym należy do
wakacji w maju. Zmiana walidacji okresu dotyczy nowego `spend`, bez osłabiania
zasad `save` i `debt`.

Plan auta 1 400 zł i fakt 1 372,18 zł pokazują +27,82 zł względem planu.
Różnica nie jest przychodem. Plan osobno pokazuje budżet, wydano, pozostałe
zakontraktowane płatności i niezaplanowane środki, także przekroczenie budżetu.

## Przyszłe przepływy

Wspólny model odczytu scala istniejące cykliczne i jednorazowe zobowiązania,
pozycje planu z terminem i jawnie oznaczone szacunki. Nie jest nową tabelą
fikcyjnych transakcji. Każdy przepływ ma stabilne ID źródła, termin DATE,
kwotę/kierunek, zakres, pewność i źródło dostępne w szczegółach.

1. Dostępne teraz wynika z salda początkowego i zaksięgowanych faktów.
2. Prognoza salda dodaje przyszłe wpływy i odejmuje nierozliczone płatności,
   w tym pozostałą kwotę pozycji planu z terminem.
3. Planowane odkładanie obniża prognozę wolnych środków, a nie saldo księgi.

Przykład: 14 250 + 8 200 − 5 430 − 2 100 = 14 920 zł prognozowanego salda.
Po alokacji 1 500 zł pozostaje 13 420 zł wolnych środków. Liczby mają osobne
etykiety i dostępne składniki obliczenia.

Zaksięgowana płatność usuwa odpowiadającą jej część przyszłego przepływu.
Ręczne oznaczenie opłacenia i późniejszy import korzystają z trwałego
uzgodnienia istniejącego faktu. Nie liczymy dwa razy tej samej wpłaty i jej
alokacji. Pozycja powiązana z cyklicznym zobowiązaniem ma jedno ID przepływu,
nie dwa koszty z różnych źródeł. Cofnięcie linku, zmiana terminu lub anulowanie
odświeża wszystkie zależne widoki.

## Alokacje oszczędności

Planowane miesięczne odkładanie ma oddzielne rekordy kwoty i okresu.
Nie tworzy sztucznej transakcji i nie jest dowodem wykonania przelewu.
Historyczne wpłaty i korekty zachowują znaczenie; przejście na alokacje wymaga
jawnego wyboru, nie masowego przeliczenia danych. Brak terminu nie generuje
fikcyjnego wymaganego tempa. Kwota zgromadzona, planowane tempo i rzeczywiste
wykonanie pozostają rozróżnione.

## Import, prywatność i UI

Matching używa kwoty/kierunku, daty, odbiorcy, opisu, konta i zakresu.
Niska pewność tylko proponuje: „To wygląda jak Wynajem auta z planu Teneryfa.
Połącz / Nie”. Import pozostaje prywatny; połączenie nie udostępnia danych
grupie. Udostępnienie jest osobną świadomą operacją kontrolowaną w backendzie.
Retry i ponowny import nie dodają linku ani kwoty drugi raz.

Pierwszy etap łączy istniejące fakty po imporcie. Późniejsze sugestie w review
korzystają z tego samego RPC, bez drugiego mechanizmu rozliczenia.

Lista Planów rozróżnia cele, budżety projektów i kredyty. Karta wakacji pokazuje
wydano/budżet i następny wydatek, poduszka — zgromadzono/cel i planowane tempo.
Spójne SVG pozostają głównym systemem ikon. Szczegóły projektu zawierają
Przegląd, Wydatki, Transakcje i Plan finansowania wewnątrz jednego widoku.

## Kolejność wdrożenia i akceptacja

1. Model `spend`, pozycje i rozliczenia z RLS, jawnymi GRANT i zgodnym eksportem.
2. Karty/szczegóły i ręczne linkowanie istniejących faktów.
3. Sugestie importu oparte na tych samych trwałych rozliczeniach, bez oczekiwania
   na pełną prognozę. Łączą plany z codziennym importem; użytkownik zatwierdza link.
4. Wspólny odczyt przyszłych przepływów i składniki prognozy.
5. Alokacje celów oraz prognoza wolnych środków.

Wymagane regresje: kwota faktyczna różna od planowanej, zaliczka/dopłata,
cofnięcie linku, anulowanie, zapłata przed projektem, brak terminu, retry,
reimport, jeden przepływ zamiast dwóch, alokacja bez fikcyjnego kosztu,
zgodność starych save/debt i prywatność grup. E2E: Teneryfa → auto → import →
potwierdzenie linku → aktualizacja budżetu i prognozy. Sam projekt nie jest
deklaracją wdrożenia nowego modelu.
