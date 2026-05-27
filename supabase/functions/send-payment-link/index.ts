import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { service_call_id, invoice_pdf_url } = await req.json();

    if (!service_call_id) {
      console.log("send-payment-link 400: missing service_call_id");
      return new Response(JSON.stringify({ error: "service_call_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch job + customer
    const { data: job, error: jobErr } = await supabase
      .from("service_calls")
      .select("id, revenue, deposit_amount, deposit_required, balance_due, payment_link, customer_id, user_id, organisation_id, job_type, invoice_number")
      .eq("id", service_call_id)
      .single();

    if (jobErr || !job) {
      console.log("send-payment-link 404: job not found", { service_call_id, jobErr: jobErr?.message });
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: customer } = await supabase
      .from("customers")
      .select("name, phone")
      .eq("id", job.customer_id)
      .single();

    if (!customer?.phone) {
      console.log("send-payment-link 400: customer has no phone", { customer_id: job.customer_id });
      return new Response(JSON.stringify({ error: "Customer has no phone number" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let paymentLink = job.payment_link;
    if (!paymentLink) {
      const { data: stripeIntegration } = await supabase
        .from("tenant_integrations")
        .select("config")
        .eq("organisation_id", job.organisation_id)
        .eq("integration_type", "stripe")
        .maybeSingle();
      paymentLink = (stripeIntegration?.config as any)?.stripe_payment_link
        || (stripeIntegration?.config as any)?.payment_link
        || null;
    }
    if (!paymentLink) {
      console.log("send-payment-link 400: no payment link", { service_call_id, organisation_id: job.organisation_id });
      return new Response(JSON.stringify({ error: "No payment link set on this job or organisation. Add a payment link first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jobTotal = job.revenue || 0;
    const depositAmount = job.deposit_required ? (job.deposit_amount || 0) : 0;
    const balanceDue = job.balance_due || (jobTotal - depositAmount) || jobTotal;

    if (balanceDue <= 0) {
      console.log("send-payment-link 400: no balance due", { service_call_id, balanceDue });
      return new Response(JSON.stringify({ error: "No balance due on this job" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Per-tenant 360Messenger API key (config.api_key → config.api_key_secret env → THREESIXTY_API_KEY)
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
    if (!apiKey) {
      console.log("send-payment-link 400: no API key", { organisation_id: job.organisation_id });
      return new Response(JSON.stringify({ error: "WhatsApp API key not configured for this organisation" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const total = job.revenue || 0;
    const depositAmount = job.deposit_required ? (job.deposit_amount || 0) : 0;
    const balanceDue = job.balance_due || (total - depositAmount) || total;

    let message = `Hi ${customer.name}, please find your invoice attached for ${job.job_type || "your job"}.\n\nTotal: €${total.toFixed(2)}\n\nDeposit paid: €${depositAmount.toFixed(2)}\n\nBalance due: €${balanceDue.toFixed(2)}\n\nInvoice ref: ${job.invoice_number || "N/A"}\n\nPayment due within 14 days.`;

    if (invoice_pdf_url) {
      message += `\n\n📄 View invoice:\n${invoice_pdf_url}`;
    }

    message += `\n\n💳 Pay now:\n${paymentLink}`;

    if (footer) {
      message += `\n\nThank you, ${footer}`;
    }

    // Send via 360Messenger
    const cleanNumber = customer.phone.replace(/^\+/, "");
    const formData = new FormData();
    formData.append("phonenumber", cleanNumber);
    formData.append("text", message);

    // Log to message_log
    const { data: logRows } = await supabase.from("message_log").insert({
      channel: "whatsapp",
      message_type: "payment_link",
      customer_id: job.customer_id,
      related_id: service_call_id,
      related_type: "service_call",
      content: message,
      sent_by: "system",
      status: "pending",
      direction: "outbound",
    }).select("id");

    const logId = Array.isArray(logRows) ? logRows[0]?.id : null;

    const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    const resultText = await response.text();
    let result: any;
    try { result = JSON.parse(resultText); } catch { result = { success: false }; }

    // Update message log
    if (logId) {
      const updateBody = result.success
        ? { status: "sent", sent_at: new Date().toISOString() }
        : { status: "failed", error_message: `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}` };

      await supabase.from("message_log").update(updateBody).eq("id", logId);
    }

    if (!result.success) {
      await supabase.from("edge_function_logs").insert({
        function_name: "send-payment-link",
        error_message: `360Messenger API failed. HTTP ${response.status}`,
        payload: { sent_to: cleanNumber, service_call_id },
      });

      return new Response(JSON.stringify({ success: false, error: "WhatsApp send failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log customer activity
    try {
      await supabase.from("customer_activity").insert({
        organisation_id: job.organisation_id,
        customer_id: job.customer_id,
        service_call_id: service_call_id,
        event_type: "whatsapp_sent",
        event_label: "WhatsApp sent — Payment Link",
      });
    } catch { /* non-critical */ }

    return new Response(JSON.stringify({
      success: true,
      payment_link: paymentLink,
      customer_name: customer.name,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-payment-link error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
