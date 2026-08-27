import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isDenied, requireBoundOrg } from "../_shared/orgAuth.ts";

function formatPhoneE164(phone: string | null): string {
  if (!phone) return "";
  let cleaned = phone.replace(/\s+/g, "").replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+353")) return cleaned;
  if (cleaned.startsWith("353")) return "+" + cleaned;
  if (cleaned.startsWith("0")) cleaned = cleaned.slice(1);
  return "+353" + cleaned;
}

function formatDateDDMMYYYY(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Upcoming service calls for ONE organisation. Machine callers must name the
 * organisation (and match a per-tenant webhook secret when configured); users
 * are scoped to their own organisation.
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
    let daysAhead = 2;
    if (typeof (body as { days_ahead?: number }).days_ahead === "number") {
      daysAhead = (body as { days_ahead: number }).days_ahead;
    }

    const requestedOrgId =
      (body as { organisation_id?: string }).organisation_id ??
      url.searchParams.get("organisation_id");

    const access = await requireBoundOrg(req, {
      fnName: "get-upcoming-service-calls",
      cors: corsHeaders,
      requestedOrgId,
    });
    if (isDenied(access)) return access.error;
    const orgId = access.orgId;

    // Calculate target date in Europe/Dublin timezone
    const nowDublin = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Dublin" }));
    const target = new Date(nowDublin);
    target.setDate(target.getDate() + daysAhead);
    const targetStr = target.toISOString().split("T")[0];

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: jobs, error } = await supabase
      .from("service_calls")
      .select(`
        id,
        scheduled_date,
        time_block,
        job_type,
        organisation_id,
        assigned_engineer_id,
        status,
        customer_id,
        customers ( name, phone ),
        engineers:assigned_engineer_id ( name )
      `)
      .eq("organisation_id", orgId)
      .eq("scheduled_date", targetStr)
      .neq("status", "Cancelled");

    if (error) throw error;

    const calls = (jobs || []).map((job: any) => ({
      customer_name: job.customers?.name || "",
      customer_phone: formatPhoneE164(job.customers?.phone),
      scheduled_date: formatDateDDMMYYYY(job.scheduled_date),
      scheduled_time: job.time_block || "",
      job_type: job.job_type,
      engineer_name: job.engineers?.name || "",
      organisation_id: job.organisation_id,
    }));

    return json({ calls });
  } catch (err) {
    console.error("get-upcoming-service-calls error:", err);
    return json({ calls: [], error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
