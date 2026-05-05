import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function normalisePhone(raw: string): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("353") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "353" + digits.slice(1);
  if (digits.length === 9) return "353" + digits;
  return digits;
}

async function sendWhatsApp(apiKey: string, phone: string, text: string) {
  const formData = new FormData();
  formData.append("phonenumber", phone);
  formData.append("text", text);
  const res = await fetch("https://api.360messenger.com/v2/sendMessage", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: formData,
  });
  const txt = await res.text();
  let json: any;
  try { json = JSON.parse(txt); } catch (_e) { json = { success: false, raw: txt }; }
  return { ok: res.ok, json, raw: txt, status: res.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const apiKey = Deno.env.get("THREESIXTY_API_KEY")!;

  const log = async (error_message: string | null, payload: unknown) => {
    try {
      await supabase.from("edge_function_logs").insert({
        function_name: "handle-inbound-whatsapp",
        error_message,
        payload,
      });
    } catch (_e) { /* best-effort */ }
  };

  try {
    const body = await req.json().catch(() => ({}));
    const msg = body?.messages?.[0];
    const fromRaw: string = msg?.from || "";
    const text: string = (msg?.text?.body || "").trim();

    if (!fromRaw || !text) {
      await log("Missing from or text in payload", body);
      return new Response(
        JSON.stringify({ success: false, error: "Missing from or text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const phone = normalisePhone(fromRaw);
    const upper = text.toUpperCase();

    // STOP — opt out customer (no service_call lookup required)
    if (upper === "STOP") {
      // Find customer by phone (try multiple formats)
      const { data: customer } = await supabase
        .from("customers")
        .select("id, name, phone")
        .or(`phone.eq.${phone},phone.eq.+${phone},phone.eq.0${phone.slice(3)}`)
        .limit(1)
        .maybeSingle();

      if (customer) {
        await supabase
          .from("customers")
          .update({ opted_out: true })
          .eq("id", customer.id);
      }

      const reply = `You've been unsubscribed from K & N Gas Services messages. To re-subscribe call us on 087 3686252.`;
      const sendRes = await sendWhatsApp(apiKey, phone, reply);
      await log(sendRes.ok ? null : `STOP reply failed: ${sendRes.raw.substring(0, 300)}`, {
        from: phone, text, action: "stop", customer_id: customer?.id || null,
      });

      return new Response(
        JSON.stringify({ success: true, action: "stop" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CONFIRM / CANCEL — need a recent service_call
    if (upper !== "CONFIRM" && upper !== "CANCEL") {
      await log(`Unrecognised reply: "${text}"`, { from: phone, text });
      return new Response(
        JSON.stringify({ success: true, action: "ignored", reason: "unrecognised_reply" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find customer by phone
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, name, phone")
      .or(`phone.eq.${phone},phone.eq.+${phone},phone.eq.0${phone.slice(3)}`)
      .limit(1)
      .maybeSingle();

    if (custErr) throw custErr;
    if (!customer) {
      await log(`No customer matched phone ${phone}`, { from: phone, text });
      return new Response(
        JSON.stringify({ success: false, error: "Customer not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Most recent service_call for this customer that received a 2-day reminder
    const { data: job, error: jobErr } = await supabase
      .from("service_calls")
      .select("id, status, scheduled_date, time_block, organisation_id")
      .eq("customer_id", customer.id)
      .eq("reminder_2day_sent", true)
      .not("status", "in", '("Completed","Cancelled")')
      .order("scheduled_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (jobErr) throw jobErr;
    if (!job) {
      await log(`No active reminded job for ${customer.name}`, { from: phone, text, customer_id: customer.id });
      return new Response(
        JSON.stringify({ success: false, error: "No matching service call" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fullName = customer.name || "Customer";

    if (upper === "CONFIRM") {
      await supabase
        .from("service_calls")
        .update({ confirmed: true, confirmed_at: new Date().toISOString() })
        .eq("id", job.id);

      const reply = `Thanks ${fullName}, your appointment is confirmed. See you then! K & N Gas Services ☎ 087 3686252`;
      const sendRes = await sendWhatsApp(apiKey, phone, reply);

      await log(sendRes.ok ? null : `CONFIRM reply failed: ${sendRes.raw.substring(0, 300)}`, {
        from: phone, text, action: "confirm", service_call_id: job.id, customer_id: customer.id, customer_name: fullName,
      });

      try {
        await supabase.from("customer_activity").insert({
          organisation_id: job.organisation_id,
          customer_id: customer.id,
          service_call_id: job.id,
          event_type: "whatsapp_received",
          event_label: "WhatsApp received — Appointment Confirmed",
        });
      } catch (_e) { /* non-critical */ }

      return new Response(
        JSON.stringify({ success: true, action: "confirm", service_call_id: job.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CANCEL
    await supabase
      .from("service_calls")
      .update({ status: "Cancelled", cancellation_reason: "Customer cancelled via WhatsApp" })
      .eq("id", job.id);

    const reply = `Thanks ${fullName}, your appointment has been cancelled. To rebook call us on 087 3686252. K & N Gas Services`;
    const sendRes = await sendWhatsApp(apiKey, phone, reply);

    await log(sendRes.ok ? null : `CANCEL reply failed: ${sendRes.raw.substring(0, 300)}`, {
      from: phone, text, action: "cancel", service_call_id: job.id, customer_id: customer.id, customer_name: fullName,
    });

    try {
      await supabase.from("customer_activity").insert({
        organisation_id: job.organisation_id,
        customer_id: customer.id,
        service_call_id: job.id,
        event_type: "whatsapp_received",
        event_label: "WhatsApp received — Appointment Cancelled",
      });
    } catch (_e) { /* non-critical */ }

    return new Response(
      JSON.stringify({ success: true, action: "cancel", service_call_id: job.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    await log(m, null);
    return new Response(
      JSON.stringify({ success: false, error: m }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
