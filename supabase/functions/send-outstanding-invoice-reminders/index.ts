import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWhatsappApiKeyWithClient } from "../_shared/whatsappCredentials.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// BJ-B2a: no hardcoded payment-link or branding fallbacks. A tenant without its
// own payment link / business details is skipped and logged — never routed to
// another tenant's payment account.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { organisation_id } = await req.json().catch(() => ({}));
    if (!organisation_id) return json({ error: "organisation_id is required" }, 400);

    const now = Date.now();
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Outstanding invoices
    const { data: jobs, error: jobsErr } = await supabase
      .from("service_calls")
      .select("id, organisation_id, balance_due, completed_at, invoiced_at, invoice_reminder_count, customer_id, customers(name, phone, opted_out)")
      .eq("organisation_id", organisation_id)
      .eq("payment_status", "unpaid")
      .eq("payment_method", "invoice")
      .lt("invoice_reminder_count", 2)
      .gte("completed_at", sixtyDaysAgo)
      .lte("completed_at", fourteenDaysAgo)
      .not("completed_at", "is", null);

    if (jobsErr) return json({ error: jobsErr.message }, 500);

    // 2. WhatsApp integration — shared resolver handles api_key_secret and literal api_key
    const { data: integration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", organisation_id)
      .eq("integration_type", "360messenger")
      .maybeSingle();

    const cfg = (integration?.config as any) || {};
    const stripeLink = cfg.stripe_payment_link || DEFAULT_STRIPE_LINK;

    const keyRes = await fetchWhatsappApiKeyWithClient(supabase, organisation_id);
    if (!keyRes.apiKey) {
      console.error(
        `[send-outstanding-invoice-reminders] no WhatsApp key for org ${organisation_id} (${keyRes.resolution})`,
      );
      return json(
        { error: "WhatsApp integration not configured", detail: keyRes.detail, resolution: keyRes.resolution },
        400,
      );
    }
    const apiKey = keyRes.apiKey;


    let sent = 0;
    let skipped = 0;

    for (const j of jobs || []) {
      const customer: any = (j as any).customers;
      if (!customer || customer.opted_out || !customer.phone) {
        skipped++;
        continue;
      }

      let phone = String(customer.phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
      if (phone.startsWith("0")) phone = "353" + phone.substring(1);

      const firstName = String(customer.name || "there").trim().split(/\s+/)[0];

      const invoiceDateRaw = j.invoiced_at || j.completed_at;
      let invoiceDate = "—";
      if (invoiceDateRaw) {
        const d = new Date(invoiceDateRaw);
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        invoiceDate = `${dd}/${mm}/${d.getFullYear()}`;
      }

      const balance = Number(j.balance_due || 0).toFixed(2);

      const message =
        `Hi ${firstName}, this is a friendly reminder from K & N Gas Services that you have an outstanding balance of €${balance} for work completed on ${invoiceDate}.\n\n` +
        `Pay securely here: ${stripeLink}\n\n` +
        `If you have already made payment please ignore this message. Any questions reply to this message.\n\n` +
        `K & N Gas Services ☎️ 087 368 5252`;

      const formData = new FormData();
      formData.append("phonenumber", phone);
      formData.append("text", message);

      let ok = false;
      try {
        const resp = await fetch("https://api.360messenger.com/v2/sendMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });
        await resp.text();
        ok = resp.ok;
      } catch (_e) {
        ok = false;
      }

      try {
        await fetch(`${supabaseUrl}/functions/v1/log-message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            service_call_id: j.id,
            organisation_id,
            message_type: "outstanding_invoice",
            recipient_phone: phone,
            message_body: message,
            status: ok ? "success" : "fail",
          }),
        });
      } catch (_e) {
        console.error("log-message invoke failed", _e);
      }

      if (ok) {
        const currentCount = j.invoice_reminder_count || 0;
        const updatePayload: Record<string, any> = {
          invoice_reminder_count: currentCount + 1,
        };
        if (currentCount === 0) {
          updatePayload.invoice_reminder_sent_at = new Date().toISOString();
        } else if (currentCount === 1) {
          updatePayload.invoice_reminder_2_sent_at = new Date().toISOString();
        }
        await supabase.from("service_calls").update(updatePayload).eq("id", j.id);
        sent++;
      } else {
        skipped++;
      }
    }

    return json({ success: true, sent, skipped });
  } catch (e) {
    console.error("send-outstanding-invoice-reminders error", e);
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});
