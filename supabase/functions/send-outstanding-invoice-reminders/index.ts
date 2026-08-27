import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWhatsappApiKeyWithClient } from "../_shared/whatsappCredentials.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { assertSameOrganisation, isDenied, requireBoundOrg } from "../_shared/orgAuth.ts";
import { requireCustomerMessagingConsent } from "../_shared/messagingConsent.ts";

/**
 * Outstanding-invoice chase (WhatsApp + payment link).
 *
 * Highest-risk combination in the product: customer PII + financial data +
 * a payment link + outbound messaging. Order enforced here:
 *
 *   authenticate caller
 *   -> bind caller/machine to exactly one organisation (never body-trusted)
 *   -> query jobs scoped to that organisation
 *   -> per job: consent gate + prove job/customer share the organisation
 *   -> per-tenant payment link + per-tenant WhatsApp credentials
 *   -> claim the reminder slot (idempotency) -> send
 *
 * No cross-tenant fallback exists for the payment link, branding or WhatsApp
 * credentials: a tenant missing any of them is skipped and logged.
 */
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));

    // Gate + tenant binding. A signed-in user is scoped to their own
    // organisation; a machine caller must name an organisation AND be bound to
    // it (per-tenant webhook secret where configured).
    const access = await requireBoundOrg(req, {
      fnName: "send-outstanding-invoice-reminders",
      cors: corsHeaders,
      requestedOrgId: typeof body?.organisation_id === "string" ? body.organisation_id : null,
    });
    if (isDenied(access)) return access.error;
    const organisation_id = access.orgId;

    const now = Date.now();
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Outstanding invoices — scoped to the authorised organisation only.
    const { data: jobs, error: jobsErr } = await supabase
      .from("service_calls")
      .select(
        "id, organisation_id, balance_due, completed_at, invoiced_at, invoice_reminder_count, customer_id",
      )
      .eq("organisation_id", organisation_id)
      .eq("payment_status", "unpaid")
      .eq("payment_method", "invoice")
      .lt("invoice_reminder_count", 2)
      .gte("completed_at", sixtyDaysAgo)
      .lte("completed_at", fourteenDaysAgo)
      .not("completed_at", "is", null);

    if (jobsErr) return json({ error: "query_failed" }, 500);

    // 2. Tenant business details — single source of truth, no hardcoded branding.
    const { data: orgSettings } = await supabase
      .from("settings")
      .select("business_name, business_phone")
      .eq("organisation_id", organisation_id)
      .maybeSingle();

    const businessName = String((orgSettings as any)?.business_name ?? "").trim();
    const businessPhone = String((orgSettings as any)?.business_phone ?? "").trim();

    // 3. Payment link — this tenant's own configuration only.
    const { data: stripeIntegration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", organisation_id)
      .eq("integration_type", "stripe")
      .maybeSingle();

    const { data: messengerIntegration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", organisation_id)
      .eq("integration_type", "360messenger")
      .maybeSingle();

    const stripeLink = String(
      (stripeIntegration?.config as any)?.payment_link ??
        (messengerIntegration?.config as any)?.stripe_payment_link ??
        "",
    ).trim();

    // Pre-flight guards. Missing tenant configuration stops the batch before any
    // message is sent and before any reminder counter moves. There is deliberately
    // NO fallback to another tenant's payment link.
    const missing = !stripeLink
      ? "payment_link_not_configured"
      : !businessName
        ? "business_name_not_configured"
        : !businessPhone
          ? "business_phone_not_configured"
          : null;

    if (missing) {
      await supabase.from("edge_function_logs").insert({
        function_name: "send-outstanding-invoice-reminders",
        error_message: `Skipped: ${missing} for organisation`,
        payload: { organisation_id, reason: missing },
      });
      return json({ success: true, skipped: true, reason: missing, sent: 0 });
    }

    const keyRes = await fetchWhatsappApiKeyWithClient(supabase, organisation_id);
    if (!keyRes.apiKey) {
      console.error(
        `[send-outstanding-invoice-reminders] no WhatsApp key for org ${organisation_id} (${keyRes.resolution})`,
      );
      await supabase.from("edge_function_logs").insert({
        function_name: "send-outstanding-invoice-reminders",
        error_message: `Skipped: whatsapp_not_configured (${keyRes.resolution})`,
        payload: { organisation_id, reason: "whatsapp_not_configured" },
      });
      return json({ success: true, skipped: true, reason: "whatsapp_not_configured", sent: 0 });
    }
    const apiKey = keyRes.apiKey;

    let sent = 0;
    let skipped = 0;

    for (const j of jobs || []) {
      // Consent gate: loads the customer server-side, scoped to this org, honours
      // opted_out and returns the DB-stored recipient number.
      const consent = await requireCustomerMessagingConsent({
        fnName: "send-outstanding-invoice-reminders",
        orgId: organisation_id,
        customerId: (j as any).customer_id,
      });
      if (!consent.allowed) {
        skipped++;
        continue;
      }

      // Every participating record must share the organisation.
      const sameOrg = assertSameOrganisation(organisation_id, [
        { label: "job", orgId: (j as any).organisation_id },
      ]);
      if (!sameOrg.ok) {
        console.warn(`send-outstanding-invoice-reminders: ${sameOrg.detail} — job skipped`);
        skipped++;
        continue;
      }

      let phone = String(consent.phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
      if (phone.startsWith("0")) phone = "353" + phone.substring(1);

      const firstName = String(consent.name || "there").trim().split(/\s+/)[0];

      const invoiceDateRaw = (j as any).invoiced_at || (j as any).completed_at;
      let invoiceDate = "—";
      if (invoiceDateRaw) {
        const d = new Date(invoiceDateRaw);
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        invoiceDate = `${dd}/${mm}/${d.getFullYear()}`;
      }

      const balance = Number((j as any).balance_due || 0).toFixed(2);

      const message =
        `Hi ${firstName}, this is a friendly reminder from ${businessName} that you have an outstanding balance of €${balance} for work completed on ${invoiceDate}.\n\n` +
        `Pay securely here: ${stripeLink}\n\n` +
        `If you have already made payment please ignore this message. Any questions reply to this message.\n\n` +
        `${businessName} ☎️ ${businessPhone}`;

      // Idempotency: claim this reminder slot BEFORE sending, conditional on the
      // counter still holding the value we read. Two concurrent runs (or a retried
      // request) therefore cannot both chase the same invoice — the loser's
      // update matches no row and it skips.
      const currentCount = Number((j as any).invoice_reminder_count || 0);
      const claimPayload: Record<string, unknown> = {
        invoice_reminder_count: currentCount + 1,
      };
      if (currentCount === 0) {
        claimPayload.invoice_reminder_sent_at = new Date().toISOString();
      } else if (currentCount === 1) {
        claimPayload.invoice_reminder_2_sent_at = new Date().toISOString();
      }

      const { data: claimed } = await supabase
        .from("service_calls")
        .update(claimPayload)
        .eq("id", (j as any).id)
        .eq("organisation_id", organisation_id)
        .eq("invoice_reminder_count", currentCount)
        .select("id");

      if (!claimed || claimed.length === 0) {
        // Another run already claimed this invoice.
        skipped++;
        continue;
      }

      const formData = new FormData();
      formData.append("phonenumber", phone);
      formData.append("text", message);

      let ok = false;
      let responseBody = "";
      let responseStatus = 0;

      try {
        const resp = await fetch("https://api.360messenger.com/v2/sendMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });
        responseStatus = resp.status;
        responseBody = await resp.text();
        // 360Messenger may return HTTP 200 even when the payload reports failure.
        try {
          const parsed = JSON.parse(responseBody);
          ok = resp.ok && parsed?.success === true;
        } catch {
          ok = false;
        }
      } catch (_e) {
        ok = false;
      }

      try {
        const logResp = await fetch(`${supabaseUrl}/functions/v1/log-message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
            "x-make-secret": Deno.env.get("MAKE_WEBHOOK_SECRET") ?? "",
          },
          body: JSON.stringify({
            service_call_id: (j as any).id,
            organisation_id,
            customer_id: (j as any).customer_id,
            message_type: "outstanding_invoice",
            channel: "whatsapp",
            direction: "outbound",
            recipient_phone: phone,
            message_body: message,
            status: ok ? "success" : "fail",
          }),
        });
        if (!logResp.ok) {
          console.error("log-message returned", logResp.status);
        }
      } catch (_e) {
        console.error("log-message invoke failed");
      }

      if (ok) {
        sent++;
      } else {
        // Release the claim so a later run can retry this invoice.
        const rollback: Record<string, unknown> = { invoice_reminder_count: currentCount };
        if (currentCount === 0) rollback.invoice_reminder_sent_at = null;
        else if (currentCount === 1) rollback.invoice_reminder_2_sent_at = null;
        await supabase
          .from("service_calls")
          .update(rollback)
          .eq("id", (j as any).id)
          .eq("organisation_id", organisation_id);

        console.error("[send-outstanding-invoice-reminders] WhatsApp send failed", {
          service_call_id: (j as any).id,
          status: responseStatus,
          body: responseBody.slice(0, 300),
        });
        skipped++;
      }
    }

    return json({ success: true, organisation_id, sent, skipped });
  } catch (e) {
    console.error("send-outstanding-invoice-reminders error", e);
    return json({ error: "internal_error" }, 500);
  }
});
