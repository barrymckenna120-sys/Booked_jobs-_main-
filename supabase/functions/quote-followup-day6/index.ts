import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id",
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

  console.log("[quote-followup-day6] function started", { ts: new Date().toISOString() });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const sixDaysAgo = new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString();

    const { data: quotes, error: qErr } = await supabase
      .from("quotes")
      .select("id, organisation_id, customer_id, user_id, customers(name, phone, opted_out)")
      .eq("status", "sent")
      .eq("approved", false)
      .eq("follow_up_day3_sent", true)
      .eq("follow_up_day6_sent", false)
      .gte("sent_at", sevenDaysAgo)
      .lte("sent_at", sixDaysAgo);

    if (qErr) {
      console.error("[quote-followup-day6] quote query error", qErr);
      return json({ error: qErr.message }, 500);
    }

    console.log("[quote-followup-day6] eligible quotes found", { count: quotes?.length ?? 0 });

    let sent = 0;
    let skipped = 0;
    const apiKeyCache = new Map<string, string | null>();

    for (const q of quotes || []) {
      const customer: any = (q as any).customers;
      if (!customer || customer.opted_out || !customer.phone) {
        console.log("[quote-followup-day6] skipped (no customer/opted-out/no phone)", { quote_id: q.id });
        skipped++;
        continue;
      }

      let apiKey = apiKeyCache.get(q.organisation_id) ?? undefined;
      if (apiKey === undefined) {
        const { data: integration } = await supabase
          .from("tenant_integrations")
          .select("config")
          .eq("organisation_id", q.organisation_id)
          .eq("integration_type", "360messenger")
          .maybeSingle();
        const cfg: any = integration?.config ?? {};
        apiKey = cfg.api_key ?? (cfg.api_key_secret ? Deno.env.get(cfg.api_key_secret) ?? null : null);
        apiKeyCache.set(q.organisation_id, apiKey);
      }
      if (!apiKey) {
        console.log("[quote-followup-day6] skipped (no 360messenger api key)", { quote_id: q.id, org: q.organisation_id });
        skipped++;
        continue;
      }

      let phone = String(customer.phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
      if (phone.startsWith("0")) phone = "353" + phone.substring(1);

      const firstName = String(customer.name || "there").trim().split(/\s+/)[0];

      const message =
        `Hi ${firstName}, we wanted to follow up on the quote we sent for your boiler service in Dublin 3. ` +
        `We have some availability coming up if you would like to go ahead. ` +
        `Please reply to this message or call us on 087 368 5252 if you have any questions.\n\n` +
        `Thanks,\nKarl\nK & N Gas Services`;

      const formData = new FormData();
      formData.append("phonenumber", phone);
      formData.append("text", message);

      let ok = false;
      let respStatus = 0;
      let respBody = "";
      console.log("[quote-followup-day6] WhatsApp message attempted", { quote_id: q.id, phone });
      try {
        const resp = await fetch("https://api.360messenger.com/v2/sendMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });
        respStatus = resp.status;
        respBody = await resp.text();
        ok = resp.ok;
      } catch (e) {
        console.error("[quote-followup-day6] WhatsApp send threw", { quote_id: q.id, error: (e as Error).message });
        ok = false;
      }
      console.log("[quote-followup-day6] WhatsApp response", { quote_id: q.id, ok, status: respStatus, body: respBody.slice(0, 300) });

      try {
        const logResp = await fetch(`${supabaseUrl}/functions/v1/log-message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            service_call_id: q.id,
            organisation_id: q.organisation_id,
            message_type: "quote_followup_day6",
            recipient_phone: phone,
            message_body: message,
            status: ok ? "success" : "fail",
          }),
        });
        console.log("[quote-followup-day6] message saved to history", { quote_id: q.id, log_status: logResp.status });
      } catch (e) {
        console.error("[quote-followup-day6] log-message invoke failed", { quote_id: q.id, error: (e as Error).message });
      }

      if (ok) {
        await supabase
          .from("quotes")
          .update({ follow_up_day6_sent: true })
          .eq("id", q.id);
        sent++;
      } else {
        skipped++;
      }
    }

    console.log("[quote-followup-day6] finished", { sent, skipped });
    return json({ success: true, sent, skipped });
  } catch (e) {
    console.error("[quote-followup-day6] fatal error", e);
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});
