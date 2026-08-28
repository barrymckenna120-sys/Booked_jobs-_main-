import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isDenied, requireResourceOrgAccess } from "../_shared/orgAuth.ts";

// Increments the invoice-reminder counter on a job.
//
// Called internally by trigger-outstanding-reminder (service-role key) and from
// the office UI. Previously it trusted the supplied service_call_id outright, so
// any caller who could reach the function could bump another tenant's counters.
// Now the row's own organisation is loaded server-side and the caller must
// belong to it (machine callers must be service-role or hold that tenant's own
// webhook secret). Office/admin users keep their existing access inside their
// own organisation.

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { service_call_id } = await req.json().catch(() => ({}));

    if (!service_call_id || typeof service_call_id !== "string") {
      return json({ error: "service_call_id is required and must be a string" }, 400);
    }

    const access = await requireResourceOrgAccess(req, {
      fnName: "mark-invoice-reminder-sent",
      cors: corsHeaders,
      resource: { table: "service_calls", id: service_call_id },
    });
    if (isDenied(access)) return access.error;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch current count (scoped to the authorised organisation)
    const { data: job, error: fetchError } = await supabase
      .from("service_calls")
      .select("invoice_reminder_count")
      .eq("id", service_call_id)
      .eq("organisation_id", access.orgId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!job) return json({ error: "Service call not found" }, 404);

    const currentCount = job.invoice_reminder_count || 0;

    if (currentCount >= 2) {
      return json({ error: "Maximum reminders (2) already sent" }, 400);
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      invoice_reminder_count: currentCount + 1,
    };

    if (currentCount === 0) {
      updatePayload.invoice_reminder_sent_at = now;
    } else if (currentCount === 1) {
      updatePayload.invoice_reminder_2_sent_at = now;
    }

    const { error: updateError } = await supabase
      .from("service_calls")
      .update(updatePayload)
      .eq("id", service_call_id)
      .eq("organisation_id", access.orgId);

    if (updateError) throw updateError;

    return json({
      success: true,
      service_call_id,
      new_count: currentCount + 1,
      updated_field: currentCount === 0 ? "invoice_reminder_sent_at" : "invoice_reminder_2_sent_at",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await supabase.from("edge_function_logs").insert({
      function_name: "mark-invoice-reminder-sent",
      error_message: message,
    });
    return json({ error: message }, 500);
  }
});
