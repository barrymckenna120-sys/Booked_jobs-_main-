import { createClient } from "npm:@supabase/supabase-js@2";
import { filterDueCustomers } from "../_shared/renewalDedup.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isDenied, requireBoundOrg } from "../_shared/orgAuth.ts";

/**
 * 7-day renewal reminder feed for ONE organisation.
 *
 * Auth (BJ-0089 Band 4): the shared gate only. Machine callers (Make.com)
 * present their tenant's webhook secret, which both authenticates them and
 * names the tenant; signed-in users are scoped to their own organisation.
 * Any body-supplied organisation_id can never widen scope.
 */
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const reqBody = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const requestedOrgId =
    (reqBody as { organisation_id?: string })?.organisation_id ??
    url.searchParams.get("organisation_id");

  const access = await requireBoundOrg(req, {
    fnName: "renewal-reminder-7",
    cors: corsHeaders,
    requestedOrgId,
  });
  if (isDenied(access)) return access.error;
  const orgId = access.orgId;


  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date();
    const target = new Date(today);
    target.setDate(target.getDate() + 7);
    const targetDate = target.toISOString().split("T")[0];

    const { data: customers, error: custErr } = await supabase
      .from("customers")
      .select("id, name, phone, next_service_due, organisation_id, reminder_7_days_sent")
      .eq("organisation_id", orgId)
      .eq("next_service_due", targetDate)
      .neq("opted_out", true);


    if (custErr) throw custErr;
    if (!customers || customers.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerIds = customers.map((c) => c.id);
    const { data: bookedJobs, error: jobErr } = await supabase
      .from("service_calls")
      .select("customer_id")
      .in("customer_id", customerIds)
      .in("status", ["Pending", "pending", "Booked", "booked", "Confirmed", "confirmed", "Scheduled"]);

    if (jobErr) throw jobErr;

    const bookedSet = new Set((bookedJobs || []).map((j) => j.customer_id));

    // Dedup on the customer-level flag (this cadence has no job-level column at all).
    const result = filterDueCustomers(customers, bookedSet, new Map(), "7day")
      .filter((c: any) => {
        if (!c.organisation_id) {
          console.warn(`[renewal-reminder-7] customer ${c.id} missing organisation_id — skipping`);
          return false;
        }
        return true;
      })
      .map((c) => ({
        id: c.id,
        full_name: c.name,
        mobile_number: c.phone,
        next_service_due: c.next_service_due,
      }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from('edge_function_logs').insert({
        function_name: '7-day-reminder',
        error_message: err instanceof Error ? err.message : String(err),
        payload: null,
      });
    } catch (_) { /* best-effort */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
