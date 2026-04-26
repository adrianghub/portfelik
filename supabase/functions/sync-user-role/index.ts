// supabase/functions/sync-user-role/index.ts
//
// Mirrors profiles.role into auth.users.app_metadata.role so Supabase JWTs
// carry the role claim. Called from the profiles role-change trigger.
//
// Auth: verify_jwt = false. Caller must pass Authorization: Bearer <INTERNAL_TRIGGER_SECRET>.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TRIGGER_SECRET = Deno.env.get("INTERNAL_TRIGGER_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface RequestBody {
  userId: string;
  role: "user" | "admin";
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

  if (!body.userId || !body.role) {
    return new Response("Missing userId or role", { status: 400 });
  }

  const { error } = await supabase.auth.admin.updateUserById(body.userId, {
    app_metadata: { role: body.role },
  });

  if (error) {
    return new Response(`updateUserById failed: ${error.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, userId: body.userId, role: body.role }), {
    headers: { "content-type": "application/json" },
  });
});
