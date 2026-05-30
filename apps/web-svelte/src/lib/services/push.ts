import { PUBLIC_VAPID_KEY } from "$env/static/public";
import { supabase } from "$lib/supabase";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return view;
}

// Per-device opt-out. Push subscriptions are per-device, so disabling on this
// device must persist across logins — otherwise autoSubscribePush() silently
// re-subscribes whenever the browser permission is still "granted".
const PUSH_OPT_OUT_KEY = "portfelik_push_opt_out";

export function isPushOptedOut(): boolean {
  try {
    return localStorage.getItem(PUSH_OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function setPushOptOut(value: boolean): void {
  try {
    if (value) localStorage.setItem(PUSH_OPT_OUT_KEY, "1");
    else localStorage.removeItem(PUSH_OPT_OUT_KEY);
  } catch {
    // localStorage unavailable (private mode / SSR) — opt-out is best-effort.
  }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

async function doSubscribe(userId: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

  await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      device_type: /mobile/i.test(navigator.userAgent) ? "mobile" : "desktop",
      user_agent: navigator.userAgent.slice(0, 512),
    },
    { onConflict: "user_id,endpoint" }
  );
}

// Call on auth events — subscribes silently if permission already granted.
// Never triggers the browser permission prompt.
export async function autoSubscribePush(userId: string): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission !== "granted") return;
  if (isPushOptedOut()) return; // respect a prior disable on this device
  await doSubscribe(userId);
}

// Call only from a user-gesture handler (button click).
// Triggers the browser permission prompt then subscribes.
export async function requestAndSubscribePush(userId: string): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (Notification.permission === "denied") return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  setPushOptOut(false); // explicit enable clears any prior opt-out
  await doSubscribe(userId);
  return true;
}

export async function unsubscribeFromPush(): Promise<void> {
  setPushOptOut(true); // persist the disable so login won't re-subscribe
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const { endpoint } = subscription;
  await subscription.unsubscribe();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export type PushSubscriptionRow = {
  endpoint: string;
  device_type: string | null;
  user_agent: string | null;
  created_at: string;
  last_used_at: string;
};

export async function fetchPushSubscriptions(): Promise<PushSubscriptionRow[]> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, device_type, user_agent, created_at, last_used_at")
    .order("last_used_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PushSubscriptionRow[];
}

export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw error;
}

export type AdminPushSubscriptionRow = PushSubscriptionRow & { user_id: string };

export async function fetchAdminPushSubscriptions(): Promise<AdminPushSubscriptionRow[]> {
  const { data, error } = await supabase.rpc("fetch_admin_push_subscriptions");
  if (error) throw error;
  return (data ?? []) as AdminPushSubscriptionRow[];
}

export async function deleteAdminPushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const { error } = await supabase.rpc("delete_admin_push_subscription", {
    p_endpoint: endpoint,
  });
  if (error) throw error;
}

export type PushNotificationState = "active" | "disabled" | "blocked";

export async function getPushNotificationState(): Promise<PushNotificationState> {
  if (!("Notification" in window)) return "disabled";
  if (Notification.permission === "denied") return "blocked";
  if (isPushOptedOut()) return "disabled";

  if (!("serviceWorker" in navigator)) {
    return "disabled";
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) return "active";
  } catch {
    // SW not ready — treat as disabled until subscription is confirmed.
  }

  return "disabled";
}
