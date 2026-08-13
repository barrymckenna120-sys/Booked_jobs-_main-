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
  "id, organisation_id, customer_id, revenue, balance_due, deposit_paid, payment_status, paid_at, job_reference";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

  const loadOrgApiKey = async (organisationId: string): Promise<string | null> => {
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
      console.error(
        `sumup-payment-webhook: credentials unavailable for org ${organisationId}: ${creds.error ?? "unknown"}`,
      );
      return null;
    }
    return creds.credentials.apiKey;
  };

  /** Raw GET of a checkout. http === 0 means the request never completed. */
  const getCheckout = async (
    checkoutId: string,
    apiKey: string,
  ): Promise<{ http: number; data: any; error?: string }> => {
    let res: Response;
    try {
      res = await fetch(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(checkoutId)}`, {
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      });
    } catch (_e) {
      return { http: 0, data: null, error: `sumup_request_failed: ${(_e as Error).message}` };
    }
    const text = await res.text();
    if (!res.ok) {
      return { http: res.status, data: null, error: `sumup_http_${res.status}: ${text.slice(0, 200)}` };
    }
    try {
      return { http: res.status, data: JSON.parse(text) };
    } catch {
      return { http: res.status, data: null, error: "sumup_unparseable_response" };
    }
  };

  const url = new URL(req.url);
  const presentedSecret = url.searchParams.get("s") ?? req.headers.get("x-webhook-secret");
  const body = await req.text();

  const result = await handleSumUpWebhook({
    expectedSecret: Deno.env.get("SUMUP_WEBHOOK_SECRET"),
    presentedSecret,
    body,

    // Duplicate-delivery guard: sumup_webhook_events.checkout_id is UNIQUE, so
    // the insert fails for any callback SumUp re-delivers. Runs before the
    // paid_at stamp and before the notification write.
    claimEvent: async (e) => {
      const { error } = await supabase.from("sumup_webhook_events").insert({
        checkout_id: e.checkoutId,
        event_type: e.eventType,
        organisation_id: e.organisationId,
        service_call_id: e.serviceCallId,
      });
      if (!error) return true;
      // 23505 = unique violation = already processed.
      if ((error as { code?: string }).code === "23505") return false;
      console.error("sumup-payment-webhook: claim insert failed", error.message);
      // Unknown DB error: don't silently drop a real payment.
      return true;
    },

    /**
     * Idempotency layer 2 — has a DIFFERENT checkout on this same job already
     * produced a claimed webhook event? That is the only trustworthy "already
     * paid" signal; job.deposit_paid / payment_status are not (the New Job
     * wizard used to stamp deposit_paid with no payment behind it).
     *
     * Error buckets are explicit — nothing is swallowed:
     *   - query succeeded, empty result (data = [] / PGRST116 no rows) => false
     *   - anything else (network failure, 42501 permission denied, 42P01/42703
     *     undefined table/column, 42601/22P02 malformed query, unknown code)
     *     => throw, so the handler answers 500 and SumUp retries.
     */
    hasOtherClaimedEvent: async ({ serviceCallId, checkoutId }) => {
      let data: unknown[] | null = null;
      let error: { code?: string; message?: string } | null = null;
      try {
        const res = await supabase
          .from("sumup_webhook_events")
          .select("checkout_id")
          .eq("service_call_id", serviceCallId)
          .neq("checkout_id", checkoutId)
          .limit(1);
        data = res.data;
        error = res.error;
      } catch (_e) {
        // Transport-level failure (fetch/connection): never treat as "no rows".
        throw new Error(`prior_event_lookup_failed: ${(_e as Error)?.message ?? String(_e)}`);
      }

      if (error) {
        // PGRST116 = "no rows returned" from PostgREST — a successful empty read.
        if (error.code === "PGRST116") return false;
        throw new Error(`prior_event_lookup_failed: ${error.code ?? "unknown"} ${error.message ?? ""}`.trim());
      }

      return (data ?? []).length > 0;
    },



    loadJobByCheckoutId: async (checkoutId) => {

      const { data, error } = await supabase
        .from("service_calls")
        .select(JOB_COLUMNS)
        .eq("sumup_checkout_id", checkoutId)
        .maybeSingle();
      if (error) {
        console.error("sumup-payment-webhook: job lookup failed", error.message);
        return null;
      }
      return data ?? null;
    },

    // Fallback lookup by SumUp's checkout_reference (= service_calls.id), for
    // checkouts created outside this system that never stored their id.
    loadJobById: async (jobId) => {
      const { data, error } = await supabase
        .from("service_calls")
        .select(JOB_COLUMNS)
        .eq("id", jobId)
        .maybeSingle();
      if (error) {
        console.error("sumup-payment-webhook: job lookup by id failed", error.message);
        return null;
      }
      return data ?? null;
    },

    /**
     * Asks each SumUp-enabled tenant's own credentials which reference this
     * checkout carries. A tenant can only read its own checkouts, so the org
     * that succeeds is the owning org — the handler then cross-checks it against
     * the referenced job before writing anything.
     */
    discoverCheckout: async (checkoutId): Promise<SumUpCheckoutDiscovery> => {
      const { data, error } = await supabase
        .from("tenant_integrations")
        .select("organisation_id")
        .eq("integration_type", "sumup")
        .eq("is_active", true);

      if (error) {
        return { ok: false, error: `tenant_lookup_failed: ${error.message}` };
      }

      const orgIds = (data ?? [])
        .map((row: { organisation_id: string | null }) => row.organisation_id)
        .filter((id): id is string => !!id);

      let transient: string | null = null;

      for (const orgId of orgIds) {
        const apiKey = await loadOrgApiKey(orgId);
        if (!apiKey) continue;

        const res = await getCheckout(checkoutId, apiKey);
        if (res.data) {
          return {
            ok: true,
            reference: res.data.checkout_reference ?? null,
            organisationId: orgId,
          };
        }
        // 0 = network failure, 5xx = SumUp trouble → worth a retry.
        // 401/403/404 = this tenant simply does not own the checkout.
        if (res.http === 0 || res.http >= 500) transient = res.error ?? `sumup_http_${res.http}`;
      }

      if (transient) return { ok: false, error: transient };
      // Decided: no tenant here owns this checkout.
      return { ok: true, reference: null, organisationId: null };
    },

    // Authoritative re-read using the OWNING organisation's own credentials.
    fetchCheckout: async (checkoutId, organisationId): Promise<SumUpCheckoutView> => {
      const apiKey = await loadOrgApiKey(organisationId);
      if (!apiKey) return { ok: false, error: "credentials_unavailable" };

      const res = await getCheckout(checkoutId, apiKey);
      if (!res.data) return { ok: false, error: res.error ?? "sumup_no_data" };

      // A paid checkout carries a successful transaction; prefer its amount.
      const txn = Array.isArray(res.data?.transactions) ? res.data.transactions[0] : null;
      const amount = Number(txn?.amount ?? res.data?.amount ?? 0);

      return {
        ok: true,
        status: String(res.data?.status ?? ""),
        amount: Number.isFinite(amount) ? amount : 0,
        checkoutReference: res.data?.checkout_reference ?? null,
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

    // Office/admin users of the owning org get a bell notification, matching the
    // recipient rule used by the quote-accepted alert.
    notifyOffice: async (e) => {
      try {
        if (!e.organisationId) return;
        const { data: staff, error } = await supabase
          .from("profiles")
          .select("user_id, role")
          .eq("organisation_id", e.organisationId)
          .eq("is_active", true)
          .in("role", ["office", "admin"]);

        if (error) {
          console.error("sumup-payment-webhook: staff lookup failed", error.message);
          return;
        }

        const recipients = (staff ?? [])
          .map((r: { user_id: string | null }) => r.user_id)
          .filter((id): id is string => !!id);
        if (recipients.length === 0) return;

        const ref = e.jobReference ?? e.serviceCallId.slice(0, 8);
        const kind = e.fullyPaid ? "Payment received" : "Deposit received";

        let customerName: string | null = null;
        if (e.customerId) {
          const { data: cust } = await supabase
            .from("customers")
            .select("name")
            .eq("id", e.customerId)
            .maybeSingle();
          customerName = cust?.name ?? null;
        }

        await supabase.from("notifications").insert(
          recipients.map((userId) => ({
            recipient_user_id: userId,
            organisation_id: e.organisationId,
            job_id: e.serviceCallId,
            notification_type: "payment_collected",
            title: `${kind} — ${ref}`,
            body: `€${e.amount.toFixed(2)} paid by card (SumUp)${e.fullyPaid ? " — full payment" : " — deposit"} on ${ref}${customerName ? ` for ${customerName}` : ""}`,
            metadata: { source: "sumup", amount: e.amount, fully_paid: e.fullyPaid },
          })),
        );

      } catch (_e) {
        console.error("sumup-payment-webhook: notification insert failed", _e);
      }
    },

    // A declined/expired/cancelled checkout: same office/admin recipients as a
    // confirmed payment, but flagged as a failure so the link can be reissued.
    notifyPaymentFailed: async (e) => {
      try {
        if (!e.organisationId) return;

        // SumUp delivers the same failure event more than once. One alert per
        // checkout only; if the dedupe read fails we skip rather than duplicate.
        const { data: existing, error: dupErr } = await supabase
          .from("notifications")
          .select("id")
          .eq("job_id", e.serviceCallId)
          .eq("notification_type", "payment_failed")
          .eq("metadata->>checkout_id", e.checkoutId)
          .limit(1);
        if (dupErr) {
          console.error("sumup-payment-webhook: failure-alert dedupe read failed", dupErr.message);
          return;
        }
        if ((existing ?? []).length > 0) {
          console.log(`sumup-payment-webhook: failure alert already sent for checkout ${e.checkoutId}`);
          return;
        }

        const { data: staff, error } = await supabase
          .from("profiles")
          .select("user_id, role")
          .eq("organisation_id", e.organisationId)
          .eq("is_active", true)
          .in("role", ["office", "admin"]);

        if (error) {
          console.error("sumup-payment-webhook: staff lookup failed", error.message);
          return;
        }

        const recipients = (staff ?? [])
          .map((r: { user_id: string | null }) => r.user_id)
          .filter((id): id is string => !!id);
        if (recipients.length === 0) return;

        const ref = e.jobReference ?? e.serviceCallId.slice(0, 8);

        let customerName: string | null = null;
        if (e.customerId) {
          const { data: cust } = await supabase
            .from("customers")
            .select("name")
            .eq("id", e.customerId)
            .maybeSingle();
          customerName = cust?.name ?? null;
        }

        const amountText = e.amount && e.amount > 0 ? `€${e.amount.toFixed(2)} ` : "";
        const reason = e.status === "EXPIRED"
          ? "the payment link expired"
          : e.status === "CANCELLED" || e.status === "CANCELED"
          ? "the customer cancelled the payment"
          : "the card payment was declined";

        await supabase.from("notifications").insert(
          recipients.map((userId) => ({
            recipient_user_id: userId,
            organisation_id: e.organisationId,
            job_id: e.serviceCallId,
            role: "office",
            notification_type: "payment_failed",
            title: `Payment failed — ${ref}`,
            body: `${amountText}card payment on ${ref}${customerName ? ` for ${customerName}` : ""} did not go through — ${reason}. That payment link no longer works; send a new one.`,
            metadata: {
              source: "sumup",
              checkout_id: e.checkoutId,
              status: e.status,
              amount: e.amount,
            },
          })),
        );

        // SumUp delivers the same failure twice within ~100ms, so the read above
        // can't win the race — the unique index is the real guard. A 23505 here
        // means the other delivery already alerted, which is the correct outcome.
        if (insErr) {
          if (insErr.code === "23505") {
            console.log(`sumup-payment-webhook: failure alert already sent for checkout ${e.checkoutId} (raced)`);
          } else {
            console.error("sumup-payment-webhook: failure alert insert failed", insErr.message);
          }
          return;
        }
        console.log(`sumup-payment-webhook: failure alert sent for ${ref} (${e.status})`);
      } catch (_e) {
        console.error("sumup-payment-webhook: failure alert insert failed", _e);
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
