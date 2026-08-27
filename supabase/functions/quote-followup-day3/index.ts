import { createClient } from "npm:@supabase/supabase-js@2";
import { getOrgBrandingClient, type OrgBranding } from "../_shared/orgBranding.ts";
import { getTenantPublicUrl } from "../_shared/tenantDomain.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireMachineCaller } from "../_shared/machineAuth.ts";
import { decideFollowup, renderFollowupMessage } from "../_shared/quoteFollowup.ts";

const STAGE = 3 as const;
const TAG = "[quote-followup-day3]";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Machine callers only (pg_cron shared secret / service-role bearer).
  const denied = await requireMachineCaller(req, corsHeaders, "quote-followup-day3");
  if (denied) return denied;

  console.log(`${TAG} function started`, { ts: new Date().toISOString() });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Dry-run support: evaluates eligibility and renders the message without
    // contacting the provider or writing anything.
    let dryRun = false;
    let onlyQuoteId: string | null = null;
    try {
      const body = req.method === "POST" ? await req.json() : {};
      dryRun = body?.dry_run === true;
      onlyQuoteId = typeof body?.quote_id === "string" ? body.quote_id : null;
    } catch (_e) {
      // no body — normal cron invocation
    }

    const now = Date.now();
    const fourDaysAgo = new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from("quotes")
      .select(
        "id, organisation_id, customer_id, user_id, quote_number, access_token, status, approved, approved_at, viewed_at, follow_up_day3_sent, follow_up_day6_sent, sent_at, customers(name, phone, opted_out)",
      )
      // Historic rows use 'Sent' (capitalised). 'viewed' is a READ state and is
      // deliberately excluded: reading the quote stops all follow-ups.
      .in("status", ["sent", "Sent"])
      .eq("approved", false)
      .is("viewed_at", null)
      .eq("follow_up_day3_sent", false);

    if (onlyQuoteId) {
      query = query.eq("id", onlyQuoteId);
    } else {
      query = query.gte("sent_at", fourDaysAgo).lte("sent_at", threeDaysAgo);
    }

    const { data: quotes, error: qErr } = await query;

    if (qErr) {
      console.error(`${TAG} quote query error`, qErr);
      return json({ error: qErr.message }, 500);
    }

    console.log(`${TAG} candidate quotes found`, { count: quotes?.length ?? 0 });

    let sent = 0;
    let skipped = 0;
    const results: Array<Record<string, unknown>> = [];

    const apiKeyCache = new Map<string, string | null>();
    const brandingCache = new Map<string, OrgBranding>();

    for (const q of quotes || []) {
      const customer = (q as any).customers ?? null;

      // Authoritative business rule: !read && !approved && !alreadySent.
      const decision = decideFollowup(STAGE, q as any);
      if (!decision.send) {
        console.log(`${TAG} skipped`, { quote_id: q.id, reason: decision.reason });
        skipped++;
        results.push({ quote_id: q.id, action: "skip", reason: decision.reason });
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
        const secretApiKey = secretName ? Deno.env.get(secretName) ?? null : null;
        const directApiKey = typeof config.api_key === "string" ? config.api_key : null;
        apiKey = secretApiKey ?? directApiKey ?? null;
        apiKeyCache.set(q.organisation_id, apiKey);
      }

      if (!apiKey) {
        console.log(`${TAG} skipped (no 360messenger api key)`, {
          quote_id: q.id,
          org: q.organisation_id,
        });
        skipped++;
        results.push({ quote_id: q.id, action: "skip", reason: "no_whatsapp_key" });
        continue;
      }

      let branding = brandingCache.get(q.organisation_id);
      if (!branding) {
        branding = await getOrgBrandingClient(supabase, q.organisation_id);
        brandingCache.set(q.organisation_id, branding);
      }

      const quoteUrl = (q as any).access_token
        ? await getTenantPublicUrl(supabaseUrl, q.organisation_id, `/quote/${(q as any).access_token}`)
        : null;

      let phone = String(customer.phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
      if (phone.startsWith("0")) phone = "353" + phone.substring(1);

      const message = renderFollowupMessage(STAGE, {
        customerName: customer.name,
        businessName: branding.name,
        businessPhone: branding.phone,
        quoteNumber: (q as any).quote_number,
        quoteUrl,
      });

      if (dryRun) {
        console.log(`${TAG} dry run`, { quote_id: q.id });
        results.push({ quote_id: q.id, action: "would_send", phone, message });
        continue;
      }

      const formData = new FormData();
      formData.append("phonenumber", phone);
      formData.append("text", message);

      let ok = false;
      let respStatus = 0;
      let respBody = "";

      console.log(`${TAG} WhatsApp message attempted`, { quote_id: q.id, phone });

      try {
        const resp = await fetch("https://api.360messenger.com/v2/sendMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });
        respStatus = resp.status;
        respBody = await resp.text();
        // 360Messenger can return HTTP 200 on a failed send, so the payload
        // success flag is authoritative.
        try {
          const parsed = JSON.parse(respBody);
          ok = resp.ok && parsed?.success === true;
        } catch (_e) {
          ok = false;
        }
      } catch (e) {
        console.error(`${TAG} WhatsApp send threw`, {
          quote_id: q.id,
          error: e instanceof Error ? e.message : String(e),
        });
        ok = false;
      }

      console.log(`${TAG} WhatsApp response`, {
        quote_id: q.id,
        ok,
        status: respStatus,
        body: respBody.slice(0, 300),
      });

      try {
        const { error: wmErr } = await supabase.from("whatsapp_messages").insert({
          user_id: q.user_id ?? null,
          customer_id: q.customer_id,
          organisation_id: q.organisation_id,
          phone_number: phone,
          message_type: "quote_followup_day3",
          message_body: message,
          direction: "outbound",
          status: ok ? "Sent" : "Failed",
          linked_quote_id: q.id,
          sent_by: "system",
        });

        const { error: mlErr } = await supabase.from("message_log").insert({
          organisation_id: q.organisation_id,
          customer_id: q.customer_id,
          message_type: "quote_followup_day3",
          channel: "whatsapp",
          direction: "outbound",
          content: message,
          status: ok ? "success" : "fail",
          related_id: q.id,
          related_type: "quote",
          sent_by: "system",
          sent_at: new Date().toISOString(),
        });

        console.log(`${TAG} message saved to history`, {
          quote_id: q.id,
          whatsapp_messages_error: wmErr?.message ?? null,
          message_log_error: mlErr?.message ?? null,
        });
      } catch (e) {
        console.error(`${TAG} save-to-history failed`, {
          quote_id: q.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      if (ok) {
        // Flag only on a confirmed send, so a provider failure is retried on the
        // next run instead of being silently marked done.
        await supabase
          .from("quotes")
          .update({ follow_up_day3_sent: true, follow_up_sent: true })
          .eq("id", q.id)
          .eq("follow_up_day3_sent", false);
        sent++;
        results.push({ quote_id: q.id, action: "sent" });
      } else {
        skipped++;
        results.push({ quote_id: q.id, action: "failed", status: respStatus });
      }
    }

    console.log(`${TAG} finished`, { sent, skipped, dryRun });
    return json({ success: true, sent, skipped, dry_run: dryRun, results });
  } catch (e) {
    console.error(`${TAG} fatal error`, e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
