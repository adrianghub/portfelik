// B2 prep: public demo provisioner skeleton.
// Do NOT deploy to staging/production without explicit ship approval.
// Local enablement requires DEMO_PROVISION_ENABLED=true.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { createOpenDemoAccountHandler } from "./handler.ts";

Deno.serve(
  createOpenDemoAccountHandler(
    (name) => Deno.env.get(name),
    createClient,
    { randomUUID: () => crypto.randomUUID() }
  )
);
