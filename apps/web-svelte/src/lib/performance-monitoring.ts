import { analyticsEnabled, track } from "$lib/analytics";
import type { Metric } from "web-vitals";

let vitalsStarted = false;

/** Only the metric is sent: never DOM attribution, URLs, IDs or financial data. */
export function reportVital(metric: Pick<Metric, "name" | "value" | "rating">): void {
  if (!["LCP", "CLS", "INP"].includes(metric.name) || !Number.isFinite(metric.value)) return;
  track("web_vital", {
    metric: metric.name,
    value: Math.round(Math.max(0, metric.value) * (metric.name === "CLS" ? 1000 : 1)),
    unit: metric.name === "CLS" ? "thousandths" : "ms",
    rating: metric.rating,
  });
}

/** Buffered observers let us defer this small module until the app has mounted. */
export async function installWebVitals(): Promise<void> {
  if (vitalsStarted || !analyticsEnabled()) return;
  vitalsStarted = true;
  try {
    const { onLCP, onCLS, onINP } = await import("web-vitals");
    onLCP(reportVital);
    onCLS(reportVital);
    onINP(reportVital);
  } catch {
    // Monitoring must never interfere with the application.
    vitalsStarted = false;
  }
}

/** A bounded endpoint class, deliberately discarding path, query, headers and body. */
export function endpointClass(input: RequestInfo | URL): "auth" | "data" | "function" | "other" {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname.startsWith("/auth/v1/")) return "auth";
  if (url.pathname.startsWith("/rest/v1/")) return "data";
  if (url.pathname.startsWith("/functions/v1/")) return "function";
  return "other";
}

export const measuredFetch: typeof fetch = async (input, init) => {
  if (!analyticsEnabled()) return fetch(input, init);
  const started = performance.now();
  let success = false;
  try {
    const response = await fetch(input, init);
    success = response.ok;
    return response;
  } finally {
    const elapsed = performance.now() - started;
    // Sample normal calls, retain slow calls. No per-request identifier is collected.
    if (elapsed >= 1000 || Math.random() < 0.1) {
      try {
        track("api_timing", {
          endpoint: endpointClass(input),
          duration_ms: Math.min(60000, Math.round(elapsed / 50) * 50),
          success,
        });
      } catch {
        /* preserve the original response/error */
      }
    }
  }
};
