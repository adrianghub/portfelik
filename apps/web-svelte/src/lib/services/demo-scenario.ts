export type DemoCategoryKey =
  | "salary"
  | "freelance"
  | "groceries"
  | "transport"
  | "dining"
  | "housing"
  | "health"
  | "sport"
  | "subs"
  | "fun"
  | "travel"
  | "insurance"
  | "electronics"
  | "goals";

export interface DemoTransactionSeed {
  date: string;
  amount: number;
  type: "expense" | "income";
  category: DemoCategoryKey;
  label: string;
  status?: "paid" | "upcoming";
  recurring?: boolean;
}

function localIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function inMonth(anchor: Date, monthOffset: number, day: number): string {
  const date = new Date(anchor.getFullYear(), anchor.getMonth() + monthOffset, day);
  return localIso(date);
}

function daysFrom(anchor: Date, days: number): string {
  const date = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + days);
  return localIso(date);
}

/**
 * A calendar-shaped household story for the showcase. Each historical month is
 * complete, while paid rows in the current month never land in the future.
 */
export function buildDemoTransactionSeeds(now: Date = new Date()): DemoTransactionSeed[] {
  const rows: DemoTransactionSeed[] = [];

  for (const [index, monthOffset] of [-3, -2, -1].entries()) {
    rows.push(
      {
        date: inMonth(now, monthOffset, 1),
        amount: 7200 + index * 120,
        type: "income",
        category: "salary",
        label: "Wynagrodzenie",
      },
      {
        date: inMonth(now, monthOffset, 2),
        amount: 2450,
        type: "expense",
        category: "housing",
        label: "Czynsz",
      },
      {
        date: inMonth(now, monthOffset, 7),
        amount: 430 + index * 25,
        type: "expense",
        category: "groceries",
        label: "Zakupy spożywcze",
      },
      {
        date: inMonth(now, monthOffset, 12),
        amount: 110 + index * 14,
        type: "expense",
        category: "dining",
        label: "Wieczór na mieście",
      },
      {
        date: inMonth(now, monthOffset, 18),
        amount: 260 - index * 8,
        type: "expense",
        category: "housing",
        label: "Prąd i internet",
      },
      {
        date: inMonth(now, monthOffset, 24),
        amount: 220 + index * 20,
        type: "expense",
        category: "fun",
        label: "Weekend dla siebie",
      }
    );
  }

  const paidDay = (preferred: number) => Math.min(now.getDate(), preferred);
  rows.push(
    {
      date: inMonth(now, 0, 1),
      amount: 7480,
      type: "income",
      category: "salary",
      label: "Wynagrodzenie",
    },
    {
      date: inMonth(now, 0, paidDay(2)),
      amount: 2450,
      type: "expense",
      category: "housing",
      label: "Czynsz",
    },
    {
      date: inMonth(now, 0, paidDay(3)),
      amount: 390,
      type: "expense",
      category: "groceries",
      label: "Zakupy na tydzień",
    },
    {
      date: inMonth(now, 0, paidDay(4)),
      amount: 650,
      type: "expense",
      category: "goals",
      label: "Odkładam na Portugalię",
    },
    {
      date: inMonth(now, 0, paidDay(5)),
      amount: 350,
      type: "expense",
      category: "goals",
      label: "Odkładam na kanapę",
    },
    {
      date: inMonth(now, 0, paidDay(6)),
      amount: 48,
      type: "expense",
      category: "subs",
      label: "Muzyka",
      recurring: true,
    },
    {
      date: daysFrom(now, 5),
      amount: 180,
      type: "expense",
      category: "sport",
      label: "Karnet na wspinaczkę",
      status: "upcoming",
    },
    {
      date: inMonth(now, 1, 2),
      amount: 2450,
      type: "expense",
      category: "housing",
      label: "Czynsz",
      status: "upcoming",
    }
  );

  return rows;
}
