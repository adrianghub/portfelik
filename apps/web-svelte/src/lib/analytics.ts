import { browser } from "$app/environment";
import { PUBLIC_PLAUSIBLE_DOMAIN } from "$env/static/public";

export type AnalyticsEvent =
  | "onboarding_started"
  | "first_import_committed"
  | "first_transaction_created"
  | "first_plan_created"
  | "first_settlement_linked"
  | "demo_loaded"
  | "demo_cleared"
  | "import_reminder_enabled"
  | "glossary_opened"
  | "pwa_installed"
  | "push_enabled";

export type AnalyticsProps = Record<string, string | number | boolean>;

const MILESTONE_KEYS: Record<AnalyticsEvent, string> = {
  onboarding_started: "analytics:onboarding_started",
  first_import_committed: "analytics:first_import_committed",
  first_transaction_created: "analytics:first_transaction_created",
  first_plan_created: "analytics:first_plan_created",
  first_settlement_linked: "analytics:first_settlement_linked",
  demo_loaded: "analytics:demo_loaded",
  demo_cleared: "analytics:demo_cleared",
  import_reminder_enabled: "analytics:import_reminder_enabled",
  glossary_opened: "analytics:glossary_opened",
  pwa_installed: "analytics:pwa_installed",
  push_enabled: "analytics:push_enabled",
};

type PlausibleFn = ((event: string, options?: { props?: Record<string, string> }) => void) & {
  q?: unknown[][];
};

declare global {
  interface Window {
    plausible?: PlausibleFn;
  }
}

let scriptInjected = false;

function plausibleDomain(): string | null {
  const domain = PUBLIC_PLAUSIBLE_DOMAIN?.trim();
  return domain ? domain : null;
}

/** Load Plausible when PUBLIC_PLAUSIBLE_DOMAIN is set. Safe to call multiple times. */
export function initPlausible(): void {
  if (!browser || scriptInjected) return;
  const domain = plausibleDomain();
  if (!domain) return;

  scriptInjected = true;
  const w = window;
  w.plausible =
    w.plausible ||
    (((...args: unknown[]) => {
      (w.plausible!.q = w.plausible!.q || []).push(args);
    }) as PlausibleFn);

  const script = document.createElement("script");
  script.defer = true;
  script.dataset.domain = domain;
  script.src = "https://plausible.io/js/script.js";
  document.head.appendChild(script);
}

function toPlausibleProps(props?: AnalyticsProps): Record<string, string> | undefined {
  if (!props) return undefined;
  const entries = Object.entries(props);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map(([key, value]) => [key, String(value)]));
}

/** Send a custom event. No-ops when domain unset; logs in dev. */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (import.meta.env.DEV) {
    console.debug("[analytics]", event, props);
  }
  if (!browser || !plausibleDomain()) return;
  initPlausible();
  const plausibleProps = toPlausibleProps(props);
  if (plausibleProps) {
    window.plausible?.(event, { props: plausibleProps });
  } else {
    window.plausible?.(event);
  }
}

/** Fire a milestone event at most once per browser profile. */
export function trackOnce(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (typeof localStorage === "undefined") {
    track(event, props);
    return;
  }
  const key = MILESTONE_KEYS[event];
  if (localStorage.getItem(key) === "1") return;
  localStorage.setItem(key, "1");
  track(event, props);
}
