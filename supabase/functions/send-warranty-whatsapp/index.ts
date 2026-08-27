import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchWhatsappApiKey } from "../_shared/whatsappCredentials.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { logMessage } from "../_shared/logMessage.ts";
import { getOrgBranding } from "../_shared/orgBranding.ts";
import { evaluateOptOut } from "../_shared/optOut.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods":
    "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
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

    if (
      !phone ||
      !customer_id ||
      !message_type
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Missing required fields (phone, customer_id, message_type)",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // Strip all non-numeric characters and
    // normalise to full international
    let digits = phone.replace(
      /\D/g,
      ""
    );

    if (
      digits.startsWith("353") &&
      digits.length === 12
    ) {
      // Already full international.
    } else if (
      digits.startsWith("0") &&
      digits.length === 10
    ) {
      digits =
        "353" +
        digits.slice(1);
    } else if (
      digits.length === 9
    ) {
      digits =
        "353" + digits;
    }

    const messengerPhone =
      digits;

    const tallyPhone =
      "0" + digits.slice(3);

    // Resolve org + Tally form URL +
    // WhatsApp api_key from customer
    const SUPABASE_URL =
      Deno.env.get(
        "SUPABASE_URL"
      );

    const SUPABASE_SERVICE_ROLE_KEY =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      );

    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error(
        "Supabase env not configured"
      );
    }

    const sbHeaders = {
      apikey:
        SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    };

    const custOrgRes =
      await fetch(
        `${SUPABASE_URL}/rest/v1/customers?id=eq.${customer_id}&select=organisation_id,opted_out,phone&limit=1`,
        {
          headers: sbHeaders,
        }
      );

    const custOrgRows =
      await custOrgRes.json();

    const custRow =
      Array.isArray(
        custOrgRows
      )
        ? custOrgRows[0] ??
          null
        : null;

    const orgId: string | null =
      custRow?.organisation_id ??
      null;

    // Warranty reminders are outreach,
    // not transactional — respect opt-out.
    const optOut =
      evaluateOptOut(
        custRow
      );

    if (
      optOut.skip &&
      optOut.reason ===
        "customer_opted_out"
    ) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason:
            "customer_opted_out",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    if (!orgId) {
      return new Response(
        JSON.stringify({
          error:
            "Customer missing organisation_id",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    const logClient =
      createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      );

    const logSkip = async (
      reason: string,
      detail: string
    ) => {
      try {
        await fetch(
          `${SUPABASE_URL}/rest/v1/edge_function_logs`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              apikey:
                SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              Prefer:
                "return=minimal",
            },
            body: JSON.stringify({
              function_name:
                "send-warranty-whatsapp",
              error_message:
                `SKIPPED: ${reason} — ${detail}`,
              payload: {
                customer_id,
                message_type,
                organisation_id:
                  orgId,
                phone:
                  messengerPhone,
              },
            }),
          }
        );
      } catch (_logErr) {
        // Non-critical.
      }

      await logMessage(
        logClient,
        {
          organisation_id:
            orgId,
          customer_id,
          message_type,
          content:
            `Skipped: ${reason} — ${detail}`,
          status: "failed",
          channel:
            "whatsapp",
          recipient_phone:
            `+${messengerPhone}`,
        }
      );
    };

    // Tally renewal form URL must be
    // configured per organisation.
    // No cross-tenant fallback.
    let tallyFormBase:
      | string
      | null = null;

    try {
      const tiTallyRes =
        await fetch(
          `${SUPABASE_URL}/rest/v1/tenant_integrations?organisation_id=eq.${orgId}&integration_type=eq.tally&select=config&limit=1`,
          {
            headers:
              sbHeaders,
          }
        );

      const tiTallyRows =
        await tiTallyRes.json();

      const cfg =
        Array.isArray(
          tiTallyRows
        )
          ? tiTallyRows[0]
              ?.config
          : null;

      if (
        cfg?.renewal_form_url
      ) {
        tallyFormBase =
          cfg.renewal_form_url;
      }
    } catch (
      _lookupErr
    ) {
      // Treated as missing —
      // guard below skips.
    }

    if (!tallyFormBase) {
      await logSkip(
        "missing_renewal_form_url",
        "tenant_integrations(tally).config.renewal_form_url is not set for this organisation"
      );

      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason:
            "missing_renewal_form_url",
          organisation_id:
            orgId,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // WhatsApp api_key via shared resolver
    // (api_key_secret or api_key, either row type)
    const wa =
      await fetchWhatsappApiKey(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        orgId
      );

    if (!wa.apiKey) {
      await logSkip(
        "missing_whatsapp_api_key",
        wa.detail ||
          "WhatsApp integration is not configured for this organisation"
      );

      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason:
            "missing_whatsapp_api_key",
          organisation_id:
            orgId,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    const THREESIXTY_API_KEY =
      wa.apiKey;

    const sep =
      tallyFormBase.includes("?")
        ? "&"
        : "?";

    const tallyUrl =
      `${tallyFormBase}${sep}` +
      `Name=${encodeURIComponent(
        customer_name || ""
      )}` +
      `&Mobile=${encodeURIComponent(
        tallyPhone
      )}`;

    // Build message based on type
    const branding =
      await getOrgBranding(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        orgId
      );

    // Branding must be configured per-org.
    if (
      !branding.name ||
      branding.name ===
        "our team"
    ) {
      await logSkip(
        "missing_branding",
        "settings.business_name/company_name is not set for this organisation"
      );

      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason:
            "missing_branding",
          organisation_id:
            orgId,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    const phoneLine =
      branding.phone
        ? `\n\nOr call us on 📞 ${branding.phone}`
        : "";

    const footerLine =
      branding.footer ||
      branding.name;

    let message: string;

    if (
      message_type ===
      "warranty_day14"
    ) {
      message =
        `Hi ${first_name}, this is ${branding.name}.\n\n` +
        `We are getting in touch to let you know your ${boiler_brand} ${boiler_model} boiler, installed on ${install_date_formatted}, is currently covered under the manufacturer's warranty.\n\n` +
        `⚠️ Important: To keep your warranty valid, your boiler must be serviced by a registered Gas Safe engineer every year.\n\n` +
        `Book your annual service here:\n👉 ${tallyUrl}` +
        `${phoneLine}\n\n` +
        `${footerLine}`;
    } else if (
      message_type ===
      "warranty_day28"
    ) {
      message =
        `Hi ${first_name}, this is ${branding.name}.\n\n` +
        `We messaged you two weeks ago about your new ${boiler_brand} ${boiler_model} boiler warranty. We just wanted to follow up — booking your annual service is the best way to keep your warranty valid and your boiler running safely.\n\n` +
        `Book here:\n👉 ${tallyUrl}` +
        `${phoneLine}\n\n` +
        `${footerLine}`;
    } else {
      return new Response(
        JSON.stringify({
          error:
            "Invalid message_type. Must be warranty_day14 or warranty_day28",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // Send via 360Messenger
    const formData =
      new FormData();

    formData.append(
      "phonenumber",
      messengerPhone
    );

    formData.append(
      "text",
      message
    );

    const response =
      await fetch(
        "https://api.360messenger.com/v2/sendMessage",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${THREESIXTY_API_KEY}`,
          },
          body: formData,
        }
      );

    const result =
      await response.text();

    // Log to edge_function_logs
    if (
      SUPABASE_URL &&
      SUPABASE_SERVICE_ROLE_KEY
    ) {
      try {
        await fetch(
          `${SUPABASE_URL}/rest/v1/edge_function_logs`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              apikey:
                SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              Prefer:
                "return=minimal",
            },
            body: JSON.stringify({
              function_name:
                "send-warranty-whatsapp",
              error_message:
                response.ok
                  ? "OK"
                  : `HTTP ${response.status}: ${result}`,
              payload: {
                customer_id,
                message_type,
                phone:
                  messengerPhone,
                tally_phone:
                  tallyPhone,
              },
            }),
          }
        );
      } catch (_logErr) {
        // Non-critical.
      }
    }

    if (!response.ok) {
      await logMessage(
        logClient,
        {
          organisation_id:
            orgId,
          customer_id,
          message_type:
            message_type ===
            "warranty_day14"
              ? "warranty_day14"
              : "warranty_day28",
          content:
            message,
          status:
            "failed",
          channel:
            "whatsapp",
          recipient_phone:
            `+${messengerPhone}`,
        }
      );

      throw new Error(
        `360Messenger error (${response.status}): ${result}`
      );
    }

    await logMessage(
      logClient,
      {
        organisation_id:
          orgId,
        customer_id,
        message_type:
          message_type ===
          "warranty_day14"
            ? "warranty_day14"
            : "warranty_day28",
        content:
          message,
        status:
          "sent",
        channel:
          "whatsapp",
        recipient_phone:
          `+${messengerPhone}`,
      }
    );

    // Log customer activity
    if (
      SUPABASE_URL &&
      SUPABASE_SERVICE_ROLE_KEY
    ) {
      try {
        const label =
          message_type ===
          "warranty_day14"
            ? "Warranty Reminder (14-day)"
            : "Warranty Reminder (28-day)";

        await fetch(
          `${SUPABASE_URL}/rest/v1/customer_activity`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              apikey:
                SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              Prefer:
                "return=minimal",
            },
            body: JSON.stringify({
              organisation_id:
                orgId,
              customer_id,
              event_type:
                "whatsapp_sent",
              event_label:
                `WhatsApp sent — ${label}`,
            }),
          }
        );
      } catch {
        // Non-critical.
      }
    }

    // Post-send: update customer record
    if (
      SUPABASE_URL &&
      SUPABASE_SERVICE_ROLE_KEY
    ) {
      try {
        const custRes =
          await fetch(
            `${SUPABASE_URL}/rest/v1/customers?id=eq.${customer_id}&select=warranty_reminder_log,renewal_stage`,
            {
              headers: {
                apikey:
                  SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
            }
          );

        const custData =
          await custRes.json();

        const customer =
          custData?.[0];

        if (customer) {
          const currentLog =
            Array.isArray(
              customer.warranty_reminder_log
            )
              ? customer.warranty_reminder_log
              : [];

          currentLog.push({
            sent_at:
              new Date().toISOString(),
            sent_by: "Auto",
            message_type,
          });

          const updatePayload:
            Record<
              string,
              unknown
            > = {
              warranty_reminder_log:
                currentLog,
            };

          // Advance stage if day14
          // and currently not_contacted
          if (
            message_type ===
              "warranty_day14" &&
            customer.renewal_stage ===
              "not_contacted"
          ) {
            updatePayload.renewal_stage =
              "reminded";
          }

          await fetch(
            `${SUPABASE_URL}/rest/v1/customers?id=eq.${customer_id}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type":
                  "application/json",
                apikey:
                  SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                Prefer:
                  "return=minimal",
              },
              body: JSON.stringify(
                updatePayload
              ),
            }
          );
        }
      } catch (_updateErr) {
        // Non-critical.
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        result,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  } catch (_e) {
    return new Response(
      JSON.stringify({
        error:
          _e instanceof Error
            ? _e.message
            : String(_e),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  }
});