# Przyszłość finansowa — następny milestone

Status: kierunek zatwierdzony, **jeszcze nie wdrożony**. Najbliższa praca po
domknięciu importu. Rozszerzamy istniejące Plany. Nie dodajemy osobnego modułu
Wakacje ani integracji bankowej.

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
transakcji. Anulowane zostaje w historii i wypada z sum. Anulowanie po
częściowej wpłacie zdejmuje całą pozycję z limitu. Transakcja zostaje w księdze,
wpłatę widać przy anulowanej pozycji i można ją odpiąć. Anulowanej pozycji nie
da się rozliczyć ponownie. Rezerwacja jest osobnym
stanem na później. DB używa numeric; obliczenia sumują grosze. Pozycja bez
terminu jest budżetem, nie przepływem przypisanym po cichu do konkretnego miesiąca.
Prognoza salda prywatnego korzysta z istniejącego silnika kasowego. Odejmuje
pozostałą kwotę potwierdzonych pozycji prywatnego planu, których nie ma już
w nadchodzących transakcjach. Wpłacona zaliczka zostaje w saldzie i nie jest
odejmowana drugi raz. Pozycja zaplanowana, szacunek i anulowana nie wchodzą
do prognozy. Pozostałość wspólnego planu nie wchodzi do salda prywatnego.

Budżet planu nie jest saldem konta. 12 000 zł na wakacjach oznacza planowany
limit wydatków, nie odłożone środki. Zapłacone liczą się tylko z powiązanych
transakcji. Sam plan nie obniża aktualnego salda.

Istniejące `plan_transaction_links` otrzymują opcjonalne `plan_item_id`.
Pozostało do zapłaty to `max(0, kwota pozycji - opłacone transakcje)`. Nadpłata
zostaje widoczna osobno. Suma kosztów w planie liczy pełne kwoty pozycji, nie
pozostałości, więc wpłacona zaliczka nie oddaje tej kwoty do wolnego budżetu.
Jedna transakcja rozlicza jedną pozycję. Równoczesne przypisanie tej samej
transakcji do dwóch planów zostawia jeden link. Odpięcie
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

## Kokpit

Kokpit odpowiada na trzy pytania: ile mam, ile wydam, ile mi zostanie.
Nie przenosi formularza planu na ten ekran. Na górze są trzy liczniki miesiąca.
Pod nimi są kategorie i wykres wybranego okresu. Kategorie mają krótką etykietę
tego zakresu, na przykład nazwę miesiąca albo „Ostatnie 7 dni”. Wykres ma osobną
etykietę serii, na przykład „Ostatnie miesiące”. To nie są liczniki miesiąca.
Na desktopie kategorie i wykres stoją obok siebie, na mobile jeden pod drugim.
Plany, nadchodzące transakcje oraz tydzień, rok i własny zakres zostają za
„Zobacz więcej”.

Trzy liczniki liczą jeden zakres: prywatny albo jeden Dom. Saldo to kotwica
tego zakresu plus opłacone ruchy od jej daty. Brak kotwicy to brak liczby, nie
zero. Płatności z 30 dni to nierozliczone potwierdzone zobowiązania z tego
okna. Zaległe zostają obok, a płatności orientacyjne osobno. Prognoza za 30
dni jest wynikiem istniejącego silnika: przyszłe wpływy, przyszłe wydatki i
reszta potwierdzonych pozycji, której transakcja nie jest już w przepływach.
Nie jest różnicą salda i płatności. Nie ma zapisanej poduszki, więc półokrąg jest tylko obudową licznika.
Nie wypełniamy go procentem.

Filtr miesiąca jest osobnym oknem tego samego silnika, nie drugim liczeniem.
Ustawia trzy liczniki: Stan salda, Wydatki, Prognoza. Tydzień, rok i własny
zakres tego nie zmieniają. Nie ma pierścienia bilansu ani drugiego wyliczenia
na dziś i 90 dni obok tych liczników. Kategorie i wykres pokazują swój zakres
krótką etykietą, żeby nie wyglądały jak te same wydatki co licznik miesiąca.

Bieżący miesiąc: Stan salda to saldo na dziś. Wydatki to opłacone wydatki od
początku miesiąca do dziś, plus nierozliczone potwierdzone zobowiązania do
końca miesiąca, plus nadchodzące wydatki bez planu. Prognoza to szacunek na
ostatni dzień miesiąca. Miniony miesiąc: Stan salda to saldo na początek tego
miesiąca. Prognoza to saldo wyliczone na koniec miesiąca z kotwicy i opłaconej
historii. To dwie różne daty. Wydatki to opłacone wydatki całego miesiąca.
Przyszły miesiąc: Stan salda to szacunek na dzień przed początkiem miesiąca.
Prognoza to szacunek na ostatni dzień. Wydatki to przewidywane wydatki tego
miesiąca.

Zakres Wszystkie nie pokazuje wspólnego salda ani wspólnej prognozy. Nie
sumujemy niezależnych pul gotówki i nie podstawiamy prywatnej kotwicy pod Dom.
Brak kotwicy zakresu zostawia Stan salda i Prognozę puste. Prywatne Wydatki
nadal liczą znane ruchy. Wydatki Domu i Wszystkie zostają puste, dopóki nie
obejmują potwierdzonych reszt planów i niematerializowanych transakcji
cyklicznych. Nie pokazujemy wtedy zera. Krótkie objaśnienie jest pod znakiem
zapytania.

Nie ma kwoty na datę sprzed kotwicy. Nie ma prognozy, której data końcowa
wypada po dziś plus 90 dni. Miesiąc, który zaczyna się w tym horyzoncie, a
kończy po nim, może mieć Stan salda i nie ma Prognozy. Nie pokazujemy części
miesiąca jako pełnej prognozy. Wydatki też pokazujemy tylko wtedy, gdy pobrane
transakcje obejmują cały miesiąc. Inaczej ten licznik zostaje pusty. Gdy
prywatna kotwica wypada w środku wybranego miesiąca, Wydatki liczą się od tego
dnia i mają oznaczenie początku zakresu.

Zaległe z poprzednich miesięcy zostają poza Wydatkami tego miesiąca i nadal są
wyjątkiem. Zaległe z datą w tym miesiącu wchodzą do Wydatków. Płatność
orientacyjna zostaje obok Wydatków, nie w nich. Szacowane i anulowane nie
wchodzą. Potwierdzona reszta liczy się raz: opłacona zaliczka jest już wydatkiem
i zmniejsza resztę. Alokacje celów zostają w saldzie i poza Wydatkami. Liczymy
tylko PLN.

Funkcja liczników z 30 dni zostaje w silniku i nie jest drugim panelem na
Kokpicie. Tydzień, rok i własny zakres nie zmieniają trzech liczb miesiąca.

Planowana kwota nie jest wydatkiem historii. Wydatkiem jest powiązana
transakcja i liczy się raz. W planie ta sama wpłata zmniejsza pozostałą kwotę.

## Plany 2.0

Szczegóły planu zostają miejscem budżetu, pozycji, statusów i rozliczeń.
Obliczeń nie zmieniamy. Zmienia się prezentacja.

Największa liczba to pozostało w budżecie. Obok widać kwotę uwzględnioną
w planie i budżet. Wydano i do zapłaty są mniejsze. Pasek pokazuje wykorzystanie
budżetu, nie postęp opłacania.

Formularz dodawania otwiera się na żądanie i nie spycha listy. Nazwa i kwota
są obowiązkowe. Termin jest opcjonalny. Status to wybór szacunkowy albo
potwierdzony, z krótkim objaśnieniem pod znakiem zapytania. Odbiorca jest
w dodatkowych szczegółach. Na telefonie jest dolny panel, na desktopie modal
albo panel boczny. Powiązanie transakcji zostaje akcją pozycji, nie polem
formularza tworzenia.

Lista nie używa jednej karty dla wszystkiego. Cel pokazuje postęp odkładania.
Kredyt pokazuje pozostałe zadłużenie. Plan wydatków pokazuje wykorzystanie
budżetu. Regularne zakupy nie są celem oszczędnościowym. W danych przykładowych
„Tygodniowe zakupy” trzeba będzie zastąpić limitem albo wydatkiem cyklicznym,
razem z nowym demo, nie wcześniej.

## Import, prywatność i UI

Matching używa kwoty/kierunku, daty, odbiorcy, opisu, konta i zakresu.
Niska pewność tylko proponuje: „To wygląda jak Wynajem auta z planu Teneryfa.
Połącz / Nie”. Import pozostaje prywatny; połączenie nie udostępnia danych
grupie. Udostępnienie jest osobną świadomą operacją kontrolowaną w backendzie.
Retry i ponowny import nie dodają linku ani kwoty drugi raz.

Pierwszy etap łączy istniejące fakty po imporcie. Późniejsze sugestie w review
korzystają z tego samego RPC, bez drugiego mechanizmu rozliczenia.

Lista Planów rozróżnia cele, budżety projektów i kredyty. Karta wakacji pokazuje
wydano i budżet oraz następny wydatek. Poduszka pokazuje zgromadzono, cel
i planowane tempo. Spójne SVG pozostają głównym systemem ikon. Szczegóły projektu
zawierają Przegląd, Wydatki, Transakcje i Plan finansowania wewnątrz jednego widoku.

## Kolejność ekranów

Najbliższa praca porządkuje prezentację, nie silnik.

1. Kokpit 2.0. Trzy liczniki miesiąca zamiast pierścienia. Kategorie i wykres
   pod nimi. Bez drugiego panelu na dziś i 90 dni. Domyślny okres kategorii
   zostaje niezależny od miesiąca liczników. Etykiety rozróżniają te zakresy.
   Zsynchronizowanie domyślnego okresu to osobna decyzja, poza tym ekranem.
2. Transakcje. Lista jest centrum. Duży panel salda i prognozy schodzi z tego
   ekranu. Gdy kotwicy nie ma, podpowiedź salda początkowego zostaje widoczna.
   Gdy saldo jest ustawione, zmiana jest w menu akcji. Nadchodzące płatności są
   filtrem statusu. Opłacone i oczekujące wiersze stoją w osobnych pasmach przy
   domyślnym porządku daty. Pasmo Nadchodzące można zwinąć, żeby została historia.
   Inne sortowanie i wyszukiwanie pokazują jedną listę.
   Zakres własności (prywatne, wszystkie albo konkretna grupa) stoi obok filtrów
   transakcji.
3. Plany 2.0. Lista, szczegóły, formularz i język.
4. Nowy onboarding. Dopiero gdy Kokpit, Transakcje i Plany są ekranami, przez
   które da się przejść bez instrukcji silnika.
5. Propozycje łączenia transakcji z pozycjami planu po imporcie. Użytkownik
   zatwierdza dopasowanie.
6. Scenariusze na przyszłość, w tym większy zakup i wolne środki za kilka miesięcy.
   Po dopracowaniu podstawowych obliczeń i interfejsu.

Na razie bez płatnych subskrypcji, rozbudowanej personalizacji, awatarów,
integracji bankowych i kolejnych dashboardów.

## Kolejność wdrożenia i akceptacja

1. Model `spend`, pozycje i rozliczenia z RLS, jawnymi GRANT i zgodnym eksportem.
2. Karty/szczegóły i ręczne linkowanie istniejących faktów.
3. Sugestie importu oparte na tych samych trwałych rozliczeniach, bez oczekiwania
   na pełną prognozę. Łączą plany z codziennym importem; użytkownik zatwierdza link.
4. Wspólny odczyt przyszłych przepływów i składniki prognozy.
5. Alokacje celów oraz prognoza wolnych środków.

Pierwszy scenariusz akceptacyjny: użytkownik tworzy wakacje, dodaje apartament
i zaliczkę, importuje wyciąg, łączy faktyczną płatność z pozycją i widzi, ile
zostało do zapłaty. Kolejny krok pokazuje te pozostałe płatności w prognozie
salda. Plan ma własny zakres prywatności. Wspólny wyjazd może łączyć wydatki
opłacone z prywatnych kont, bez ujawniania całej historii tych kont.

Wymagane regresje: kwota faktyczna różna od planowanej, zaliczka/dopłata,
cofnięcie linku, anulowanie, zapłata przed projektem, brak terminu, retry,
reimport, jeden przepływ zamiast dwóch, alokacja bez fikcyjnego kosztu,
zgodność starych save/debt i prywatność grup. E2E: Teneryfa → auto → import →
potwierdzenie linku → aktualizacja budżetu i prognozy. Sam projekt nie jest
deklaracją wdrożenia nowego modelu.
