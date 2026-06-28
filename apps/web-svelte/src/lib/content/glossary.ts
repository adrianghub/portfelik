import * as m from "$lib/paraglide/messages";

export interface GlossaryEntry {
  id: string;
  term: string;
  short: string;
  long?: string;
  seeAlso?: string[];
  surfaces?: string[];
}

export interface GlossaryMeta {
  id: string;
  seeAlso?: string[];
  surfaces?: string[];
}

export const GLOSSARY_META: GlossaryMeta[] = [
  { id: "import", seeAlso: ["inne", "regula"], surfaces: ["import", "dashboard"] },
  { id: "transakcje", seeAlso: ["saldo", "cykliczne"], surfaces: ["transactions"] },
  { id: "plany", seeAlso: ["rozliczenie", "majatek_netto"], surfaces: ["plans"] },
  { id: "rozliczenie", seeAlso: ["plany", "transakcje"] },
  { id: "saldo", seeAlso: ["saldo_prognoza", "majatek_netto"], surfaces: ["transactions"] },
  { id: "saldo_prognoza", seeAlso: ["saldo", "prognoza"] },
  { id: "prognoza", seeAlso: ["cykliczne", "saldo_prognoza"], surfaces: ["dashboard"] },
  { id: "majatek_netto", seeAlso: ["nadwyzka", "saldo"], surfaces: ["plans", "dashboard"] },
  { id: "nadwyzka", seeAlso: ["majatek_netto", "plany"], surfaces: ["plans"] },
  { id: "cykliczne", seeAlso: ["prognoza", "transakcje"] },
  { id: "inne", seeAlso: ["import", "regula"] },
  { id: "regula", seeAlso: ["import", "inne"] },
  { id: "refinansowanie", seeAlso: ["plany", "raty"] },
  { id: "grupa", seeAlso: ["wspolwlasciciel", "plany"] },
  { id: "wspolwlasciciel", seeAlso: ["grupa", "plany"] },
  { id: "odsetki", seeAlso: ["raty", "plany"] },
  { id: "raty", seeAlso: ["odsetki", "plany"] },
];

type GlossaryMessageFns = {
  term: () => string;
  short: () => string;
  long?: () => string;
};

const GLOSSARY_MESSAGES: Record<string, GlossaryMessageFns> = {
  import: {
    term: m.glossary_term_import,
    short: m.glossary_short_import,
    long: m.glossary_long_import,
  },
  transakcje: { term: m.glossary_term_transakcje, short: m.glossary_short_transakcje },
  plany: {
    term: m.glossary_term_plany,
    short: m.glossary_short_plany,
    long: m.glossary_long_plany,
  },
  rozliczenie: {
    term: m.glossary_term_rozliczenie,
    short: m.glossary_short_rozliczenie,
    long: m.glossary_long_rozliczenie,
  },
  saldo: { term: m.glossary_term_saldo, short: m.glossary_short_saldo },
  saldo_prognoza: {
    term: m.glossary_term_saldo_prognoza,
    short: m.glossary_short_saldo_prognoza,
  },
  prognoza: {
    term: m.glossary_term_prognoza,
    short: m.glossary_short_prognoza,
    long: m.glossary_long_prognoza,
  },
  majatek_netto: {
    term: m.glossary_term_majatek_netto,
    short: m.glossary_short_majatek_netto,
    long: m.glossary_long_majatek_netto,
  },
  nadwyzka: {
    term: m.glossary_term_nadwyzka,
    short: m.glossary_short_nadwyzka,
    long: m.glossary_long_nadwyzka,
  },
  cykliczne: {
    term: m.glossary_term_cykliczne,
    short: m.glossary_short_cykliczne,
    long: m.glossary_long_cykliczne,
  },
  inne: { term: m.glossary_term_inne, short: m.glossary_short_inne },
  regula: { term: m.glossary_term_regula, short: m.glossary_short_regula },
  refinansowanie: {
    term: m.glossary_term_refinansowanie,
    short: m.glossary_short_refinansowanie,
  },
  grupa: { term: m.glossary_term_grupa, short: m.glossary_short_grupa },
  wspolwlasciciel: {
    term: m.glossary_term_wspolwlasciciel,
    short: m.glossary_short_wspolwlasciciel,
  },
  odsetki: { term: m.glossary_term_odsetki, short: m.glossary_short_odsetki },
  raty: { term: m.glossary_term_raty, short: m.glossary_short_raty },
};

export function buildGlossaryEntries(): GlossaryEntry[] {
  return GLOSSARY_META.map((meta) => {
    const msgs = GLOSSARY_MESSAGES[meta.id];
    return {
      id: meta.id,
      term: msgs.term(),
      short: msgs.short(),
      long: msgs.long?.(),
      seeAlso: meta.seeAlso,
      surfaces: meta.surfaces,
    };
  });
}

export function searchGlossary(query: string, entries = buildGlossaryEntries()): GlossaryEntry[] {
  const q = query.trim().toLowerCase();
  if (q === "") return entries;
  return entries.filter(
    (e) =>
      e.term.toLowerCase().includes(q) ||
      e.short.toLowerCase().includes(q) ||
      (e.long?.toLowerCase().includes(q) ?? false)
  );
}

export function glossaryEntryById(
  id: string,
  entries = buildGlossaryEntries()
): GlossaryEntry | undefined {
  return entries.find((e) => e.id === id);
}

export function glossaryTermLabel(
  id: string,
  entries = buildGlossaryEntries()
): string | undefined {
  return glossaryEntryById(id, entries)?.term;
}
