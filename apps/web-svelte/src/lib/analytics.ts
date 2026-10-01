import { browser } from "$app/environment";
import { PUBLIC_PLAUSIBLE_DOMAIN } from "$env/static/public";

export type MilestoneEvent =
  | "onboarding_started"
  | "guided_tour_started"
  | "guided_tour_scene_viewed"
  | "guided_tour_completed"
  | "guided_tour_skipped"
  | "first_import_committed"
  | "first_transaction_created"
  | "first_plan_created"
  | "first_settlement_linked"
  | "demo_loaded"
  | "demo_cleared"
  | "import_reminder_enabled"
  | "glossary_opened"
  | "pwa_installed"
  | "pwa_install_prompt_shown"
  | "push_enabled";

export type DiagnosticEvent =
  | "client_error"
  | "mutation_failure"
  | "import_failure"
  | "parser_failure"
  | "web_vital"
  | "api_timing";

export type AnalyticsEvent = MilestoneEvent | DiagnosticEvent;

export type AnalyticsProps = Record<string, string | number | boolean>;

const MILESTONE_KEYS: Record<MilestoneEvent, string> = {
  onboarding_started: "analytics:onboarding_started",
  guided_tour_started: "analytics:guided_tour_started",
  guided_tour_scene_viewed: "analytics:guided_tour_scene_viewed",
  guided_tour_completed: "analytics:guided_tour_completed",
  guided_tour_skipped: "analytics:guided_tour_skipped",
  first_import_committed: "analytics:first_import_committed",
  first_transaction_created: "analytics:first_transaction_created",
  first_plan_created: "analytics:first_plan_created",
  first_settlement_linked: "analytics:first_settlement_linked",
  demo_loaded: "analytics:demo_loaded",
  demo_cleared: "analytics:demo_cleared",
  import_reminder_enabled: "analytics:import_reminder_enabled",
  glossary_opened: "analytics:glossary_opened",
  pwa_installed: "analytics:pwa_installed",
  pwa_install_prompt_shown: "analytics:pwa_install_prompt_shown",
  push_enabled: "analytics:push_enabled",
};

export function analyticsEnabled(): boolean {
  return browser && !!plausibleDomain();
}

function plausibleDomain(): string | null {
  const domain = PUBLIC_PLAUSIBLE_DOMAIN?.trim();
  return domain ? domain : null;
}

/** Bounded route names: never send entity IDs, invite tokens, queries or hashes. */
export function analyticsPath(path: string): string {
  const top = path.split("/")[1];
  if (
    [
      "dashboard",
      "transactions",
      "import",
      "plans",
      "settings",
      "login",
      "privacy",
      "changelog",
      "invite",
      "admin",
      "auth",
    ].includes(top)
  ) {
    return `/${top}`;
  }
  return "/";
}

function toPlausibleProps(props?: AnalyticsProps): Record<string, string> | undefined {
  if (!props) return undefined;
  const entries = Object.entries(props);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map(([key, value]) => [key, String(value)]));
}

/** Send only an explicit, bounded payload; no automatic URL/referrer capture. */
export function track(event: AnalyticsEvent | "pageview", props?: AnalyticsProps): void {
  if (import.meta.env.DEV) console.debug("[analytics]", event, props);
  const domain = plausibleDomain();
  if (!browser || !domain) return;
  void fetch("https://plausible.io/api/event", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      name: event,
      domain,
      url: window.location.origin + analyticsPath(window.location.pathname),
      props: toPlausibleProps(props),
    }),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    keepalive: true,
  }).catch(() => {
    /* Telemetry must never interrupt a financial action. */
  });
}

/** Fire a milestone event at most once per browser profile. */
export function trackOnce(event: MilestoneEvent, props?: AnalyticsProps): void {
  if (typeof localStorage === "undefined") {
    track(event, props);
    return;
  }
  const key = MILESTONE_KEYS[event];
  if (localStorage.getItem(key) === "1") return;
  localStorage.setItem(key, "1");
  track(event, props);
}
