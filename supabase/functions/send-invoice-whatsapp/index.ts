import { createClient } from "npm:@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { service_call_id } = await req.json();
    if (!service_call_id) return json({ error: "service_call_id is required" }, 400);

    // 1. Fetch job + customer
    const { data: job, error: jobErr } = await supabase
      .from("service_calls")
      .select("id, organisation_id, job_reference, invoice_number, invoiced_at, balance_due, customer_id")
      .eq("id", service_call_id)
      .single();

    if (jobErr || !job) return json({ error: "Job not found" }, 404);

    const { data: customer } = await supabase
      .from("customers")
      .select("name, phone, opted_out")
      .eq("id", job.customer_id)
      .single();

    if (!customer) return json({ error: "Customer not found" }, 404);

    // 2. Opt-out check
    if (customer.opted_out) {
      return json({ success: true, message: "Customer opted out" });
    }

    if (!customer.phone) return json({ error: "Customer has no phone number" }, 400);

    // 3. tenant_integrations: whatsapp config
    const { data: integration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", job.organisation_id)
      .eq("integration_type", "360messenger")
      .maybeSingle();

    const cfg = (integration?.config ?? {}) as Record<string, any>;
    const apiKey =
      cfg.api_key ||
      (cfg.api_key_secret ? Deno.env.get(cfg.api_key_secret) : null) ||
      Deno.env.get("THREESIXTY_API_KEY");
    if (!apiKey) return json({ error: "WhatsApp API key not configured for this organisation" }, 400);

    // 4. Org settings: branding + payment link + cert prefix
    const { data: orgSettings } = await supabase
      .from("settings")
      .select("business_name, business_phone, template_payment_link, cert_prefix")
      .eq("organisation_id", job.organisation_id)
      .maybeSingle();

    const businessName = orgSettings?.business_name || "K & N Gas Services";
    const businessPhone = orgSettings?.business_phone || "087 368 5252";
    const stripePaymentLink =
      orgSettings?.template_payment_link ||
      cfg.stripe_payment_link ||
      "https://buy.stripe.com/cNi8wIcUh5h65nfalMcQU0c";
    const certPrefix = orgSettings?.cert_prefix || "JOB";

    // 5. Normalise phone: strip +, leading 0 -> 353
    let phone = String(customer.phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
    if (phone.startsWith("0")) phone = "353" + phone.substring(1);

    // Format job ref (<prefix>-XXXXXX)
    const jobRef =
      job.job_reference ||
      `${certPrefix}-${(job.id || "").replace(/-/g, "").substring(0, 6).toUpperCase()}`;

    const invoiceNumber = job.invoice_number || "—";

    let invoiceDate = "—";
    if (job.invoiced_at) {
      const d = new Date(job.invoiced_at);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      invoiceDate = `${dd}/${mm}/${yyyy}`;
    }

    const balanceDue = `€${Number(job.balance_due || 0).toFixed(2)}`;

    // 6. Build message
    const message =
      `Hi ${customer.name}, please find your invoice from ${businessName}.\n\n` +
      `Job Ref: ${jobRef}\n` +
      `Invoice #: ${invoiceNumber}\n` +
      `Invoice Date: ${invoiceDate}\n` +
      `Balance Due: ${balanceDue}\n\n` +
      `Pay securely here: ${stripePaymentLink}\n\n` +
      `If you have any questions please reply to this message.\n\n` +
      `${businessName}\n☎️ ${businessPhone}`;


    // 7. POST to 360 Messenger
    const formData = new FormData();
    formData.append("phonenumber", phone);
    formData.append("text", message);

    const resp = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    const respText = await resp.text();
    const ok = resp.ok;

    // 8. Call log-message edge function
    try {
      await fetch(`${supabaseUrl}/functions/v1/log-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          service_call_id,
          organisation_id: job.organisation_id,
          message_type: "invoice_sent",
          recipient_phone: phone,
          message_body: message,
          status: ok ? "success" : "fail",
        }),
      });
    } catch (_e) {
      console.error("log-message invoke failed", _e);
    }

    if (!ok) {
      return json({ error: "Failed to send WhatsApp message", detail: respText }, 502);
    }

    // 9. Update service_calls.invoice_sent_at
    await supabase
      .from("service_calls")
      .update({ invoice_sent_at: new Date().toISOString() })
      .eq("id", service_call_id);

    // 10. Success
    return json({ success: true });
  } catch (e) {
    console.error("send-invoice-whatsapp error", e);
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});
