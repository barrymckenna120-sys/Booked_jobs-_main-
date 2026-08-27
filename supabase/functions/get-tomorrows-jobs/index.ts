import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Auth guard (audit finding #1) — this function used to be anonymously
 * invokable. Accepts exactly the credentials our real callers already send:
 *  - Make.com / internal machine callers: `x-webhook-secret` or `x-make-secret`
 *    === MAKE_WEBHOOK_SECRET, or `Authorization: Bearer <service role key>`.
 *  - Signed-in app users: a valid Supabase user JWT.
 * The anon/publishable key alone is rejected — that is the hole being closed.
 */
function bearerToken(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function isMachineCaller(req: Request): boolean {
  const expected = (Deno.env.get("MAKE_WEBHOOK_SECRET") ?? "").trim();
  const provided = (req.headers.get("x-webhook-secret") ?? req.headers.get("x-make-secret") ?? "").trim();
  if (expected && provided && provided === expected) return true;
  const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const token = bearerToken(req);
  return Boolean(serviceRoleKey && token && token === serviceRoleKey);
}

async function authoriseRequest(req: Request): Promise<{ ok: boolean; reason?: string }> {
  if (isMachineCaller(req)) return { ok: true };
  const token = bearerToken(req);
  if (!token) return { ok: false, reason: "missing_credentials" };
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return { ok: false, reason: "auth_unavailable" };
  try {
    const authClient = createClient(supabaseUrl, serviceKey);
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data?.user?.id) return { ok: false, reason: "invalid_token" };
    return { ok: true };
  } catch (_e) {
    return { ok: false, reason: `auth_check_failed: ${(_e as Error).message}` };
  }
}

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await authoriseRequest(req);
  if (!auth.ok) {
    console.warn(`get-tomorrows-jobs: unauthorized call (${auth.reason})`);
    return new Response(JSON.stringify({ error: "Unauthorized", reason: auth.reason }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate tomorrow's date in ISO format
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0]; // yyyy-MM-dd

    // Query jobs scheduled for tomorrow, excluding cancelled/completed
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
      .eq("scheduled_date", tomorrowStr)
      .not("status", "in", '("Cancelled","Completed","no_show")');

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

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

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
