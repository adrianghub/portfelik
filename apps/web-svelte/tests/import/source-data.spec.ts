import { describe, expect, it } from "vitest";
import { mbankAdapter } from "$lib/import/banks/mbank";
import { ingAdapter } from "$lib/import/banks/ing";
import { pkoBpAdapter } from "$lib/import/banks/pko_bp";
import { millenniumAdapter } from "$lib/import/banks/millennium";
import { ersteAdapter } from "$lib/import/banks/erste";
import { parseCsv } from "$lib/import/csv/parse";
import { normalize } from "$lib/import/normalize";

const account = "PL11 1010 0000 0000 0000 0000 0001";
const cases = [
  {
    adapter: mbankAdapter,
    header:
      "#Data księgowania;#Data operacji;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota",
    row: `2026-09-02;2026-09-01;PŁATNOŚĆ KARTĄ;Zakupy;LIDL  POLSKA;${account};-123,45`,
  },
  {
    adapter: ingAdapter,
    header:
      "Data transakcji;Dane kontrahenta;Tytuł;Nr transakcji;Kwota transakcji (waluta rachunku);Waluta;Numer rachunku",
    row: `2026-09-01;LIDL  POLSKA;PŁATNOŚĆ KARTĄ;EXT-1;-123,45;pln;${account}`,
  },
  {
    adapter: pkoBpAdapter,
    header: "Data operacji;Opis operacji;Odbiorca;Kwota operacji;Waluta operacji;Numer rachunku",
    row: `01.09.2026;PŁATNOŚĆ KARTĄ;LIDL  POLSKA;-123,45;pln;${account}`,
  },
  {
    adapter: millenniumAdapter,
    header: "Data transakcji;Opis transakcji;Kontrahent;Obciążenia;Uznania;Waluta;Numer rachunku",
    row: `01-09-2026;PŁATNOŚĆ KARTĄ;LIDL  POLSKA;-123,45;;pln;${account}`,
  },
];

describe("bank source snapshots", () => {
  it.each(cases)(
    "$adapter.kind preserves original headers and cells through normalization",
    async ({ adapter, header, row }) => {
      const csv = `${header}\n${row}`;
      const decoded = parseCsv(csv).rows;
      const parsed = adapter.parse(csv);
      expect(parsed.errors).toEqual([]);
      expect(parsed.rows).toHaveLength(1);
      const expected = decoded[0].map((label, index) => ({ label, value: decoded[1][index] }));
      expect(parsed.rows[0].source_data?.columns).toEqual(expected);
      expect(parsed.rows[0].counterparty).toBe("LIDL POLSKA");
      expect(parsed.rows[0].source_data?.columns.some((cell) => cell.value === account)).toBe(true);
      const normalized = await normalize(parsed, new ArrayBuffer(8));
      expect(normalized.rows[0].source_data?.columns).toEqual(expected);
    }
  );

  it("Erste preserves both dates, original payee spacing and the account", async () => {
    const csv = `01-09-2026,02-09-2026,PŁATNOŚĆ KARTĄ,LIDL  POLSKA,${account},"-123,45","0,00",1,`;
    const parsed = ersteAdapter.parse(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].source_data?.columns).toEqual([
      { label: "Data transakcji", value: "01-09-2026" },
      { label: "Data księgowania", value: "02-09-2026" },
      { label: "Tytuł", value: "PŁATNOŚĆ KARTĄ" },
      { label: "Kontrahent", value: "LIDL  POLSKA" },
      { label: "Nr rachunku kontrahenta", value: account },
      { label: "Kwota", value: "-123,45" },
      { label: "Blokada/saldo", value: "0,00" },
      { label: "Lp", value: "1" },
      { label: "Kolumna 9", value: "" },
    ]);
    const normalized = await normalize(parsed, new ArrayBuffer(8));
    expect(normalized.rows[0].counterparty).toBe("LIDL POLSKA");
    expect(normalized.rows[0].source_data).toEqual(parsed.rows[0].source_data);
  });
});
