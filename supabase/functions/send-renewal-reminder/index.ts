import { createClient } from "npm:@supabase/supabase-js@2";
import { evaluateOptOut } from "../_shared/optOut.ts";
import { last9Digits, toE164Digits } from "../_shared/phone.ts";
import {
  cooldownWindowStart,
  isDuplicateRenewalSend,
} from "../_shared/renewalSendGuard.ts";





const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    console.log("Request received:", JSON.stringify(body));
    const { customer_id, phone, first_name, renewal_date } = body;
    const force = body?.force === true;


    if (!customer_id || !phone || !first_name || !renewal_date) {
      console.log("Missing required fields:", { customer_id, phone, first_name, renewal_date });
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: customer_id, phone, first_name, renewal_date" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve organisation + branding (and enforce the opt-out guard)
    const { data: custOrg } = await supabase
      .from("customers")
      .select("organisation_id, opted_out, phone")
      .eq("id", customer_id)
      .maybeSingle();

    // Renewal reminders are marketing-style outreach — never message an
    // opted-out customer, even if a caller passes a phone number directly.
    const optOut = evaluateOptOut(custOrg as any);
    if (optOut.skip && optOut.reason === "customer_opted_out") {
      console.log("Skipping renewal reminder — customer opted out:", customer_id);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "customer_opted_out" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgId = custOrg?.organisation_id;

    // Normalise the recipient number up front — the duplicate guard keys off
    // the phone, not just the customer row. An unusable number is a 400, not a
    // 500, and must never reach the messaging API.
    let cleanPhone: string;
    try {
      cleanPhone = toE164Digits(phone);
    } catch (_e) {
      return new Response(
        JSON.stringify({ success: false, error: `Unrecognised phone format: ${phone}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const phoneTail = last9Digits(phone);
    console.log("Phone formatted:", cleanPhone, "(original:", phone, ")");


    // Duplicate guard (authoritative, server-side). Two separate bugs feed it:
    //   1. A double-tapped button / retried request re-sending to the SAME
    //      customer row (observed: 3 identical messages in 1.3s).
    //   2. Several customer rows sharing ONE phone number (observed: 7 rows on
    //      +353872354257), so a bulk run messaged the same person repeatedly —
    //      a per-customer_id check alone would miss this entirely.
    // So we dedup across every customer in this org sharing the number.
    let dedupCustomerIds = [customer_id];
    if (orgId && phoneTail.length >= 7) {
      const { data: siblings } = await supabase
        .from("customers")
        .select("id")
        .eq("organisation_id", orgId)
        .ilike("phone", `%${phoneTail}`);
      const ids = (siblings ?? []).map((s: any) => s.id).filter(Boolean);
      if (ids.length) dedupCustomerIds = Array.from(new Set([customer_id, ...ids]));
    }
    console.log("Dedup scope — customer rows sharing this number:", dedupCustomerIds.length);

    // The "pending" log row is written before the outbound API call, so a
    // near-simultaneous second invocation sees it here and is suppressed.
    const { data: recentReminders, error: recentErr } = await supabase
      .from("message_log")
      .select("sent_at, status")
      .in("customer_id", dedupCustomerIds)
      .eq("message_type", "renewal_reminder")
      .gte("sent_at", cooldownWindowStart())
      .order("sent_at", { ascending: false })
      .limit(20);

    if (recentErr) {
      // Fail closed: if we cannot prove this is not a duplicate, do not send.
      console.log("Duplicate-guard lookup failed:", recentErr.message);
      return new Response(
        JSON.stringify({ success: false, error: `Duplicate guard lookup failed: ${recentErr.message}` }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dupe = isDuplicateRenewalSend(recentReminders as any, new Date(), { force });
    if (dupe.duplicate) {
      console.log("Skipping renewal reminder — already sent:", customer_id, "last:", dupe.lastSentAt);
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: dupe.reason,
          last_sent_at: dupe.lastSentAt,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }




    const { data: settingsRow } = orgId ? await supabase
      .from("settings")
      .select("company_name, company_phone")
      .eq("organisation_id", orgId)
      .maybeSingle() : { data: null };
    const companyName = (settingsRow as any)?.company_name ?? "";
    const companyPhone = (settingsRow as any)?.company_phone ?? "";

    // 360messenger config retained for api_key_secret lookup below
    const { data: messengerConfig } = orgId ? await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", orgId)
      .eq("integration_type", "360messenger")
      .maybeSingle() : { data: null };
    const messengerSettings = (messengerConfig?.config as any) ?? {};

    // Resolve per-org WhatsApp API key from tenant_integrations
    const { data: waConfig } = orgId ? await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", orgId)
      .eq("integration_type", "360messenger")
      .maybeSingle() : { data: null };
    const apiKeySecretName = messengerSettings.api_key_secret as string | undefined;
    // Tenant credentials only — no shared THREESIXTY_API_KEY fallback.
    const apiKey = (apiKeySecretName ? Deno.env.get(apiKeySecretName) : null)
      ?? (waConfig?.config as any)?.api_key;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "WhatsApp API key not configured for this organisation" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // cleanPhone is already normalised above (before the duplicate guard).



    // Resolve per-tenant Tally rebooking URL. Only include link if a real URL is
    // configured for this organisation — never fall back to another tenant's URL.
    const { data: tallyIntegration } = orgId ? await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", orgId)
      .eq("integration_type", "tally")
      .maybeSingle() : { data: null };
    const renewalFormUrl = (tallyIntegration?.config as any)?.renewal_form_url;
    const hasRebookLink = typeof renewalFormUrl === "string" && renewalFormUrl.trim().length > 0;

    // Build message — link variant if configured, otherwise fall back to reply/call wording
    const bookLine = hasRebookLink
      ? `Book online: ${renewalFormUrl}?customer_phone=${encodeURIComponent(cleanPhone)}\n\nOr reply here or call us on ${companyPhone}.`
      : `Reply here to book your service or call us on ${companyPhone}.`;
    const message = `Hi ${first_name},\n\nThis is ${companyName}. Your annual boiler service is due on ${renewal_date}.\n\nIf your boiler is under manufacturer warranty, maintaining a yearly service is a condition of keeping that warranty valid.\n\n${bookLine}\n\nReply STOP to unsubscribe.\n${companyName}`;
    console.log("Message built for:", first_name, "with rebook link:", hasRebookLink);

    // Log pending message
    console.log("Inserting pending message_log entry...");
    const { data: logRow, error: logErr } = await supabase
      .from("message_log")
      .insert({
        customer_id,
        organisation_id: orgId,
        message_type: "renewal_reminder",
        channel: "whatsapp",
        direction: "outbound",
        recipient_phone: cleanPhone,
        content: message,
        status: "pending",
        related_type: "renewal",
        sent_by: "system",

        sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (logErr) console.log("message_log insert error:", logErr.message);
    const logId = logRow?.id;
    console.log("message_log id:", logId);

    // Send via 360 Messenger API
    const formData = new FormData();
    formData.append("phonenumber", cleanPhone);
    formData.append("text", message);
    console.log("Calling 360 Messenger API...");
    console.log("API key present:", !!apiKey, "length:", apiKey?.length);

    const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    const resultText = await response.text();
    console.log("360 Messenger response status:", response.status);
    console.log("360 Messenger response body:", resultText);

    let result: any;
    try {
      result = JSON.parse(resultText);
    } catch (_e) {
      result = { success: false, raw: resultText };
    }

    if (result.success) {
      console.log("SUCCESS — updating message_log and customer record");
      if (logId) {
        await supabase
          .from("message_log")
          .update({ status: "sent" })
          .eq("id", logId);
      }

      const now = new Date().toISOString();
      await supabase
        .from("customers")
        .update({
          renewal_stage: "reminded",
          last_reminder_sent: now,
          reminder_30_days_sent: true,
        })
        .eq("id", customer_id);

      return new Response(
        JSON.stringify({ success: true, sent_to: cleanPhone }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const errorDetail = `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}`;
      console.log("FAILED — errorDetail:", errorDetail);
      if (logId) {
        await supabase
          .from("message_log")
          .update({ status: "failed", error_message: errorDetail })
          .eq("id", logId);
      }

      await supabase.from("edge_function_logs").insert({
        function_name: "send-renewal-reminder",
        error_message: `Failed to send renewal reminder to ${first_name} (${cleanPhone})`,
        payload: { api_response: result, sent_to: cleanPhone, customer_id },
      });

      return new Response(
        JSON.stringify({ success: false, error: errorDetail }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.log("CATCH error:", errMsg);

    try {
      await supabase.from("edge_function_logs").insert({
        function_name: "send-renewal-reminder",
        error_message: errMsg,
        payload: null,
      });
    } catch (_e) { /* best-effort */ }

    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
