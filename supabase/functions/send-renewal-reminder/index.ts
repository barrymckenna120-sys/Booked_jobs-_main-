import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    if (!customer_id || !phone || !first_name || !renewal_date) {
      console.log("Missing required fields:", { customer_id, phone, first_name, renewal_date });
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: customer_id, phone, first_name, renewal_date" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve organisation + branding
    const { data: custOrg } = await supabase
      .from("customers")
      .select("organisation_id")
      .eq("id", customer_id)
      .maybeSingle();
    const orgId = custOrg?.organisation_id;

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
    const apiKey = (apiKeySecretName ? Deno.env.get(apiKeySecretName) : null)
      ?? (waConfig?.config as any)?.api_key
      ?? Deno.env.get("THREESIXTY_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "WhatsApp API key not configured for this organisation" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone — strip +, ensure 353 prefix (needed before message build for Tally prefill)
    let cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "353" + cleanPhone.slice(1);
    } else if (!cleanPhone.startsWith("353")) {
      cleanPhone = "353" + cleanPhone;
    }
    console.log("Phone formatted:", cleanPhone, "(original:", phone, ")");

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
