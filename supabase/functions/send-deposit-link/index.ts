/**
 * Sends the deposit payment link for a job the caller's organisation owns.
 *
 * verify_jwt = true. The caller's organisation is resolved server-side via
 * get_my_org_id(); the job's organisation must match BEFORE anything is read
 * or written, and a mismatch is reported as not-found so we never reveal that
 * a job exists under another tenant.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendDepositLink } from "../_shared/depositLink.ts";
import { resolveSumUpCredentials, makeRestSumUpConfigLoader } from "../_shared/sumupCredentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ success: false, error: "unauthorized" }, 401);
    }

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body */ }
    const serviceCallId = typeof body.service_call_id === "string" ? body.service_call_id.trim() : "";
    if (!serviceCallId) {
      return json({ success: false, error: "service_call_id is required" }, 400);
    }

    // Caller identity + organisation, derived server-side. Never from the body.
    const asCaller = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
          ...(req.headers.get("x-org-impersonation-token")
            ? { "x-org-impersonation-token": req.headers.get("x-org-impersonation-token")! }
            : {}),
        },
      },
    });

    const { data: userData, error: userErr } = await asCaller.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ success: false, error: "unauthorized" }, 401);
    }

    const { data: callerOrg, error: orgErr } = await asCaller.rpc("get_my_org_id");
    if (orgErr || !callerOrg) {
      console.error("send-deposit-link: could not resolve caller organisation", orgErr?.message);
      return json({ success: false, error: "organisation_not_resolved" }, 403);
    }
    const callerOrgId = callerOrg as string;

    const headers = {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    };

    // Tenant check FIRST — before reading amounts or touching SumUp.
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/service_calls?id=eq.${serviceCallId}` +
        `&select=id,organisation_id,customer_id,deposit_amount,payment_link,sumup_checkout_id&limit=1`,
      { headers },
    );
    const jobRows = await jobRes.json();
    const job = Array.isArray(jobRows) ? jobRows[0] : null;

    if (!job || job.organisation_id !== callerOrgId) {
      // Same response either way — never leak existence under another tenant.
      console.log("send-deposit-link: job not found for caller organisation", {
        service_call_id: serviceCallId,
        caller_organisation_id: callerOrgId,
      });
      return json({ success: false, error: "not_found" }, 404);
    }

    const depositAmount = Number(job.deposit_amount || 0);
    if (!(depositAmount > 0)) {
      return json({ success: true, skipped: "no_deposit_amount" });
    }

    // Duplicate-submit guard: if this job already has a pending SumUp checkout,
    // do not create a second one.
    if (job.sumup_checkout_id) {
      const pending = await isCheckoutPending(
        supabaseUrl,
        headers,
        callerOrgId,
        String(job.sumup_checkout_id),
      );
      if (pending) {
        console.log("send-deposit-link: pending checkout already exists", {
          service_call_id: serviceCallId,
          sumup_checkout_id: job.sumup_checkout_id,
        });
        return json({
          success: true,
          skipped: "checkout_already_pending",
          payment_link: job.payment_link ?? null,
        });
      }
    }

    const result = await sendDepositLink({
      supabaseUrl,
      headers,
      service_call_id: serviceCallId,
      deposit_amount: depositAmount,
      customer_id: job.customer_id ?? null,
      organisation_id: callerOrgId,
    });

    return json({
      success: result.ok,
      sent: result.sent ?? false,
      skipped: result.skipped ?? null,
      payment_link: result.paymentLink ?? null,
      error: result.error ?? null,
    }, result.ok || result.skipped ? 200 : 502);
  } catch (e) {
    console.error("send-deposit-link error:", e);
    return json({ success: false, error: (e as Error).message }, 500);
  }
});

/**
 * True when the stored checkout is still awaiting payment. Any lookup failure
 * returns true (treat as pending) so a transient SumUp error can never cause a
 * second checkout for the same job.
 */
async function isCheckoutPending(
  supabaseUrl: string,
  headers: Record<string, string>,
  orgId: string,
  checkoutId: string,
): Promise<boolean> {
  const creds = await resolveSumUpCredentials({
    organisationId: orgId,
    loadConfig: makeRestSumUpConfigLoader(supabaseUrl, headers),
  });
  if (!creds.ok || !creds.credentials) return false;

  try {
    const res = await fetch(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(checkoutId)}`, {
      headers: { Authorization: `Bearer ${creds.credentials.apiKey}` },
    });
    if (res.status === 404) return false;
    if (!res.ok) {
      console.error("send-deposit-link: checkout lookup failed", res.status);
      return true;
    }
    const data = await res.json();
    const status = String(data?.status ?? "").toUpperCase();
    return status === "PENDING";
  } catch (e) {
    console.error("send-deposit-link: checkout lookup threw", (e as Error).message);
    return true;
  }
}
