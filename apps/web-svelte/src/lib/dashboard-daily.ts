/**
 * Daily rotating greeting + motivational quote for the dashboard.
 *
 * Both lists are seeded by the current day so the values stay stable
 * within a day and rotate at local midnight. No API calls - fixed
 * arrays keep the dashboard render synchronous and offline-friendly.
 */

const greetings: string[] = [
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

const quotes: string[] = [
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

function dayIndex(): number {
  // Local-day count: epoch days adjusted so the rotation flips at LOCAL
  // midnight rather than UTC midnight (Warsaw is UTC+1/+2, so UTC days
  // change in the middle of evening here).
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 86_400_000);
}

export function dailyGreeting(): string {
  return greetings[dayIndex() % greetings.length] ?? greetings[0];
}

export function dailyQuote(): string {
  // Offset so quote doesn't cycle in lockstep with greeting.
  return quotes[(dayIndex() + 7) % quotes.length] ?? quotes[0];
}
