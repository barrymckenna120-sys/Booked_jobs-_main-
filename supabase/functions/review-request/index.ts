// Lists completed jobs that are due a Google review request.
//
// BJ-0089 fixes applied here:
//   - Was anonymously invokable and returned customer name + phone for EVERY
//     tenant in one payload (cross-tenant PII leak). Now the caller must
//     authenticate and is bound to exactly one organisation.
//   - `opted_out` customers were included. They are now excluded server-side,
//     so no downstream sender can message them by accident.
//   - Customers with no phone number are dropped rather than returned as "".
//   - Tenants with no google_review_url are skipped and logged (no fallback to
//     another tenant's review link).

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isDenied, requireBoundOrg } from "../_shared/orgAuth.ts";

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
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      /* GET / empty body is fine */
    }
    const url = new URL(req.url);
    const requestedOrgId =
      (typeof body.organisation_id === "string" ? body.organisation_id : null) ??
      url.searchParams.get("organisation_id");

    // One organisation per call, established BEFORE any customer row is read.
    const access = await requireBoundOrg(req, {
      fnName: "review-request",
      cors: corsHeaders,
      requestedOrgId,
    });
    if (isDenied(access)) return access.error;
    const orgId = access.orgId;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Review link for this org only — no cross-tenant fallback.
    const { data: settings } = await supabase
      .from("settings")
      .select("google_review_url")
      .eq("organisation_id", orgId)
      .limit(1)
      .maybeSingle();
    const googleReviewLink = String(settings?.google_review_url ?? "").trim();
    if (!googleReviewLink) {
      console.warn(`review-request: organisation ${orgId} has no google_review_url — skipping`);
      try {
        await supabase.from("edge_function_logs").insert({
          function_name: "review-request",
          error_message: "Skipped: google_review_url_not_configured",
          payload: { organisation_id: orgId, reason: "google_review_url_not_configured", skipped: true },
        });
      } catch { /* best-effort */ }
      return json({ skipped: true, reason: "google_review_url_not_configured", jobs: [] });
    }

    // Completed jobs, this org only, completed at least 2 hours ago.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: jobs, error } = await supabase
      .from("service_calls")
      .select("id, customer_id, organisation_id")
      .eq("organisation_id", orgId)
      .eq("status", "Completed")
      .eq("review_sent", false)
      .lte("completed_at", twoHoursAgo);

    if (error) return json({ error: error.message }, 500);
    if (!jobs || jobs.length === 0) return json([]);

    const customerIds = [...new Set(jobs.map((j) => j.customer_id).filter(Boolean))];
    // Consent + tenancy enforced in the query itself.
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name, phone, opted_out")
      .eq("organisation_id", orgId)
      .in("id", customerIds);

    const customerMap = new Map(
      (customers ?? [])
        .filter((c) => c.opted_out !== true && String(c.phone ?? "").trim())
        .map((c) => [c.id, { name: c.name as string, phone: String(c.phone).trim() }]),
    );

    const result = jobs
      .map((job) => {
        const customer = customerMap.get(job.customer_id);
        if (!customer) return null;
        return {
          id: job.id,
          customer_name: customer.name || "Unknown",
          mobile_number: customer.phone,
          google_review_link: googleReviewLink,
        };
      })
      .filter(Boolean);

    return json(result);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
