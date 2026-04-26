// supabase/functions/send-push/index.ts
//
// Generic web-push fan-out. Given a notification id, looks up the row,
// fetches all push_subscriptions for the owning user, and sends a VAPID
// push to every endpoint. Dead subscriptions (404 / 410) are pruned.
//
// Auth: verify_jwt = false. Caller must pass Authorization: Bearer <INTERNAL_TRIGGER_SECRET>.
// INTERNAL_TRIGGER_SECRET is set as an Edge Function secret and stored in Vault.
//
// Required Edge Function secrets:
//   INTERNAL_TRIGGER_SECRET  (random hex — also stored in Vault as 'internal_trigger_secret')
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT            e.g. mailto:zinko.adrian00@gmail.com
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const TRIGGER_SECRET = Deno.env.get("INTERNAL_TRIGGER_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@portfelik.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface RequestBody {
  notificationId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const auth = req.headers.get("Authorization");
  if (!TRIGGER_SECRET || auth !== `Bearer ${TRIGGER_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  if (!body.notificationId) {
    return new Response("Missing notificationId", { status: 400 });
  }

  const { data: notif, error: nErr } = await supabase
    .from("notifications")
    .select("user_id, title, body, type, data")
    .eq("id", body.notificationId)
    .single();

  if (nErr || !notif) {
    return new Response(`Notification not found: ${nErr?.message ?? "unknown"}`, { status: 404 });
  }

  const { data: subs, error: sErr } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", notif.user_id);

  if (sErr) {
    return new Response(`Subscriptions query failed: ${sErr.message}`, { status: 500 });
  }

  const payload = JSON.stringify({
    title: notif.title,
    body: notif.body,
    data: { ...(notif.data ?? {}), type: notif.type, notificationId: body.notificationId },
  });

  const results = await Promise.allSettled(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("user_id", notif.user_id)
            .eq("endpoint", s.endpoint);
        }
        throw err;
      }
    }),
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;

  return new Response(
    JSON.stringify({ sent, failed, total: results.length }),
    { headers: { "content-type": "application/json" } },
  );
});
