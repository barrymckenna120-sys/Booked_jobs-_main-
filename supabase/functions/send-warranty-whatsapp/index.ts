import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      phone,
      customer_id,
      customer_name,
      first_name,
      boiler_brand,
      boiler_model,
      install_date_formatted,
      message_type,
    } = await req.json();

    if (!phone || !customer_id || !message_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields (phone, customer_id, message_type)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Strip all non-numeric characters and normalise to full international
    let digits = phone.replace(/\D/g, "");
    if (digits.startsWith("353") && digits.length === 12) {
      // already full international
    } else if (digits.startsWith("0") && digits.length === 10) {
      digits = "353" + digits.slice(1);
    } else if (digits.length === 9) {
      digits = "353" + digits;
    }

    const messengerPhone = digits; // 353XXXXXXXXX
    const tallyPhone = "0" + digits.slice(3); // 0XXXXXXXXX

    // Resolve org + Tally form URL from customer
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    let orgId: string | null = null;
    let tallyFormBase = "https://tally.so/r/RGJDy4";
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const custOrgRes = await fetch(
          `${SUPABASE_URL}/rest/v1/customers?id=eq.${customer_id}&select=organisation_id&limit=1`,
          {
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
          }
        );
        const custOrgRows = await custOrgRes.json();
        orgId = Array.isArray(custOrgRows) ? custOrgRows[0]?.organisation_id ?? null : null;

        if (orgId) {
          const tiRes = await fetch(
            `${SUPABASE_URL}/rest/v1/tenant_integrations?organisation_id=eq.${orgId}&integration_type=eq.tally&select=config&limit=1`,
            {
              headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
            }
          );
          const tiRows = await tiRes.json();
          const cfg = Array.isArray(tiRows) ? tiRows[0]?.config : null;
          if (cfg?.renewal_form_url) tallyFormBase = cfg.renewal_form_url;
        }
      } catch (_lookupErr) {
        // Non-critical — fall back to default
      }
    }

    const sep = tallyFormBase.includes("?") ? "&" : "?";
    const tallyUrl = `${tallyFormBase}${sep}Name=${encodeURIComponent(customer_name || "")}&Mobile=${encodeURIComponent(tallyPhone)}`;

    // Build message based on type
    let message: string;
    if (message_type === "warranty_day14") {
      message = `Hi ${first_name}, this is Nicole from K&N Gas Services.\n\nWe are getting in touch to let you know your ${boiler_brand} ${boiler_model} boiler, installed on ${install_date_formatted}, is currently covered under the manufacturer's warranty.\n\n⚠️ Important: To keep your warranty valid, your boiler must be serviced by a registered Gas Safe engineer every year.\n\nBook your annual service here:\n👉 ${tallyUrl}\n\nOr call us on 📞 087 3685252\n\nK&N Gas Services`;
    } else if (message_type === "warranty_day28") {
      message = `Hi ${first_name}, this is Nicole from K&N Gas Services.\n\nWe messaged you two weeks ago about your new ${boiler_brand} ${boiler_model} boiler warranty. We just wanted to follow up — booking your annual service is the best way to keep your warranty valid and your boiler running safely.\n\nBook here:\n👉 ${tallyUrl}\n\nOr call us on 📞 087 3685252\n\nK&N Gas Services`;
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid message_type. Must be warranty_day14 or warranty_day28" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const THREESIXTY_API_KEY = Deno.env.get("THREESIXTY_API_KEY");
    if (!THREESIXTY_API_KEY) {
      throw new Error("THREESIXTY_API_KEY not set");
    }

    // Send via 360Messenger
    const formData = new FormData();
    formData.append("phonenumber", messengerPhone);
    formData.append("text", message);

    const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${THREESIXTY_API_KEY}` },
      body: formData,
    });

    const result = await response.text();

    // Log to edge_function_logs
    // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY already declared above

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/edge_function_logs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            function_name: "send-warranty-whatsapp",
            error_message: response.ok ? "OK" : `HTTP ${response.status}: ${result}`,
            payload: { customer_id, message_type, phone: messengerPhone, tally_phone: tallyPhone },
          }),
        });
      } catch (_logErr) {
        // Non-critical
      }
    }

    if (!response.ok) {
      throw new Error(`360Messenger error (${response.status}): ${result}`);
    }

    // Log customer activity
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const label = message_type === "warranty_day14" ? "Warranty Reminder (14-day)" : "Warranty Reminder (28-day)";
        await fetch(`${SUPABASE_URL}/rest/v1/customer_activity`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            organisation_id: orgId,
            customer_id,
            event_type: "whatsapp_sent",
            event_label: `WhatsApp sent — ${label}`,
          }),
        });
      } catch { /* non-critical */ }
    }

    // Post-send: update customer record
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        // Fetch current warranty_reminder_log and renewal_stage
        const custRes = await fetch(
          `${SUPABASE_URL}/rest/v1/customers?id=eq.${customer_id}&select=warranty_reminder_log,renewal_stage`,
          {
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
          }
        );
        const custData = await custRes.json();
        const customer = custData?.[0];

        if (customer) {
          const currentLog = Array.isArray(customer.warranty_reminder_log)
            ? customer.warranty_reminder_log
            : [];
          currentLog.push({
            sent_at: new Date().toISOString(),
            sent_by: "Auto",
            message_type,
          });

          const updatePayload: Record<string, unknown> = {
            warranty_reminder_log: currentLog,
          };

          // Advance stage if day14 and currently not_contacted
          if (
            message_type === "warranty_day14" &&
            customer.renewal_stage === "not_contacted"
          ) {
            updatePayload.renewal_stage = "reminded";
          }

          await fetch(
            `${SUPABASE_URL}/rest/v1/customers?id=eq.${customer_id}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                Prefer: "return=minimal",
              },
              body: JSON.stringify(updatePayload),
            }
          );
        }
      } catch (_updateErr) {
        // Non-critical
      }
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (_e) {
    return new Response(
      JSON.stringify({ error: (_e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
