// Marks overdue quotes as expired.
//
// BJ-0089 Band 4:
//   - Was anonymously invokable with wildcard CORS. Now machine-only, via the
//     shared gate (service-role key, cron shared secret, or a per-tenant
//     webhook secret).
//   - The action is intentionally a maintenance sweep. A caller presenting a
//     per-tenant secret is scoped to THAT tenant; only an internal
//     service-role/cron caller may run the global sweep.
//   - Naturally idempotent: it only moves rows whose expiry_date has passed and
//     whose status is still sent/viewed, so repeat calls are no-ops.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireMachineCaller, tenantSecretOrg } from "../_shared/machineAuth.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const unauthorised = await requireMachineCaller(req, corsHeaders, "expire-quotes");
  if (unauthorised) return unauthorised;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json({ success: false, error: "server_not_configured" }, 500);
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Per-tenant callers only ever expire their own quotes.
    const scopedOrgId = await tenantSecretOrg(req);

    const { data, error } = await supabase.rpc("expire_overdue_quotes", {
      p_organisation_id: scopedOrgId,
    });
    if (error) return json({ success: false, error: error.message }, 500);

    return json({ success: true, expired: data ?? 0, organisation_id: scopedOrgId ?? "all" });
  } catch (error) {
    return json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
