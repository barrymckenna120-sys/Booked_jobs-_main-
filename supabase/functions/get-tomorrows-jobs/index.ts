import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isDenied, requireBoundOrg } from "../_shared/orgAuth.ts";

/**
 * Returns tomorrow's jobs for ONE organisation.
 *
 * Machine callers (Make.com / pg_cron / another Edge Function) must name the
 * organisation they are acting for; where the tenant has its own webhook secret
 * configured that secret must match. Signed-in users are always scoped to their
 * own organisation and cannot request another tenant's jobs.
 */
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const requestedOrgId =
      (body as { organisation_id?: string }).organisation_id ??
      url.searchParams.get("organisation_id");

    const access = await requireBoundOrg(req, {
      fnName: "get-tomorrows-jobs",
      cors: corsHeaders,
      requestedOrgId,
    });
    if (isDenied(access)) return access.error;
    const orgId = access.orgId;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { data: jobs, error } = await supabase
      .from("service_calls")
      .select(`
        id,
        scheduled_date,
        time_block,
        job_type,
        assigned_engineer,
        assigned_engineer_id,
        status,
        customer_id,
        customers ( name, phone, address, eircode, boiler_make_model, access_notes ),
        engineers:assigned_engineer_id ( name )
      `)
      .eq("organisation_id", orgId)
      .eq("scheduled_date", tomorrowStr)
      .not("status", "in", '("Cancelled","Completed","no_show")');

    if (error) return json({ success: false, error: error.message }, 500);

    const result = (jobs || []).map((job: any) => ({
      job_id: job.id,
      customer_name: job.customers?.name || null,
      customer_phone: job.customers?.phone || null,
      customer_address: job.customers?.address || null,
      customer_eircode: job.customers?.eircode || null,
      boiler_make_model: job.customers?.boiler_make_model || null,
      access_notes: job.customers?.access_notes || null,
      appointment_time: job.time_block || "No time set",
      scheduled_date: job.scheduled_date,
      engineer_name: job.engineers?.name || job.assigned_engineer || null,
      job_type: job.job_type,
      status: job.status,
    }));

    return json(result);
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
