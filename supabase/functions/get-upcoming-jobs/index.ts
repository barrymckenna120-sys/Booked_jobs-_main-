import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isDenied, requireBoundOrg } from "../_shared/orgAuth.ts";

/**
 * Jobs two days out for ONE organisation. See get-tomorrows-jobs for the
 * caller/authorization contract — machine callers must name the organisation,
 * users are scoped to their own.
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
      fnName: "get-upcoming-jobs",
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
    const target = new Date(now);
    target.setDate(target.getDate() + 2);
    const targetStr = target.toISOString().split("T")[0];

    const { data: jobs, error } = await supabase
      .from("service_calls")
      .select(`
        id,
        scheduled_date,
        time_block,
        job_type,
        assigned_engineer,
        status,
        customer_id,
        customers ( name, phone )
      `)
      .eq("organisation_id", orgId)
      .eq("scheduled_date", targetStr)
      .not("status", "in", '("Cancelled","Completed","no_show")');

    if (error) return json({ success: false, error: error.message }, 500);

    const result = (jobs || []).map((job: any) => ({
      id: job.id,
      customer_name: job.customers?.name || null,
      customer_phone: job.customers?.phone || null,
      scheduled_date: job.scheduled_date,
      scheduled_time: job.time_block || null,
      job_type: job.job_type,
      assigned_engineer: job.assigned_engineer,
      status: job.status,
    }));

    return json(result);
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
