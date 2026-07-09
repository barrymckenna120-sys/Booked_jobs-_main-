import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getTenantPublicUrl } from "../_shared/tenantDomain.ts";

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      quote_id,
      customer_name,
      mobile_number,
      job_description,
      quote_amount,
      parts_cost,
      labour_cost,
      deposit_amount,
      business_phone,
      business_name,
      pdf_url,
      quote_number,
      customer_id,
      sent_by_user_id,
    } = await req.json();

    if (!quote_id || !customer_name || !mobile_number || quote_amount == null) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const dbHeaders = {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey!,
      "Content-Type": "application/json",
    };

    // Derive organisation_id and customer_id from quote
    const quoteRes = await fetch(
      `${supabaseUrl}/rest/v1/quotes?id=eq.${quote_id}&select=organisation_id,customer_id&limit=1`,
      { headers: dbHeaders },
    );
    const quoteRows = await quoteRes.json();
    const orgId = Array.isArray(quoteRows) && quoteRows[0]?.organisation_id;
    const resolvedCustomerId = (Array.isArray(quoteRows) && quoteRows[0]?.customer_id) || customer_id || null;
    if (!orgId) {
      return new Response(JSON.stringify({ success: false, error: "Quote missing organisation_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // (Tenant public URLs are resolved below via getTenantPublicUrl —
    // no slug fallback: if public_domain is unset, the link is omitted.)

    // Fetch tenant WhatsApp integration config (api_key)
    const tiRes = await fetch(
      `${supabaseUrl}/rest/v1/tenant_integrations?organisation_id=eq.${orgId}&integration_type=eq.360messenger&select=config&limit=1`,
      { headers: dbHeaders },
    );
    const tiRows = await tiRes.json();
    const config = Array.isArray(tiRows) && tiRows[0]?.config ? tiRows[0].config : null;
    const apiKeySecretName = config?.api_key_secret as string | undefined;
    const apiKey =
      (apiKeySecretName ? Deno.env.get(apiKeySecretName) : null) ??
      config?.api_key ??
      Deno.env.get("THREESIXTY_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "WhatsApp integration not configured for this organisation" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    // Fetch message_footer from settings (by organisation_id)
    let messageFooter = "K&N Gas Services";
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/settings?organisation_id=eq.${orgId}&select=message_footer&limit=1`,
      { headers: dbHeaders },
    );
    const settings = await settingsRes.json();
    if (Array.isArray(settings) && settings[0]?.message_footer) {
      messageFooter = settings[0].message_footer;
    }

    const firstName = customer_name.split(" ")[0];
    const refNumber = quote_number || `Q-${quote_id.substring(0, 4).toUpperCase()}`;
    const deposit = Number(deposit_amount || 0);

    const acceptUrl = `https://${slug}.bookedjobs.ie/quote/${refNumber}`;

    let message = `Hi ${firstName},

Here is your quote for ${job_description}.

Quote No: ${refNumber}

Total: €${Number(quote_amount).toFixed(2)}`;

    if (deposit > 0) {
      message += `\n\nDeposit to secure booking: €${deposit.toFixed(2)}`;
    }

    message += `

To accept this quote, reply:
YES ${refNumber}

View and approve here:
${acceptUrl}`;

    if (pdf_url) {
      message += `\n\n📄 View your full quote PDF:\nhttps://${slug}.bookedjobs.ie/pdf/${refNumber}`;
    }

    message += `\n\n${messageFooter}`;

    if (business_phone) {
      message += `\n📞 ${business_phone}`;
    }

    // Log pending message
    const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
      method: "POST",
      headers: { ...dbHeaders, Prefer: "return=representation" },
      body: JSON.stringify({
        customer_id: resolvedCustomerId,
        message_type: "quote",
        channel: "whatsapp",
        direction: "outbound",
        content: message,
        status: "pending",
        related_id: quote_id,
        related_type: "quote",
        sent_by: sent_by_user_id || "system",
        sent_at: new Date().toISOString(),
      }),
    });
    const logRows = await logRes.json();
    const logId = Array.isArray(logRows) ? logRows[0]?.id : null;

    const cleanNumber = mobile_number.replace(/^\+/, "");
    const formData = new FormData();
    formData.append("phonenumber", cleanNumber);
    formData.append("text", message);

    const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    const resultText = await response.text();
    let result: any;
    try {
      result = JSON.parse(resultText);
    } catch {
      result = { success: false, raw: resultText };
    }

    // Update message_log status
    if (logId) {
      const updateBody = result.success
        ? { status: "sent" }
        : { status: "failed", error_message: `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}` };

      await fetch(`${supabaseUrl}/rest/v1/message_log?id=eq.${logId}`, {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify(updateBody),
      });
    }

    if (result.success) {
      await fetch(`${supabaseUrl}/rest/v1/quotes?id=eq.${quote_id}`, {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify({ status: "Sent", sent_at: new Date().toISOString() }),
      });

      // Log customer activity
      if (customer_id) {
        try {
          await fetch(`${supabaseUrl}/rest/v1/customer_activity`, {
            method: "POST",
            headers: dbHeaders,
            body: JSON.stringify({
              organisation_id: orgId,
              customer_id,
              event_type: "whatsapp_sent",
              event_label: "WhatsApp sent — Quote",
            }),
          });
        } catch {
          /* non-critical */
        }
      }
    } else {
      const errorDetail = `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}`;

      await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
        method: "POST",
        headers: dbHeaders,
        body: JSON.stringify({
          function_name: "send-quote-whatsapp",
          error_message: `360Messenger API returned success:false. HTTP ${response.status}`,
          payload: { api_response: result, sent_to: mobile_number, quote_id },
        }),
      });

      // Insert failure notification for office/admin users
      const usersRes = await fetch(
        `${supabaseUrl}/rest/v1/engineers?user_id=eq.${sent_by_user_id || ""}&role=in.(admin,office)&auth_user_id=not.is.null&select=auth_user_id`,
        { headers: dbHeaders },
      );
      const adminUsers = await usersRes.json();

      const recipientIds = new Set<string>();
      if (sent_by_user_id) recipientIds.add(sent_by_user_id);
      if (Array.isArray(adminUsers)) {
        adminUsers.forEach((u: any) => {
          if (u.auth_user_id) recipientIds.add(u.auth_user_id);
        });
      }

      for (const recipientId of recipientIds) {
        await fetch(`${supabaseUrl}/rest/v1/notifications`, {
          method: "POST",
          headers: dbHeaders,
          body: JSON.stringify({
            recipient_user_id: recipientId,
            notification_type: "message",
            title: "⚠️ WhatsApp Send Failed",
            body: `Failed to send WhatsApp to ${customer_name} (${mobile_number}). Please contact them manually. Error: ${errorDetail.substring(0, 200)}`,
            role: "office",
            metadata: { quote_id, customer_name, phone: mobile_number, error: errorDetail.substring(0, 200) },
          }),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: result.success,
        error_detail: result.success
          ? undefined
          : `360Messenger HTTP ${response.status}: ${resultText.substring(0, 300)}`,
        customer_name,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message, error_detail: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
