import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchWhatsappApiKey } from "../_shared/whatsappCredentials.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { area_codes, customers } = await req.json();

    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or empty customers array" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const dbHeaders = {
      "Authorization": `Bearer ${supabaseKey}`,
      "apikey": supabaseKey!,
      "Content-Type": "application/json",
    };

    // Per-org cache for whatsapp api key (shared resolver: api_key_secret or literal api_key)
    const apiKeyCache = new Map<string, { apiKey: string | null; resolution: string }>();
    const getApiKey = async (orgId: string): Promise<{ apiKey: string | null; resolution: string }> => {
      const cached = apiKeyCache.get(orgId);
      if (cached) return cached;
      const res = await fetchWhatsappApiKey(supabaseUrl!, supabaseKey!, orgId);
      const entry = { apiKey: res.apiKey, resolution: res.resolution };
      apiKeyCache.set(orgId, entry);
      return entry;
    };


    let sent = 0;
    let skipped = 0;
    let errors = 0;
    const byArea: Record<string, { sent: number; skipped: number; errors: number }> = {};

    // Initialize area counters
    for (const code of (area_codes || [])) {
      byArea[code] = { sent: 0, skipped: 0, errors: 0 };
    }

    for (const cust of customers) {
      const { customer_id, customer_name, customer_phone, next_service_due, area_code } = cust;
      const areaKey = area_code || "Unknown";
      if (!byArea[areaKey]) byArea[areaKey] = { sent: 0, skipped: 0, errors: 0 };

      if (!customer_id || !customer_phone) {
        skipped++;
        byArea[areaKey].skipped++;
        continue;
      }

      // Check opted_out status
      const custRes = await fetch(
        `${supabaseUrl}/rest/v1/customers?id=eq.${customer_id}&select=opted_out,user_id,organisation_id`,
        { headers: dbHeaders }
      );
      const custRows = await custRes.json();
      const custRecord = Array.isArray(custRows) ? custRows[0] : null;

      if (custRecord?.opted_out === true) {
        skipped++;
        byArea[areaKey].skipped++;
        continue;
      }

      const orgId = custRecord?.organisation_id;
      if (!orgId) {
        console.warn(`Skipping customer ${customer_id}: missing organisation_id`);
        skipped++;
        byArea[areaKey].skipped++;
        continue;
      }

      const { apiKey, resolution } = await getApiKey(orgId);
      if (!apiKey) {
        console.warn(
          `Skipping customer ${customer_id}: no whatsapp api key for org ${orgId} (${resolution})`,
        );
        skipped++;
        byArea[areaKey].skipped++;
        continue;
      }


      // Format phone number
      let cleanNumber = customer_phone.replace(/[\s\-()]/g, "").replace(/^\+/, "");
      if (cleanNumber.startsWith("0")) cleanNumber = "353" + cleanNumber.slice(1);
      if (!cleanNumber.startsWith("353")) cleanNumber = "353" + cleanNumber;

      const firstName = (customer_name || "").split(" ")[0];
      const dueDate = next_service_due
        ? new Date(next_service_due + "T12:00:00").toLocaleDateString("en-IE", {
            day: "numeric", month: "long", year: "numeric",
          })
        : "soon";

      // Tenant branding — this org's own 360messenger config only, no shared
      // fallback (BJ-B2b). Cached per org so a bulk run fetches identical
      // config once instead of once per recipient.
      const { companyName, companyPhone } = await getBranding(orgId);
      const missingConfig = !companyName
        ? "company_name_not_configured"
        : !companyPhone
          ? "company_phone_not_configured"
          : null;

      if (missingConfig) {
        // One log row per org per run, not one per skipped recipient.
        if (!loggedSkipOrgs.has(orgId)) {
          loggedSkipOrgs.add(orgId);
          await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
            method: "POST",
            headers: dbHeaders,
            body: JSON.stringify({
              function_name: "send-area-bulk-whatsapp",
              error_message: `Skipped: ${missingConfig} for organisation`,
              payload: { organisation_id: orgId, reason: missingConfig },
            }),
          });
        }
        skipped++;
        byArea[areaKey].skipped++;
        continue;
      }


      const message = `Hi ${firstName},

This is ${companyName}. Your annual boiler service is due on ${dueDate}.

If your boiler is under manufacturer warranty, maintaining a yearly service is generally a condition of keeping that warranty valid.

Reply here to book your service or call us on ${companyPhone}.

Reply STOP to unsubscribe.
${companyName}`;

      // Send via 360Messenger
      const formData = new FormData();
      formData.append("phonenumber", cleanNumber);
      formData.append("text", message);

      try {
        const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}` },
          body: formData,
        });

        const resultText = await response.text();
        let result: any;
        try { result = JSON.parse(resultText); } catch { result = { success: false, raw: resultText }; }

        // Log to edge_function_logs
        await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
          method: "POST",
          headers: dbHeaders,
          body: JSON.stringify({
            function_name: "send-area-bulk-whatsapp",
            error_message: `360Messenger HTTP ${response.status}: ${result.success ? "success" : "failed"} — ${customer_name} (${areaKey})`,
            payload: { api_response: result, sent_to: customer_phone, customer_id, area_code: areaKey, http_status: response.status },
          }),
        });

        // Log to message_log
        const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
          method: "POST",
          headers: { ...dbHeaders, "Prefer": "return=representation" },
          body: JSON.stringify({
            organisation_id: orgId,
            customer_id,
            message_type: "renewal",
            channel: "whatsapp",
            direction: "outbound",
            content: message,
            status: result.success ? "sent" : "failed",
            related_type: "renewal",
            sent_by: "system",
            sent_at: new Date().toISOString(),
            error_message: result.success ? null : `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}`,
          }),
        });
        await logRes.text();

        // Log to whatsapp_messages
        const ownerUserId = custRecord?.user_id || null;
        if (ownerUserId) {
          await fetch(`${supabaseUrl}/rest/v1/whatsapp_messages`, {
            method: "POST",
            headers: dbHeaders,
            body: JSON.stringify({
              user_id: ownerUserId,
              customer_id,
              message_type: "Service Reminder",
              message_body: message,
              sent_by: "system",
              status: result.success ? "Sent" : "Failed",
            }),
          });
        }

        if (result.success) {
          sent++;
          byArea[areaKey].sent++;

          // Log customer activity
          try {
            await fetch(`${supabaseUrl}/rest/v1/customer_activity`, {
              method: "POST", headers: dbHeaders,
              body: JSON.stringify({
                organisation_id: orgId,
                customer_id,
                event_type: "whatsapp_sent",
                event_label: "WhatsApp sent — Renewal Reminder",
              }),
            });
          } catch { /* non-critical */ }

          // Advance renewal_stage to "reminded" only if currently "not_contacted"
          await fetch(`${supabaseUrl}/rest/v1/customers?id=eq.${customer_id}&renewal_stage=eq.not_contacted`, {
            method: "PATCH",
            headers: dbHeaders,
            body: JSON.stringify({
              renewal_stage: "reminded",
            }),
          });
          // Always update reminder tracking fields
          await fetch(`${supabaseUrl}/rest/v1/customers?id=eq.${customer_id}`, {
            method: "PATCH",
            headers: dbHeaders,
            body: JSON.stringify({
              last_reminder_sent: new Date().toISOString(),
              reminder_30_days_sent: true,
            }),
          });
        } else {
          errors++;
          byArea[areaKey].errors++;
        }
      } catch (sendErr) {
        errors++;
        byArea[areaKey].errors++;

        await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
          method: "POST",
          headers: dbHeaders,
          body: JSON.stringify({
            function_name: "send-area-bulk-whatsapp",
            error_message: `Send error for ${customer_name} (${areaKey}): ${sendErr.message}`,
            payload: { customer_id, customer_phone, area_code: areaKey },
          }),
        });
      }
    }

    return new Response(
      JSON.stringify({ total: customers.length, sent, skipped, errors, by_area: byArea }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "apikey": supabaseKey!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          function_name: "send-area-bulk-whatsapp",
          error_message: error instanceof Error ? error.message : String(error),
          payload: null,
        }),
      });
    } catch (_) { /* best-effort */ }

    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
