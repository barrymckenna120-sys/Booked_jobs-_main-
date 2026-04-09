import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const messengerKey = Deno.env.get("MESSENGER_API_KEY");

    if (!messengerKey) throw new Error("MESSENGER_API_KEY is not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { quote_id, service_call_id, customer_id, total_amount, line_items } = body;

    if (!quote_id || !service_call_id || !customer_id) {
      return new Response(JSON.stringify({ error: "quote_id, service_call_id, and customer_id are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch customer
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("name, phone, opted_out")
      .eq("id", customer_id)
      .single();

    if (custErr || !customer) {
      return new Response(JSON.stringify({ error: "Customer not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (customer.opted_out) {
      return new Response(JSON.stringify({ success: false, error: "Customer has opted out of messages" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!customer.phone) {
      return new Response(JSON.stringify({ error: "Customer has no phone number" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get payment link from service_calls or use fallback
    const { data: job } = await supabase
      .from("service_calls")
      .select("payment_link, user_id")
      .eq("id", service_call_id)
      .single();

    const paymentLink = job?.payment_link || "https://buy.stripe.com/cNi8wIcUh5h65nfalMcQU0c";
    const userId = job?.user_id;

    // Build line items summary
    const itemsSummary = (line_items || [])
      .map((li: any) => `• ${li.description} (x${li.quantity}) — €${Number(li.line_total).toFixed(2)}`)
      .join("\n");

    const amount = Number(total_amount).toFixed(2);

    const message = `Hi ${customer.name},

Your engineer has identified some additional work required during your service today with K & N Gas Services.

Additional work:
${itemsSummary}
Amount due: €${amount}

To approve and pay securely tap here:
${paymentLink}

If you have any questions please call us on 087 3686252.

K & N Gas Services ☎ 087 3686252`;

    // Send via 360Messenger
    const cleanNumber = customer.phone.replace(/^\+/, "");
    const formData = new FormData();
    formData.append("phone_number", cleanNumber);
    formData.append("text", message);

    // Log to message_log
    const { data: logRows } = await supabase.from("message_log").insert({
      channel: "whatsapp",
      message_type: "extra_work_payment",
      customer_id,
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
      headers: { Authorization: `Bearer ${messengerKey}` },
      body: formData,
    });

    const resultText = await response.text();
    let result: any;
    try { result = JSON.parse(resultText); } catch (_e) { result = { success: false }; }

    // Update message log
    if (logId) {
      const updateBody = result.success
        ? { status: "sent", sent_at: new Date().toISOString() }
        : { status: "failed", error_message: `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}` };
      await supabase.from("message_log").update(updateBody).eq("id", logId);
    }

    if (!result.success) {
      await supabase.from("edge_function_logs").insert({
        function_name: "send-extrawork-payment-link",
        error_message: `360Messenger API failed. HTTP ${response.status}`,
        payload: { sent_to: cleanNumber, quote_id, service_call_id },
      });

      return new Response(JSON.stringify({ success: false, error: "WhatsApp send failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update quote status to Sent
    await supabase.from("quotes").update({ status: "Sent", sent_at: new Date().toISOString() } as any).eq("id", quote_id);

    return new Response(JSON.stringify({
      success: true,
      customer_name: customer.name,
      payment_link: paymentLink,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-extrawork-payment-link error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
