import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { createInvitationHandler } from "./handler.ts";

Deno.serve(createInvitationHandler((name) => Deno.env.get(name), createClient));
