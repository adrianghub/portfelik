# Pierwsze uruchomienie i demo

Zatwierdzony przepływ. Ośmiokrokowy przewodnik w `ONBOARDING_SCENES` zostaje,
dopóki Kokpit i Transakcje nie mają elementów, które ten przepływ wskazuje.
Nowy przewodnik nie korzysta z pierścienia „Bilans okresu” ani z dużego panelu
salda na Transakcjach.

## Co zostaje

- Oznaczenie `is_demo` na transakcjach, planach i pozycjach majątku.
- `clear_demo_data` usuwa wiersze demo właściciela oraz nieoznaczone wystąpienia
  szablonów demo. Własne transakcje, plany i kotwica gotówki zostają.
- Potwierdzenie przed usunięciem przykładu.
- Pamięć pominięcia i ukończenia w ustawieniach profilu. Pomiń nie włącza
  przewodnika ponownie. Ponowne uruchomienie jest jawną akcją.
- Generowanie przykładu czyści poprzednie wiersze demo i wstawia je od nowa.

## Czego nowy przepływ nie przejmuje

Obecne osiem scen opisuje ekrany i prowadzi przez cele, które znikną: pierścień
bilansu, akcje Kokpitu, import na liście transakcji i ustawienia finansów.
Komunikat demo ma dziś cztery przyciski, w tym import na każdym ekranie.

## Ekran pierwszego uruchomienia

Jeden ekran, zanim użytkownik ma własne albo przykładowe dane.

Nagłówek: „Zobacz, na co możesz sobie pozwolić.”

Opis: „JakStoimy łączy codzienne wydatki z planami na przyszłość. Prywatne
finanse pozostają prywatne, a wspólne możecie prowadzić razem.”

Akcje: „Wypróbuj demo” i „Dodaj swoje dane”.

Pod spodem trzy krótkie dopowiedzenia: przykładowe dane bez zobowiązań, import
albo pierwsza transakcja, Kokpit jako miejsce codziennego powrotu.

Zamknięcie ekranu bez wyboru zapisuje pominięcie. „Dodaj swoje dane” prowadzi
do Transakcji, gdzie są import i ręczne dodanie. Nie zakładamy gospodarstwa,
importu ani planu, zanim ktoś obejrzy aplikację.

Ekran nie wraca sam, gdy użytkownik ma już własne dane, działa demo, pominął
wprowadzenie albo je ukończył.

## Trzy zadania

1. Kokpit. „Ile zostanie na koniec miesiąca?” „Zmień miesiąc i sprawdź, jak
   zmienia się prognoza.” Wskazanie: filtr miesiąca, Stan salda, Wydatki,
   Prognoza.
2. Transakcje. „Co masz jeszcze do opłacenia?” „Otwórz nadchodzącą płatność.
   Możesz sprawdzić jej szczegóły i sposób rozliczenia.” Wskazanie: przykładowa
   nadchodząca płatność. Otwarcie nie oznacza jej jako opłaconej.
3. Plany. „Ile jeszcze potrzebujesz na wyjazd?” „Otwórz plan i zobacz, co jest
   już opłacone, a co dopiero przed Tobą.” Wskazanie: plan wydatków z pozycjami.

Każde zadanie ma „Pomiń”. Dwa pierwsze kończą się „Dalej”, ostatnie „Zakończ”.
Przejście na kolejny ekran dzieje się po tej akcji. Brak elementu na ekranie
zostawia komunikat i gasi podświetlenie. Nie podstawiamy starego celu.

Na szerokości poniżej 768 px wskazówka jest dolnym panelem. Od 768 px stoi obok
wskazanego elementu. Postęp zapisujemy jako „2 z 3”.

## Komunikat demo

Po wejściu w przykład zostaje krótki status: „Tryb demonstracyjny”. „Pracujesz
na przykładowych danych.”

Menu: „Usuń dane przykładowe”, „Uruchom przewodnik ponownie”, „Ustawienia demo”.
Import nie jest w tym menu. Ustawienia demo to istniejący panel w Ustawieniach,
nie nowy ekran.

## Dane przykładu

Trzy zadania potrzebują:

- dodatniego salda początkowego, które da się usunąć razem z przykładem,
- wpływów i wydatków z więcej niż jednego miesiąca,
- nadchodzącej płatności,
- planu wydatków z co najmniej dwiema pozycjami, wpłatą i kwotą pozostałą do
  zapłaty.

Obecne dane mają wpływy, wydatki i nadchodzące płatności, w tym karnet za pięć
dni. Mają cele oszczędnościowe i kredyt, nie plan wydatków. Nie mają kotwicy
gotówki, więc Stan salda i Prognoza nie mają z czego powstać.

`cash_positions` trzyma jeden prywatny wiersz i nie ma znacznika demo.
`clear_demo_data` tego wiersza nie rusza. Dopóki czyszczenie nie umie zdjąć
wyłącznie kotwicy przykładu, seed jej nie zapisuje. Własna kotwica nigdy nie
jest wymieniana na przykładową.

Kontrakt jest w `apps/web-svelte/src/lib/demo/first-run.ts`. Podłączenie do
ekranów czeka na filtr miesiąca Kokpitu i uproszczoną listę Transakcji.
