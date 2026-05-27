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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = Date.now();
    const fourDaysAgo = new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: quotes, error: qErr } = await supabase
      .from("quotes")
      .select("id, organisation_id, customer_id, customers(name, phone, opted_out)")
      .eq("status", "sent")
      .eq("approved", false)
      .eq("follow_up_day3_sent", false)
      .gte("sent_at", fourDaysAgo)
      .lte("sent_at", threeDaysAgo);

    if (qErr) return json({ error: qErr.message }, 500);

    let sent = 0;
    let skipped = 0;
    const apiKeyCache = new Map<string, string | null>();

    for (const q of quotes || []) {
      const customer: any = (q as any).customers;
      if (!customer || customer.opted_out || !customer.phone) {
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
        apiKey = (integration?.config as any)?.api_key ?? null;
        apiKeyCache.set(q.organisation_id, apiKey);
      }
      if (!apiKey) {
        skipped++;
        continue;
      }

      let phone = String(customer.phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
      if (phone.startsWith("0")) phone = "353" + phone.substring(1);

      const firstName = String(customer.name || "there").trim().split(/\s+/)[0];

      const message =
        `Hi ${firstName}, just checking you got the quote we sent over for your boiler service. ` +
        `Happy to answer any questions or adjust anything if needed.\n\n` +
        `Thanks,\nKarl\nK & N Gas Services`;

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
            service_call_id: q.id,
            organisation_id: q.organisation_id,
            message_type: "quote_followup_day3",
            recipient_phone: phone,
            message_body: message,
            status: ok ? "success" : "fail",
          }),
        });
      } catch (_e) {
        console.error("log-message invoke failed", _e);
      }

      if (ok) {
        await supabase
          .from("quotes")
          .update({ follow_up_day3_sent: true, follow_up_sent: true })
          .eq("id", q.id);
        sent++;
      } else {
        skipped++;
      }
    }

    return json({ success: true, sent, skipped });
  } catch (e) {
    console.error("quote-followup-day3 error", e);
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});
