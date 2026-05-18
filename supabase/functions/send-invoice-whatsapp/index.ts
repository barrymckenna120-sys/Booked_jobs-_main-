import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { service_call_id } = await req.json();
    if (!service_call_id) return json({ error: "service_call_id is required" }, 400);

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

    if (customer.opted_out) {
      return json({ success: true, message: "Customer opted out" });
    }

    if (!customer.phone) return json({ error: "Customer has no phone number" }, 400);

    // tenant_integrations: whatsapp
    const { data: integration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", job.organisation_id)
      .eq("integration_type", "whatsapp")
      .maybeSingle();

    const apiKey = integration?.config?.api_key || Deno.env.get("THREESIXTY_API_KEY");
    if (!apiKey) return json({ error: "WhatsApp API key not configured" }, 400);

    const stripePaymentLink =
      integration?.config?.stripe_payment_link ||
      "https://buy.stripe.com/cNi8wIcUh5h65nfalMcQU0c";

    // Format job ref as KN-XXXXXX
    const jobRef =
      job.job_reference ||
      `KN-${(job.id || "").replace(/-/g, "").substring(0, 6).toUpperCase()}`;

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

    const message =
      `Hi ${customer.name}, please find your invoice from K & N Gas Services.\n\n` +
      `Job Ref: ${jobRef}\n` +
      `Invoice #: ${invoiceNumber}\n` +
      `Invoice Date: ${invoiceDate}\n` +
      `Balance Due: ${balanceDue}\n\n` +
      `Pay securely here: ${stripePaymentLink}\n\n` +
      `If you have any questions please reply to this message.\n\n` +
      `K&N Gas Services\n☎️ 087 368 5252`;

    // Normalise phone: strip +, leading 0 -> 353
    let phone = String(customer.phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
    if (phone.startsWith("0")) phone = "353" + phone.substring(1);

    // Send via 360 Messenger
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

    // Log
    try {
      await supabase.from("message_log").insert({
        organisation_id: job.organisation_id,
        customer_id: job.customer_id,
        message_type: "invoice",
        content: message,
        status: ok ? "sent" : "failed",
        channel: "whatsapp",
        direction: "outbound",
        related_type: "service_call",
        related_id: job.id,
        sent_at: new Date().toISOString(),
        error_message: ok ? null : respText,
      });
    } catch (_e) {
      console.error("message_log insert failed", _e);
    }

    if (!ok) {
      return json({ error: "Failed to send WhatsApp message", detail: respText }, 502);
    }

    return json({ success: true, customer_name: customer.name, phone });
  } catch (e) {
    console.error("send-invoice-whatsapp error", e);
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});
