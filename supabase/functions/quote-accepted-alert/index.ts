import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getWhatsAppConfig, normalisePhone, logWhatsAppFailure } from "../_shared/whatsapp.ts";
import { isDenied, requireResourceOrgAccess } from "../_shared/orgAuth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";


serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { quote_id } = await req.json();
    if (!quote_id) {
      return new Response(JSON.stringify({ success: false, error: "Missing quote_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    // IDOR guard (BJ-0089): this internal office alert used to be anonymously
    // invokable with any quote_id. Prove the caller owns the quote first.
    const access = await requireResourceOrgAccess(req, {
      fnName: "quote-accepted-alert",
      cors: corsHeaders,
      resource: { table: "quotes", id: quote_id },
    });
    if (isDenied(access)) return access.error;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const dbHeaders = {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
      "Content-Type": "application/json",
    };

    // Get quote + customer + settings
    const quoteRes = await fetch(
      `${supabaseUrl}/rest/v1/quotes?id=eq.${quote_id}&select=quote_number,total_amount,deposit,deposit_amount,user_id,customer_id,customers!inner(name)`,
      { headers: dbHeaders }
    );
    const quotes = await quoteRes.json();
    const quote = Array.isArray(quotes) ? quotes[0] : null;
    if (!quote) {
      return new Response(JSON.stringify({ success: false, error: "Quote not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
      });
    }

    // Fetch settings: whatsapp_number, business_phone, message_footer
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/settings?user_id=eq.${quote.user_id}&select=whatsapp_number,business_phone,message_footer&limit=1`,
      { headers: dbHeaders }
    );
    const settings = await settingsRes.json();
    const officeNumber = Array.isArray(settings) ? (settings[0]?.whatsapp_number || settings[0]?.business_phone) : null;
    // BJ-B3b: no tenant literal fallback. Internal office alert, so a blank
    // footer degrades (footer line omitted) rather than blocking the alert.
    const messageFooter = String(
      (Array.isArray(settings) ? settings[0]?.message_footer : "") ?? "",
    ).trim();
    if (!messageFooter) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
          method: "POST",
          headers: dbHeaders,
          body: JSON.stringify({
            function_name: "quote-accepted-alert",
            error_message: "Skipped footer: message_footer_not_configured for organisation",
            payload: { quote_id, user_id: quote.user_id, reason: "message_footer_not_configured" },
          }),
        });
      } catch { /* non-critical */ }
    }


    if (!officeNumber) {
      return new Response(JSON.stringify({ success: true, sent: false, reason: "No office number configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve tenant-scoped WhatsApp API key via customer.organisation_id
    let orgIdForKey: string | null = null;
    if (quote.customer_id) {
      const custOrgRes = await fetch(
        `${supabaseUrl}/rest/v1/customers?id=eq.${quote.customer_id}&select=organisation_id`,
        { headers: dbHeaders }
      );
      const custOrgRows = await custOrgRes.json();
      orgIdForKey = (Array.isArray(custOrgRows) && custOrgRows[0]?.organisation_id) || null;
    }
    if (!orgIdForKey) {
      return new Response(JSON.stringify({ success: true, sent: false, reason: "No organisation_id for quote" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let apiKey: string;
    try {
      const supabaseClient = createClient(supabaseUrl, supabaseKey);
      const wa = await getWhatsAppConfig(supabaseClient, orgIdForKey);
      apiKey = wa.apiKey;
    } catch (e) {
      const msg = (e as Error).message;
      console.error("quote-accepted-alert: WhatsApp config unavailable:", msg);
      try {
        const sb = createClient(supabaseUrl, supabaseKey);
        await logWhatsAppFailure(sb, {
          organisation_id: orgIdForKey,
          customer_id: quote.customer_id || null,
          message_type: "quote",
          content: `Quote-accepted alert for ${quote_id} — config unavailable`,
          related_id: quote_id,
          related_type: "quote",
          sent_by: "system",
          error_message: msg,
        });
      } catch { /* non-critical */ }
      return new Response(JSON.stringify({ success: true, sent: false, reason: msg }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const customerName = quote.customers?.name || "Customer";
    const quoteRef = quote.quote_number || `Q-${quote_id.slice(0, 4).toUpperCase()}`;
    const totalAmount = Number(quote.total_amount || 0).toFixed(2);
    const depositAmount = Number(quote.deposit || quote.deposit_amount || 0).toFixed(2);

    const alertMsg = `✅ Quote Accepted

Customer: ${customerName}
Quote: ${quoteRef}
Total: €${totalAmount}
Deposit: €${depositAmount}

Job has been created — open BookedJobs to schedule.${messageFooter ? `\n\n${messageFooter}` : ""}`;

    // Log pending message
    const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
      method: "POST",
      headers: { ...dbHeaders, "Prefer": "return=representation" },
      body: JSON.stringify({
        customer_id: quote.customer_id || null,
        message_type: "quote",
        channel: "whatsapp",
        direction: "outbound",
        content: alertMsg,
        status: "pending",
        related_id: quote_id,
        related_type: "quote",
        sent_by: "system",
        sent_at: new Date().toISOString(),
      }),
    });
    const logRows = await logRes.json();
    const logId = Array.isArray(logRows) ? logRows[0]?.id : null;

    let sendSucceeded = false;
    let sendError: string | null = null;
    try {
      const cleanNumber = normalisePhone(officeNumber);
      const formData = new FormData();
      formData.append("phonenumber", cleanNumber);
      formData.append("text", alertMsg);

      const res = await fetch("https://api.360messenger.com/v2/sendMessage", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData,
      });

      const resultText = await res.text();
      let result: any;
      try { result = JSON.parse(resultText); } catch { result = { success: false, raw: resultText }; }
      sendSucceeded = !!result.success;
      if (!sendSucceeded) {
        sendError = `360Messenger HTTP ${res.status}: ${resultText.substring(0, 300)}`;
      }
    } catch (e) {
      sendError = (e as Error).message;
      console.error("quote-accepted-alert: send failed:", sendError);
    }

    // Update message_log status
    if (logId) {
      const updateBody = sendSucceeded
        ? { status: "sent" }
        : { status: "failed", error_message: sendError || "unknown" };

      await fetch(`${supabaseUrl}/rest/v1/message_log?id=eq.${logId}`, {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify(updateBody),
      });
    } else if (!sendSucceeded) {
      // No log row existed — write a fresh failure row so nothing is lost.
      try {
        const sb = createClient(supabaseUrl, supabaseKey);
        await logWhatsAppFailure(sb, {
          organisation_id: orgIdForKey,
          customer_id: quote.customer_id || null,
          message_type: "quote",
          content: alertMsg,
          related_id: quote_id,
          related_type: "quote",
          sent_by: "system",
          error_message: sendError || "unknown",
        });
      } catch { /* non-critical */ }
    }

    const result = { success: sendSucceeded };

    // Log customer activity on successful send
    if (result.success && quote.customer_id) {
      try {
        // Fetch organisation_id from customer
        const custOrgRes = await fetch(
          `${supabaseUrl}/rest/v1/customers?id=eq.${quote.customer_id}&select=organisation_id`,
          { headers: dbHeaders }
        );
        const custOrgRows = await custOrgRes.json();
        const orgId = (Array.isArray(custOrgRows) && custOrgRows[0]?.organisation_id) || null;

        if (!orgId) {
          console.error(`quote-accepted-alert: skipping customer_activity insert — customer ${quote.customer_id} missing organisation_id`);
        } else {
          await fetch(`${supabaseUrl}/rest/v1/customer_activity`, {
            method: "POST",
            headers: dbHeaders,
            body: JSON.stringify({
              organisation_id: orgId,
              customer_id: quote.customer_id,
              event_type: "whatsapp_sent",
              event_label: "WhatsApp sent — Quote Accepted Alert",
            }),
          });
        }
      } catch (_e) { /* non-critical */ }
    }

    // Insert in-app notification for office
    try {
      let orgId: string | null = null;
      if (quote.customer_id) {
        const custOrgRes = await fetch(
          `${supabaseUrl}/rest/v1/customers?id=eq.${quote.customer_id}&select=organisation_id`,
          { headers: dbHeaders }
        );
        const custOrgRows = await custOrgRes.json();
        orgId = (Array.isArray(custOrgRows) && custOrgRows[0]?.organisation_id) || null;
      }
      if (orgId) {
        const settingsRecRes = await fetch(
          `${supabaseUrl}/rest/v1/settings?organisation_id=eq.${orgId}&select=user_id&limit=1`,
          { headers: dbHeaders }
        );
        const settingsRecRows = await settingsRecRes.json();
        const recipientId = (Array.isArray(settingsRecRows) && settingsRecRows[0]?.user_id) || quote.user_id;
        if (recipientId) {
          await fetch(`${supabaseUrl}/rest/v1/notifications`, {
            method: "POST",
            headers: dbHeaders,
            body: JSON.stringify({
              recipient_user_id: recipientId,
              organisation_id: orgId,
              notification_type: "quote_accepted",
              title: "Quote Accepted",
              body: `${customerName} accepted ${quoteRef} — €${totalAmount}`,
              role: "office",
              metadata: { quote_id, customer_id: quote.customer_id, total: totalAmount, deposit: depositAmount },
            }),
          });
        }
      } else {
        console.error("quote-accepted-alert: skipping notification — missing organisation_id");
      }
    } catch (_e) { /* non-critical */ }

    return new Response(JSON.stringify({ success: true, sent: result.success }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("quote-accepted-alert unexpected error:", error);
    return new Response(JSON.stringify({ success: false, sent: false, error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  }
});
