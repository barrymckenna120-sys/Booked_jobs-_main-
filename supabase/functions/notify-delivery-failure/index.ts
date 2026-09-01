// Office Manager alert for a failed customer communication.
//
// Machine-only: called by _shared/deliveryStatus.ts (service role) immediately
// after a send attempt is recorded as failed. Dedupe is keyed on the attempt
// row (alert_sent_at), so a retried event can never double-email.
//
// Never surfaces the raw provider error — office staff get the human reason and
// a deep link into the record so they can resend.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  buildAdminEmailHtml,
  resolveOrgAdminEmails,
  sendAdminEmail,
} from "../_shared/notifyOrgAdmins.ts";

const TYPE_TOGGLE: Record<string, string> = {
  quote: "delivery_alerts_quotes",
  invoice: "delivery_alerts_invoices",
  receipt: "delivery_alerts_receipts",
  service_reminder: "delivery_alerts_service_reminders",
};

const TYPE_LABEL: Record<string, string> = {
  quote: "Quote",
  invoice: "Invoice",
  receipt: "Receipt",
  service_reminder: "Service reminder",
};

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  // Machine caller only.
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer || bearer !== serviceKey) {
    return json({ error: "Forbidden" }, 403);
  }

  try {
    const { attempt_id } = await req.json();
    if (!attempt_id || typeof attempt_id !== "string") {
      return json({ error: "attempt_id is required" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: attempt } = await supabase
      .from("communication_delivery_attempts")
      .select(
        "id, delivery_id, organisation_id, outcome, failure_reason_public, alert_sent_at, attempt_number",
      )
      .eq("id", attempt_id)
      .maybeSingle();

    if (!attempt) return json({ error: "Attempt not found" }, 404);
    if (attempt.outcome !== "failed") return json({ skipped: "not_failed" });
    if (attempt.alert_sent_at) return json({ skipped: "already_alerted" });

    const { data: delivery } = await supabase
      .from("communication_deliveries")
      .select(
        "id, organisation_id, comm_type, channel, related_type, related_id, related_reference, customer_id, recipient",
      )
      .eq("id", attempt.delivery_id)
      .maybeSingle();

    if (!delivery || delivery.organisation_id !== attempt.organisation_id) {
      return json({ error: "Delivery not found" }, 404);
    }

    const { data: settings } = await supabase
      .from("settings")
      .select("*")
      .eq("organisation_id", delivery.organisation_id)
      .maybeSingle();

    if (settings && settings.delivery_failure_alerts_enabled === false) {
      return json({ skipped: "alerts_disabled" });
    }

    const toggle = TYPE_TOGGLE[delivery.comm_type];
    if (settings && toggle && settings[toggle] === false) {
      return json({ skipped: "type_disabled" });
    }

    // Hourly mode: at most one alert email per org per hour.
    if (settings?.delivery_failure_alert_mode === "hourly") {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("communication_delivery_attempts")
        .select("id")
        .eq("organisation_id", delivery.organisation_id)
        .not("alert_sent_at", "is", null)
        .gte("alert_sent_at", since)
        .limit(1);
      if (recent && recent.length > 0) {
        await supabase
          .from("communication_delivery_attempts")
          .update({ alert_sent_at: new Date().toISOString() })
          .eq("id", attempt.id);
        return json({ skipped: "hourly_window" });
      }
    }

    let customerName = "Customer";
    if (delivery.customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("name")
        .eq("id", delivery.customer_id)
        .maybeSingle();
      if (customer?.name) customerName = customer.name;
    }

    const explicit = String(settings?.delivery_failure_alert_email ?? "").trim();
    const recipients = explicit
      ? explicit.split(",").map((e: string) => e.trim().toLowerCase()).filter(Boolean)
      : await resolveOrgAdminEmails(supabase, delivery.organisation_id);

    const typeLabel = TYPE_LABEL[delivery.comm_type] ?? "Message";
    const channelLabel = delivery.channel === "whatsapp" ? "WhatsApp" : delivery.channel === "email" ? "Email" : "SMS";
    const businessName = settings?.business_name?.trim() || "BookedJobs";

    const html = buildAdminEmailHtml({
      title: `${typeLabel} not delivered`,
      heading: `${typeLabel} not delivered`,
      intro:
        `A ${typeLabel.toLowerCase()} for ${customerName} could not be delivered by ${channelLabel}. ` +
        `Open the record in ${businessName} to check the customer's details and resend.`,
      rows: [
        ["Customer", customerName],
        ["Type", `${typeLabel} (${channelLabel})`],
        ["Reference", delivery.related_reference || "—"],
        ["Reason", attempt.failure_reason_public || "Message could not be delivered"],
        ["Attempts", String(attempt.attempt_number)],
      ],
    });

    const result = await sendAdminEmail({
      subject: `${typeLabel} not delivered — ${customerName}`,
      html,
      recipients,
    });

    await supabase
      .from("communication_delivery_attempts")
      .update({ alert_sent_at: new Date().toISOString() })
      .eq("id", attempt.id);

    return json({ success: true, emailed: result.ok, recipients: recipients.length });
  } catch (e) {
    console.error("notify-delivery-failure error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
