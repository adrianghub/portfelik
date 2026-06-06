const CATEGORY_EMOJI_MAP: Record<string, string> = {
  podróże: "🏖️",
  travel: "🏖️",
  dom: "🏠",
  home: "🏠",
  jedzenie: "🛒",
  food: "🛒",
  zakupy: "🛒",
  inne: "📦",
  other: "📦",
  transport: "🚗",
  zdrowie: "💊",
  health: "💊",
  rozrywka: "🎬",
  entertainment: "🎬",
  edukacja: "📚",
  education: "📚",
  ubrania: "👗",
  clothing: "👗",
  sport: "⚽",
  elektronika: "💻",
  electronics: "💻",
  restauracja: "🍽️",
  restaurant: "🍽️",
  wakacje: "🏖️",
  remont: "🔨",
  renovation: "🔨",
  prezenty: "🎁",
  gifts: "🎁",
  uroda: "💄",
  beauty: "💄",
  zwierzęta: "🐾",
  pets: "🐾",
};

export function getPlanEmoji(categoryName: string | undefined | null, planName: string): string {
  if (categoryName) {
    const key = categoryName.toLowerCase().trim();
    if (CATEGORY_EMOJI_MAP[key]) return CATEGORY_EMOJI_MAP[key];
  }
  const nameKey = planName.toLowerCase().trim();
  for (const [k, v] of Object.entries(CATEGORY_EMOJI_MAP)) {
    if (nameKey.includes(k)) return v;
  }
  return "";
}
