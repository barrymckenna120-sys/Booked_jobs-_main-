import { createClient } from "npm:@supabase/supabase-js@2";
import { filterDueCustomers } from "../_shared/renewalDedup.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl) return { ok: false, reason: "auth_unavailable" };
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!res.ok) return { ok: false, reason: `invalid_token_${res.status}` };
    const user = await res.json();
    if (!user?.id) return { ok: false, reason: "no_user" };
    return { ok: true };
  } catch (_e) {
    return { ok: false, reason: `auth_check_failed: ${(_e as Error).message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await authoriseRequest(req);
  if (!auth.ok) {
    console.warn(`renewal-reminder-7: unauthorized call (${auth.reason})`);
    return new Response(JSON.stringify({ error: "Unauthorized", reason: auth.reason }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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
