// Accent color personalization.
//
// The whole app reads three CSS custom properties for its accent
// (`--color-accent-from`, `--color-accent-to`, `--color-accent-glow`), defined
// in `app.css`. Swapping those vars reskins every component that uses
// `.bg-accent-gradient` / `.text-accent-gradient` / `.glow-disc` etc.
//
// All presets are deliberately LIGHT (high OKLch lightness) so the existing
// dark `text-slate-900` foreground on accent surfaces stays legible — no
// component edits needed.

export type AccentPresetId = "green" | "blue" | "amber" | "pink" | "purple" | "orange";

export interface AccentPreset {
  id: AccentPresetId;
  /** Paraglide message key, e.g. "accent_green". */
  labelKey: string;
  from: string;
  to: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: "green",
    labelKey: "accent_green",
    from: "oklch(0.78 0.18 158)",
    to: "oklch(0.92 0.18 122)",
  },
  { id: "blue", labelKey: "accent_blue", from: "oklch(0.72 0.16 250)", to: "oklch(0.86 0.14 220)" },
  // Amber/yellow. Hue ~100-110 keeps it clearly yellow (vs orange's 60-85) and
  // far from rose destructive actions (hue ~25), the reason red was retired.
  {
    id: "amber",
    labelKey: "accent_amber",
    from: "oklch(0.85 0.16 100)",
    to: "oklch(0.93 0.15 110)",
  },
  { id: "pink", labelKey: "accent_pink", from: "oklch(0.74 0.19 350)", to: "oklch(0.87 0.15 330)" },
  {
    id: "purple",
    labelKey: "accent_purple",
    from: "oklch(0.72 0.18 300)",
    to: "oklch(0.86 0.14 290)",
  },
  {
    id: "orange",
    labelKey: "accent_orange",
    from: "oklch(0.76 0.16 60)",
    to: "oklch(0.9 0.15 85)",
  },
];

export const DEFAULT_ACCENT_ID: AccentPresetId = "green";

const STORAGE_KEY = "portfelik_accent";

export function getAccentPreset(id: string | null | undefined): AccentPreset {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS[0];
}

const CONFETTI_FALLBACK = ["#34d399", "#bef264", "#a7f3d0", "#86efac"];

/** Confetti palette derived from the live accent vars; falls back to greens. */
export function accentConfettiColors(): string[] {
  if (typeof document === "undefined") return CONFETTI_FALLBACK;
  const s = getComputedStyle(document.documentElement);
  const from = s.getPropertyValue("--color-accent-from").trim();
  const to = s.getPropertyValue("--color-accent-to").trim();
  return from && to ? [from, to] : CONFETTI_FALLBACK;
}

/**
 * Apply an accent preset to the document root and mirror the resolved values to
 * localStorage so the pre-paint script in `app.html` can restore them on the
 * next boot without a flash.
 */
export function applyAccent(id: string | null | undefined): void {
  if (typeof document === "undefined") return;
  const preset = getAccentPreset(id);
  const glow = `color-mix(in oklch, ${preset.from} 20%, transparent)`;
  const root = document.documentElement;
  root.style.setProperty("--color-accent-from", preset.from);
  root.style.setProperty("--color-accent-to", preset.to);
  root.style.setProperty("--color-accent-glow", glow);
  root.style.setProperty("--color-accent", preset.from);

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ id: preset.id, from: preset.from, to: preset.to, glow })
    );
  } catch {
    // localStorage unavailable (private mode quota etc.) — DB remains source of truth.
  }
}
