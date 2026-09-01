// Stale-acceptance sweep.
//
// A provider acceptance is NOT a delivery. When the confirmation window closes
// with no callback, the honest state is "we don't know" — `delivery_unknown`,
// shown to the office as "Delivery not confirmed".
//
// This function NEVER writes `failed`: failure is only ever recorded from an
// explicit provider failure callback. It therefore raises no failure alerts.
// Idempotent — rows already moved out of `accepted` are untouched.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireMachineCaller } from "../_shared/machineAuth.ts";

const REASON = "Delivery not confirmed";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = await requireMachineCaller(req, corsHeaders, "sweep-stale-accepted-deliveries");
  if (denied) return denied;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date().toISOString();

  const { data: stale, error } = await supabase
    .from("communication_deliveries")
    .update({
      delivery_status: "delivery_unknown",
      failure_reason_public: REASON,
      confirmation_due_at: null,
      in_flight: false,
      in_flight_at: null,
    })
    .eq("delivery_status", "accepted")
    .not("confirmation_due_at", "is", null)
    .lte("confirmation_due_at", now)
    .select("id, organisation_id");

  if (error) {
    console.error("sweep-stale-accepted-deliveries failed", error.message);
    return json({ error: "Sweep failed" }, 500);
  }

  const ids = (stale ?? []).map((r: { id: string }) => r.id);

  // Mirror onto the attempts so the office history line matches the badge.
  if (ids.length) {
    await supabase
      .from("communication_delivery_attempts")
      .update({ outcome: "delivery_unknown", failure_reason_public: REASON })
      .in("delivery_id", ids)
      .eq("outcome", "accepted");
  }

  return json({ ok: true, swept: ids.length });
});
