import { createClient } from "npm:@supabase/supabase-js@2";
import { getOrgBrandingClient, type OrgBranding } from "../_shared/orgBranding.ts";

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
      // Historic rows use 'Sent' (capitalised); 'viewed' is set by mark_quote_viewed
      // and is still an un-actioned quote. Accepted/converted/rejected/expired excluded.
      .in("status", ["sent", "Sent", "viewed"])
      .eq("approved", false)
      .eq("follow_up_day3_sent", false)
      .gte("sent_at", fourDaysAgo)
      .lte("sent_at", threeDaysAgo);

    if (qErr) return json({ error: qErr.message }, 500);

    let sent = 0;
    let skipped = 0;
    const apiKeyCache = new Map<string, string | null>();
    const brandingCache = new Map<string, OrgBranding>();

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
        const config = (integration?.config as any) ?? {};
        const secretName = config.api_key_secret as string | undefined;
        apiKey = (secretName ? Deno.env.get(secretName) : null) ?? config.api_key ?? null;
        apiKeyCache.set(q.organisation_id, apiKey);
      }
      if (!apiKey) {
        skipped++;
        continue;
      }

      let branding = brandingCache.get(q.organisation_id);
      if (!branding) {
        branding = await getOrgBrandingClient(supabase, q.organisation_id);
        brandingCache.set(q.organisation_id, branding);
      }

      let phone = String(customer.phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
      if (phone.startsWith("0")) phone = "353" + phone.substring(1);

      const firstName = String(customer.name || "there").trim().split(/\s+/)[0];

      const message =
        `Hi ${firstName}, just checking you got the quote we sent over. ` +
        `Happy to answer any questions or adjust anything if needed.\n\n` +
        `Thanks,\n${branding.name}`;

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
        const bodyText = await resp.text();
        // 360Messenger can return HTTP 200 on a failed send — trust the payload.
        try {
          ok = resp.ok && JSON.parse(bodyText)?.success === true;
        } catch (_e) {
          ok = false;
        }
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
