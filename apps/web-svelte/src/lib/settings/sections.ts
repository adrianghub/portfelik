// Settings information architecture: three sections, each drilling into the
// existing flat tab panels. The `tab` ids stay the canonical `?tab=` deep-link
// values (back-compat), so the panel components are reused unchanged.
import { User, Wallet, Users } from "lucide-svelte";
import * as m from "$lib/paraglide/messages";

export type SettingsTab = "categories" | "rules" | "groups" | "profile" | "personalization";

export interface SettingsSubsection {
  tab: SettingsTab;
  label: () => string;
  /** Lowercase PL keywords for the settings search (matched with `includes`). */
  keywords: string[];
}

export interface SettingsSection {
  id: "account" | "finance" | "sharing";
  label: () => string;
  icon: typeof User;
  subs: SettingsSubsection[];
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "account",
    label: () => m.settings_section_account(),
    icon: User,
    subs: [
      {
        tab: "profile",
        label: () => m.settings_tab_profile(),
        keywords: ["profil", "imię", "email", "konto", "powiadomienia", "usuń konto", "eksport"],
      },
      {
        tab: "personalization",
        label: () => m.settings_tab_personalization(),
        keywords: ["personalizacja", "kolor", "akcent", "motyw", "awatar", "wygląd"],
      },
    ],
  },
  {
    id: "finance",
    label: () => m.settings_section_finance(),
    icon: Wallet,
    subs: [
      {
        tab: "categories",
        label: () => m.settings_tab_categories(),
        keywords: ["kategorie", "wydatki", "przychody"],
      },
      {
        tab: "rules",
        label: () => m.settings_tab_rules(),
        keywords: ["reguły", "automatyczne", "kategoryzacja"],
      },
    ],
  },
  {
    id: "sharing",
    label: () => m.settings_section_sharing(),
    icon: Users,
    subs: [
      {
        tab: "groups",
        label: () => m.settings_tab_groups(),
        keywords: ["grupy", "zaproszenia", "członkowie", "współdzielenie"],
      },
    ],
  },
];

/** Flat index of every subsection, tagged with its parent section, for search. */
export const SETTINGS_SUBSECTIONS = SETTINGS_SECTIONS.flatMap((section) =>
  section.subs.map((sub) => ({ ...sub, sectionId: section.id, sectionLabel: section.label }))
);

export function sectionForTab(tab: SettingsTab): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((s) => s.subs.some((sub) => sub.tab === tab));
}

/** Subsections whose label or keywords match the query (case-insensitive). */
export function searchSubsections(query: string): typeof SETTINGS_SUBSECTIONS {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SETTINGS_SUBSECTIONS.filter(
    (sub) =>
      sub.label().toLowerCase().includes(q) || sub.keywords.some((k) => k.toLowerCase().includes(q))
  );
}
