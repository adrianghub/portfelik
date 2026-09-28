import * as m from "$lib/paraglide/messages";

/** Current preview list. Replace the entries when the next visible change ships. */
export const PREVIEW_CHANGELOG: Array<{ id: string; href: string; label: () => string }> = [
  { id: "kokpit", href: "/dashboard", label: () => m.changelog_kokpit() },
  { id: "transactions", href: "/transactions", label: () => m.changelog_transactions() },
  { id: "cash", href: "/transactions", label: () => m.changelog_cash() },
  { id: "plans", href: "/plans", label: () => m.changelog_plans() },
  { id: "import", href: "/import", label: () => m.changelog_import() },
  { id: "glossary", href: "/settings?tab=profile", label: () => m.changelog_glossary() },
];
