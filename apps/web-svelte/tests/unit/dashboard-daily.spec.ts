import { afterEach, describe, expect, it, vi } from "vitest";
import { dailyGreeting, dailyQuote } from "$lib/dashboard-daily";

const greetings = [
  "Cześć",
  "Hej",
  "Witaj",
  "Yo",
  "Siemka",
  "Salut",
  "Hola",
  "Hello",
  "Bonjour",
  "Ciao",
  "Olá",
  "Hallo",
  "Konnichiwa",
  "Privet",
  "Annyeong",
  "Namaste",
  "Shalom",
  "Marhaba",
  "Aloha",
  "Sawubona",
];

const quotes = [
  "Najlepszy moment, żeby zacząć oszczędzać, był wczoraj. Drugi najlepszy - dziś.",
  "Bogactwo to nie ile masz, ale ile mniej potrzebujesz.",
  "Nie pracuj dla pieniędzy - niech one pracują dla ciebie.",
  "Każdy oszczędzony złoty to kawałek wolności.",
  "Inwestycja w wiedzę procentuje najlepiej.",
  "Pieniądze są dobrym sługą, ale złym panem.",
  "Cierpliwość jest najlepszą inwestycją.",
  "Małe oszczędności codziennie - wielka różnica w skali roku.",
  "Nie sprawdzaj salda. Sprawdzaj kierunek.",
  "Budżet to plan, jak chcesz wydać swoje życie.",
  "Procent składany to ósmy cud świata.",
  "Bogactwo zaczyna się w głowie, nie w portfelu.",
  "Zarabiaj mniej niż wydajesz, oszczędzaj więcej niż myślisz.",
  "Najbogatszy nie ten, kto najwięcej ma, lecz kto najmniej potrzebuje.",
  "Inwestowanie to przenoszenie pieniędzy od niecierpliwych do cierpliwych.",
  "Nie czas na rynku, lecz czas w rynku decyduje.",
  "Ryzykiem nie jest to, że masz mało - ryzykiem jest brak planu.",
  "Najlepsza waluta to czas. Pieniądze go kupują.",
];

function setLocalTime(year: number, month: number, day: number, hour = 12) {
  vi.setSystemTime(new Date(year, month - 1, day, hour, 0, 0, 0));
}

function localDayIndex(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 86_400_000);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("dashboard daily rotation", () => {
  it("returns non-empty values from the known greeting and quote sets", () => {
    vi.useFakeTimers();
    setLocalTime(2026, 5, 24);

    expect(greetings).toContain(dailyGreeting());
    expect(dailyGreeting()).not.toHaveLength(0);
    expect(quotes).toContain(dailyQuote());
    expect(dailyQuote()).not.toHaveLength(0);
  });

  it("is deterministic within the same local day", () => {
    vi.useFakeTimers();
    setLocalTime(2026, 5, 24, 8);
    const morningGreeting = dailyGreeting();
    const morningQuote = dailyQuote();

    setLocalTime(2026, 5, 24, 23);

    expect(dailyGreeting()).toBe(morningGreeting);
    expect(dailyQuote()).toBe(morningQuote);
  });

  it("rotates across consecutive local days", () => {
    vi.useFakeTimers();
    setLocalTime(2026, 5, 24);
    const firstGreeting = dailyGreeting();
    const firstQuote = dailyQuote();

    setLocalTime(2026, 5, 25);

    expect(dailyGreeting()).not.toBe(firstGreeting);
    expect(dailyQuote()).not.toBe(firstQuote);
  });

  it("indexes greeting and quote independently with the quote offset", () => {
    vi.useFakeTimers();
    setLocalTime(2026, 5, 24);
    const index = localDayIndex();

    expect(dailyGreeting()).toBe(greetings[index % greetings.length]);
    expect(dailyQuote()).toBe(quotes[(index + 7) % quotes.length]);
    expect(dailyQuote()).not.toBe(quotes[index % quotes.length]);
  });
});
