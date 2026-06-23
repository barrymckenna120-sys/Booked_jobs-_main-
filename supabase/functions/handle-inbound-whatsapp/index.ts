import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id",
};

function normalisePhone(raw: string, countryCode = "353"): string {
  let digits = (raw || "").replace(/\D/g, "");
  const ccLen = countryCode.length;
  if (countryCode && digits.startsWith(countryCode) && digits.length === 9 + ccLen) return digits;
  if (digits.startsWith("0") && digits.length === 10) return countryCode + digits.slice(1);
  if (digits.length === 9) return countryCode + digits;
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
        JSON.stringify({ success: true, action: "ignored", reason: "missing_fields" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initial normalisation uses default country code for customer lookup
    const phone = normalisePhone(fromRaw);
    const upper = text.toUpperCase();

    console.log(`[inbound-webhook] received from=${fromRaw} text="${text}"`);

    // Always look up customer first (used for both STOP and other replies)
    const { data: matchedCustomer } = await supabase
      .from("customers")
      .select("id, name, phone, organisation_id")
      .or(`phone.eq.${phone},phone.eq.+${phone},phone.eq.0${phone.slice(3)}`)
      .limit(1)
      .maybeSingle();

    console.log(`[inbound-webhook] customer matched: ${matchedCustomer?.id || "none"} (phone=${phone})`);

    // ALWAYS persist inbound message to history first — including STOP, START, CANCEL, etc.
    const inboundAt = new Date().toISOString();
    if (matchedCustomer?.organisation_id) {
      try {
        await supabase.from("whatsapp_messages").insert({
          organisation_id: matchedCustomer.organisation_id,
          customer_id: matchedCustomer.id,
          message_body: text,
          message_type: "Inbound Reply",
          sent_by: "customer",
          status: "Received",
          customer_reply: text,
          reply_received_at: inboundAt,
          sent_at: inboundAt,
          phone_number: phone,
        });
        await supabase.from("message_log").insert({
          organisation_id: matchedCustomer.organisation_id,
          customer_id: matchedCustomer.id,
          message_type: "inbound",
          channel: "whatsapp",
          direction: "inbound",
          content: text,
          status: "received",
          sent_by: "customer",
          sent_at: inboundAt,
        });
        console.log(`[inbound-webhook] inbound message saved for customer ${matchedCustomer.id}`);
      } catch (e) {
        console.error("[inbound-webhook] failed to persist inbound message:", e);
      }
    }

    // STOP — opt out customer (no service_call lookup required)
    if (upper === "STOP" || upper === "UNSUBSCRIBE") {
      console.log(`[inbound-webhook] STOP detected for customer ${matchedCustomer?.id || "none"}`);

      if (matchedCustomer) {
        const { error: optErr } = await supabase
          .from("customers")
          .update({
            opted_out: true,
            opted_out_date: inboundAt,
            whatsapp_reminders_enabled: false,
            whatsapp_opt_in: false,
            whatsapp_opt_out_at: inboundAt,
            whatsapp_opt_out_source: "STOP reply",
          })
          .eq("id", matchedCustomer.id);
        if (optErr) console.error("[inbound-webhook] opt-out update failed:", optErr);
        else console.log(`[inbound-webhook] customer opt-out updated: ${matchedCustomer.id}`);

        // Send + persist outbound confirmation
        try {
          const { data: waIntegration } = await supabase
            .from("tenant_integrations")
            .select("config")
            .eq("organisation_id", matchedCustomer.organisation_id)
            .eq("integration_type", "whatsapp")
            .maybeSingle();
          const apiKey: string | undefined =
            (waIntegration as any)?.config?.api_key ?? Deno.env.get("THREESIXTY_API_KEY") ?? undefined;

          const confirmationText =
            `You've been unsubscribed from WhatsApp reminders. Reply START at any time to opt back in.`;

          if (apiKey) {
            const sendRes = await sendWhatsApp(apiKey, phone, confirmationText);
            console.log(`[inbound-webhook] opt-out confirmation send status=${sendRes.status}`);
          }

          const outAt = new Date().toISOString();
          await supabase.from("whatsapp_messages").insert({
            organisation_id: matchedCustomer.organisation_id,
            customer_id: matchedCustomer.id,
            message_body: confirmationText,
            message_type: "opt_out_confirmation",
            sent_by: "system",
            status: "Sent",
            sent_at: outAt,
            phone_number: phone,
          });
          await supabase.from("message_log").insert({
            organisation_id: matchedCustomer.organisation_id,
            customer_id: matchedCustomer.id,
            message_type: "opt_out_confirmation",
            channel: "whatsapp",
            direction: "outbound",
            content: confirmationText,
            status: "sent",
            sent_by: "system",
            sent_at: outAt,
          });
          console.log(`[inbound-webhook] opt-out confirmation saved for customer ${matchedCustomer.id}`);
        } catch (e) {
          console.error("[inbound-webhook] failed to send/save opt-out confirmation:", e);
        }
      }

      await log(null, {
        from: phone, text, action: "stop", customer_id: matchedCustomer?.id || null,
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

    // Find customer by phone (include organisation_id for tenant lookup)
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, name, phone, organisation_id")
      .or(`phone.eq.${phone},phone.eq.+${phone},phone.eq.0${phone.slice(3)}`)
      .limit(1)
      .maybeSingle();

    if (custErr) throw custErr;
    if (!customer) {
      await log(`No customer matched phone ${phone}`, { from: phone, text });
      return new Response(
        JSON.stringify({ success: true, action: "ignored", reason: "customer_not_found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgId = (customer as any).organisation_id;
    if (!orgId) {
      await log(`Customer ${customer.id} missing organisation_id`, { from: phone, text, customer_id: customer.id });
      return new Response(
        JSON.stringify({ error: "organisation_id missing on customer" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log inbound message to message_log (best-effort)
    try {
      await supabase.from("message_log").insert({
        organisation_id: orgId,
        customer_id: customer.id,
        message_type: "inbound",
        channel: "whatsapp",
        direction: "inbound",
        content: text,
        status: "received",
        sent_by: "customer",
        sent_at: new Date().toISOString(),
      });
    } catch (_e) { /* non-critical */ }


    // Load tenant 360messenger integration for company branding (company_name, company_phone, country_code)
    const { data: integration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", orgId)
      .eq("integration_type", "360messenger")
      .maybeSingle();

    if (!integration) {
      await log(
        `No 360messenger tenant_integration row for org ${orgId} — cannot reply`,
        { from: phone, text, organisation_id: orgId, customer_id: customer.id },
      );
      return new Response(
        JSON.stringify({ success: true, action: "ignored", reason: "tenant_integration_not_found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cfg: any = (integration as any).config || {};
    const companyName: string = cfg.company_name;
    const companyPhone: string = cfg.company_phone;
    const countryCode: string = String(cfg.country_code || "353");

    // Load whatsapp integration for the api_key
    const { data: waIntegration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", orgId)
      .eq("integration_type", "whatsapp")
      .maybeSingle();

    const apiKey: string | undefined = (waIntegration as any)?.config?.api_key;

    // Re-normalise using tenant country code
    const tenantPhone = normalisePhone(fromRaw, countryCode);

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
        JSON.stringify({ success: true, action: "ignored", reason: "no_matching_service_call" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fullName = customer.name || "Customer";

    if (upper === "CONFIRM") {
      await supabase
        .from("service_calls")
        .update({ confirmed: true, confirmed_at: new Date().toISOString() })
        .eq("id", job.id);

      const reply = `Thanks ${fullName}, your appointment is confirmed. See you then! ${companyName} ☎ ${companyPhone}`;
      const sendRes = await sendWhatsApp(apiKey || "", tenantPhone, reply);

      await log(sendRes.ok ? null : `CONFIRM reply failed: ${sendRes.raw.substring(0, 300)}`, {
        from: tenantPhone, text, action: "confirm", service_call_id: job.id, customer_id: customer.id, customer_name: fullName,
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

    const reply = `Thanks ${fullName}, your appointment has been cancelled. To rebook call us on ${companyPhone}. ${companyName}`;
    const sendRes = await sendWhatsApp(apiKey || "", tenantPhone, reply);

    await log(sendRes.ok ? null : `CANCEL reply failed: ${sendRes.raw.substring(0, 300)}`, {
      from: tenantPhone, text, action: "cancel", service_call_id: job.id, customer_id: customer.id, customer_name: fullName,
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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
