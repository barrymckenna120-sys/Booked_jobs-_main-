/**
 * SumUp payment confirmation webhook.
 *
 * Registered in SumUp as:
 *   https://<project>.supabase.co/functions/v1/sumup-payment-webhook?s=<SUMUP_WEBHOOK_SECRET>
 *
 * The body is a hint only — see _shared/sumupWebhook.ts for the trust model.
 * All decision logic lives in that shared, unit-tested module; this file is the
 * thin HTTP/DB adapter.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  handleSumUpWebhook,
  type SumUpCheckoutDiscovery,
  type SumUpCheckoutView,
} from "../_shared/sumupWebhook.ts";
import { resolveSumUpCredentials } from "../_shared/sumupCredentials.ts";

const JOB_COLUMNS =
  "id, organisation_id, customer_id, revenue, balance_due, deposit_paid, payment_status, paid_at";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const presentedSecret = url.searchParams.get("s") ?? req.headers.get("x-webhook-secret");
  const body = await req.text();

  const result = await handleSumUpWebhook({
    expectedSecret: Deno.env.get("SUMUP_WEBHOOK_SECRET"),
    presentedSecret,
    body,

    loadJobByCheckoutId: async (checkoutId) => {
      const { data, error } = await supabase
        .from("service_calls")
        .select(
          "id, organisation_id, customer_id, revenue, balance_due, deposit_paid, payment_status, paid_at",
        )
        .eq("sumup_checkout_id", checkoutId)
        .maybeSingle();
      if (error) {
        console.error("sumup-payment-webhook: job lookup failed", error.message);
        return null;
      }
      return data ?? null;
    },

    // Authoritative re-read using the OWNING organisation's own credentials.
    fetchCheckout: async (checkoutId, organisationId): Promise<SumUpCheckoutView> => {
      const creds = await resolveSumUpCredentials({
        organisationId,
        loadConfig: async (orgId) => {
          const { data, error } = await supabase
            .from("tenant_integrations")
            .select("config")
            .eq("organisation_id", orgId)
            .eq("integration_type", "sumup")
            .maybeSingle();
          if (error) throw new Error(error.message);
          const cfg = data?.config;
          return cfg && typeof cfg === "object" ? (cfg as Record<string, unknown>) : null;
        },
      });

      if (!creds.ok || !creds.credentials) {
        return { ok: false, error: creds.error ?? "credentials_unavailable" };
      }

      let res: Response;
      try {
        res = await fetch(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(checkoutId)}`, {
          headers: {
            Authorization: `Bearer ${creds.credentials.apiKey}`,
            "Content-Type": "application/json",
          },
        });
      } catch (_e) {
        return { ok: false, error: `sumup_request_failed: ${(_e as Error).message}` };
      }

      const text = await res.text();
      if (!res.ok) {
        return { ok: false, error: `sumup_http_${res.status}: ${text.slice(0, 200)}` };
      }

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        return { ok: false, error: "sumup_unparseable_response" };
      }

      // A paid checkout carries a successful transaction; prefer its amount.
      const txn = Array.isArray(data?.transactions) ? data.transactions[0] : null;
      const amount = Number(txn?.amount ?? data?.amount ?? 0);

      return {
        ok: true,
        status: String(data?.status ?? ""),
        amount: Number.isFinite(amount) ? amount : 0,
        checkoutReference: data?.checkout_reference ?? null,
      };
    },

    updateJob: async (jobId, patch) => {
      const { error } = await supabase.from("service_calls").update(patch).eq("id", jobId);
      if (error) {
        console.error("sumup-payment-webhook: update failed", error.message);
        return false;
      }
      return true;
    },

    logActivity: async (e) => {
      try {
        await supabase.from("customer_activity").insert({
          organisation_id: e.organisationId,
          customer_id: e.customerId,
          service_call_id: e.serviceCallId,
          event_type: "payment_received",
          event_label: `Payment received — €${e.amount} — Card (SumUp)${e.fullyPaid ? "" : " — deposit"}`,
          created_by: null,
        });
      } catch (_e) {
        console.error("sumup-payment-webhook: activity log failed", _e);
      }
    },

    logMessage: async (e) => {
      try {
        await supabase.from("message_log").insert({
          organisation_id: e.organisationId,
          customer_id: e.customerId,
          message_type: "sumup_payment_confirmed",
          channel: "system",
          direction: "inbound",
          content: `SumUp ${e.fullyPaid ? "payment" : "deposit"} of €${e.amount} confirmed`,
          status: "sent",
          related_id: e.serviceCallId,
          related_type: "service_call",
          sent_by: "sumup-webhook",
          sent_at: new Date().toISOString(),
        });
      } catch (_e) {
        console.error("sumup-payment-webhook: message log failed", _e);
      }
    },

    log: (level, message, detail) => {
      if (level === "error") console.error(message, detail ?? "");
      else console.log(message, detail ?? "");
    },
  });

  return json(
    { received: true, outcome: result.outcome, job_id: result.jobId ?? null },
    result.status,
  );
});
