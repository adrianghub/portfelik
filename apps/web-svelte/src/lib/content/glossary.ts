export interface GlossaryEntry {
  id: string;
  term: string;
  short: string;
  long?: string;
  seeAlso?: string[];
}

export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  {
    id: "nadwyzka",
    term: "Nadwyżka",
    short:
      "Bilans miesiąca po odjęciu wydatków od przychodów — wolne środki po zobowiązaniach kredytowych.",
    long: "Nadwyżka planistyczna na /plans pokazuje, ile zostaje po obowiązkowych ratach. Cele oszczędnościowe nie obniżają tej liczby — odkładanie na cel to postęp, nie kara.",
    seeAlso: ["cele", "majatek_netto"],
  },
  {
    id: "majatek_netto",
    term: "Majątek netto",
    short: "Aktywa (gotówka, inwestycje, nieruchomości) minus salda kredytów.",
    seeAlso: ["saldo", "cele"],
  },
  {
    id: "cele",
    term: "Cele oszczędnościowe",
    short:
      "Plany typu „cel” na /plans — wyrażają intencję, a postęp budujesz przez połączenie wpływów z planem.",
    long: "Kategoria „Cele” służy do wydatków, które bezpośrednio przybliżają cel (np. sprzęt na wyjazd). Wpłaty na cel kategoryzuj jako „Wpłata na cel” lub połącz wpływ w rozliczeniu planu.",
    seeAlso: ["nadwyzka", "rozliczenie"],
  },
  {
    id: "rozliczenie",
    term: "Rozliczenie planu",
    short: "Powiązanie istniejącej transakcji z planem — bez tworzenia nowej „prawdy” finansowej.",
    seeAlso: ["cele", "import"],
  },
  {
    id: "saldo",
    term: "Saldo bieżące",
    short: "Wyliczone z transakcji od daty kotwicy gotówki — tylko w widoku prywatnym.",
    seeAlso: ["majatek_netto"],
  },
  {
    id: "import",
    term: "Import bankowy",
    short:
      "Preferowane źródło historii — czyste wiersze trafiają od razu, wyjątki przechodzą przez krótki przegląd.",
    seeAlso: ["inne", "regula"],
  },
  {
    id: "inne",
    term: "Inne wydatki / przychody",
    short: "Bezpieczny fallback, gdy import nie zna kategorii — potwierdzasz przed zapisem.",
    seeAlso: ["import", "regula"],
  },
  {
    id: "regula",
    term: "Reguła kategoryzacji",
    short:
      "Zapamiętany wzorzec (np. nazwa sklepu) — kolejne importy przypisują kategorię automatycznie.",
    seeAlso: ["import"],
  },
  {
    id: "cykliczne",
    term: "Transakcje cykliczne",
    short:
      "Szablony powtarzalnych wpływów i wydatków — najbliższe terminy są realnymi wierszami do edycji.",
    seeAlso: ["saldo"],
  },
];

export function searchGlossary(query: string): GlossaryEntry[] {
  const q = query.trim().toLowerCase();
  if (q === "") return GLOSSARY_ENTRIES;
  return GLOSSARY_ENTRIES.filter(
    (e) =>
      e.term.toLowerCase().includes(q) ||
      e.short.toLowerCase().includes(q) ||
      (e.long?.toLowerCase().includes(q) ?? false)
  );
}

export function glossaryEntryById(id: string): GlossaryEntry | undefined {
  return GLOSSARY_ENTRIES.find((e) => e.id === id);
}
