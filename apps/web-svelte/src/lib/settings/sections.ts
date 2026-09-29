// Settings information architecture: three sections, each drilling into the
// existing flat tab panels. The `tab` ids stay the canonical `?tab=` deep-link
// values (back-compat), so the panel components are reused unchanged.
import { LifeBuoy, Shield, User, Users, Wallet } from "lucide-svelte";
import * as m from "$lib/paraglide/messages";

export type SettingsTab =
  | "categories"
  | "rules"
  | "groups"
  | "profile"
  | "notifications"
  | "personalization"
  | "help"
  | "privacy";

export interface SettingsSubsection {
  tab: SettingsTab;
  label: () => string;
  /** Lowercase PL keywords for the settings search (matched with `includes`). */
  keywords: string[];
}

export interface SettingsSection {
  id: "account" | "finance" | "sharing" | "application" | "data";
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
        keywords: ["profil", "imię", "email", "konto"],
      },
      {
        tab: "notifications",
        label: () => m.settings_tab_notifications(),
        keywords: ["powiadomienia", "przypomnienie", "import", "push"],
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
        keywords: ["kategorie", "limity", "wydatki", "przychody"],
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
        keywords: ["grupy", "zaproszenia", "członkowie", "wspólnie", "własność"],
      },
    ],
  },
  {
    id: "application",
    label: () => m.settings_section_application(),
    icon: LifeBuoy,
    subs: [
      {
        tab: "personalization",
        label: () => m.settings_tab_personalization(),
        keywords: ["personalizacja", "kolor", "akcent", "motyw", "awatar", "wygląd"],
      },
      {
        tab: "help",
        label: () => m.settings_tab_help(),
        keywords: ["pomoc", "przewodnik", "przykład", "demo", "słownik"],
      },
    ],
  },
  {
    id: "data",
    label: () => m.settings_section_data(),
    icon: Shield,
    subs: [
      {
        tab: "privacy",
        label: () => m.settings_tab_privacy(),
        keywords: ["eksport", "usuń konto", "usuń dane", "prywatność", "dane"],
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
