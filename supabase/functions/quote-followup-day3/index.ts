import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getOrgBrandingClient,
  type OrgBranding,
} from "../_shared/orgBranding.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods":
    "GET, POST, OPTIONS",
};

const json = (
  body: unknown,
  status = 200
) =>
  new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  console.log(
    "[quote-followup-day3] function started",
    {
      ts: new Date().toISOString(),
    }
  );

  try {
    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL"
      )!;

    const serviceKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      )!;

    const supabase = createClient(
      supabaseUrl,
      serviceKey
    );

    const now = Date.now();

    const fourDaysAgo =
      new Date(
        now -
          4 *
            24 *
            60 *
            60 *
            1000
      ).toISOString();

    const threeDaysAgo =
      new Date(
        now -
          3 *
            24 *
            60 *
            60 *
            1000
      ).toISOString();

    const {
      data: quotes,
      error: qErr,
    } = await supabase
      .from("quotes")
      .select(
        "id, organisation_id, customer_id, user_id, customers(name, phone, opted_out)"
      )
      // Historic rows use 'Sent' (capitalised); 'viewed' is set by
      // mark_quote_viewed and is still an un-actioned quote.
      // Accepted/converted/rejected/expired excluded.
      .in("status", [
        "sent",
        "Sent",
        "viewed",
      ])
      .eq("approved", false)
      .eq(
        "follow_up_day3_sent",
        false
      )
      .gte(
        "sent_at",
        fourDaysAgo
      )
      .lte(
        "sent_at",
        threeDaysAgo
      );

    if (qErr) {
      console.error(
        "[quote-followup-day3] quote query error",
        qErr
      );

      return json(
        {
          error: qErr.message,
        },
        500
      );
    }

    console.log(
      "[quote-followup-day3] eligible quotes found",
      {
        count:
          quotes?.length ?? 0,
      }
    );

    let sent = 0;
    let skipped = 0;

    const apiKeyCache = new Map<
      string,
      string | null
    >();

    const brandingCache = new Map<
      string,
      OrgBranding
    >();

    for (const q of quotes || []) {
      const customer: any =
        (q as any).customers;

      if (
        !customer ||
        customer.opted_out ||
        !customer.phone
      ) {
        console.log(
          "[quote-followup-day3] skipped (no customer/opted-out/no phone)",
          {
            quote_id: q.id,
          }
        );

        skipped++;
        continue;
      }

      let apiKey =
        apiKeyCache.get(
          q.organisation_id
        ) ?? undefined;

      if (apiKey === undefined) {
        const {
          data: integration,
        } = await supabase
          .from(
            "tenant_integrations"
          )
          .select("config")
          .eq(
            "organisation_id",
            q.organisation_id
          )
          .eq(
            "integration_type",
            "360messenger"
          )
          .maybeSingle();

        const config =
          (integration?.config as any) ??
          {};

        const directApiKey =
          typeof config.api_key ===
          "string"
            ? config.api_key
            : null;

        const secretName =
          config.api_key_secret as
            | string
            | undefined;

        const secretApiKey = secretName
          ? Deno.env.get(
              secretName
            ) ?? null
          : null;

        apiKey =
          directApiKey ??
          secretApiKey ??
          null;

        apiKeyCache.set(
          q.organisation_id,
          apiKey
        );
      }

      if (!apiKey) {
        console.log(
          "[quote-followup-day3] skipped (no 360messenger api key)",
          {
            quote_id: q.id,
            org: q.organisation_id,
          }
        );

        skipped++;
        continue;
      }

      let branding =
        brandingCache.get(
          q.organisation_id
        );

      if (!branding) {
        branding =
          await getOrgBrandingClient(
            supabase,
            q.organisation_id
          );

        brandingCache.set(
          q.organisation_id,
          branding
        );
      }

      let phone = String(
        customer.phone
      )
        .replace(/[^\d+]/g, "")
        .replace(/^\+/, "");

      if (phone.startsWith("0")) {
        phone =
          "353" +
          phone.substring(1);
      }

      const firstName = String(
        customer.name ||
          "there"
      )
        .trim()
        .split(/\s+/)[0];

      const message =
        `Hi ${firstName}, just checking you got the quote we sent over. ` +
        `Happy to answer any questions or adjust anything if needed.\n\n` +
        `Thanks,\n${branding.name}`;

      const formData =
        new FormData();

      formData.append(
        "phonenumber",
        phone
      );

      formData.append(
        "text",
        message
      );

      let ok = false;
      let respStatus = 0;
      let respBody = "";

      console.log(
        "[quote-followup-day3] WhatsApp message attempted",
        {
          quote_id: q.id,
          phone,
        }
      );

      try {
        const resp = await fetch(
          "https://api.360messenger.com/v2/sendMessage",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
            body: formData,
          }
        );

        respStatus =
          resp.status;

        respBody =
          await resp.text();

        // 360Messenger can return HTTP 200 on a failed send,
        // so trust the payload when it is JSON with a success flag.
        try {
          const parsed =
            JSON.parse(
              respBody
            );

          ok =
            resp.ok &&
            parsed?.success ===
              true;
        } catch (_e) {
          ok = false;
        }
      } catch (e) {
        console.error(
          "[quote-followup-day3] WhatsApp send threw",
          {
            quote_id: q.id,
            error:
              e instanceof Error
                ? e.message
                : String(e),
          }
        );

        ok = false;
      }

      console.log(
        "[quote-followup-day3] WhatsApp response",
        {
          quote_id: q.id,
          ok,
          status: respStatus,
          body: respBody.slice(
            0,
            300
          ),
        }
      );

      try {
        const {
          error: wmErr,
        } = await supabase
          .from(
            "whatsapp_messages"
          )
          .insert({
            user_id:
              q.user_id ?? null,
            customer_id:
              q.customer_id,
            organisation_id:
              q.organisation_id,
            phone_number:
              phone,
            message_type:
              "quote_followup_day3",
            message_body:
              message,
            direction:
              "outbound",
            status: ok
              ? "Sent"
              : "Failed",
            linked_quote_id:
              q.id,
            sent_by:
              "system",
          });

        const {
          error: mlErr,
        } = await supabase
          .from("message_log")
          .insert({
            organisation_id:
              q.organisation_id,
            customer_id:
              q.customer_id,
            message_type:
              "quote_followup_day3",
            channel:
              "whatsapp",
            direction:
              "outbound",
            content:
              message,
            status: ok
              ? "success"
              : "fail",
            related_id:
              q.id,
            related_type:
              "quote",
            sent_by:
              "system",
            sent_at:
              new Date().toISOString(),
          });

        console.log(
          "[quote-followup-day3] message saved to history",
          {
            quote_id: q.id,
            whatsapp_messages_error:
              wmErr?.message ??
              null,
            message_log_error:
              mlErr?.message ??
              null,
          }
        );
      } catch (e) {
        console.error(
          "[quote-followup-day3] save-to-history failed",
          {
            quote_id: q.id,
            error:
              e instanceof Error
                ? e.message
                : String(e),
          }
        );
      }

      if (ok) {
        await supabase
          .from("quotes")
          .update({
            follow_up_day3_sent:
              true,
            follow_up_sent:
              true,
          })
          .eq(
            "id",
            q.id
          );

        sent++;
      } else {
        skipped++;
      }
    }

    console.log(
      "[quote-followup-day3] finished",
      {
        sent,
        skipped,
      }
    );

    return json({
      success: true,
      sent,
      skipped,
    });
  } catch (e) {
    console.error(
      "[quote-followup-day3] fatal error",
      e
    );

    return json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Unknown error",
      },
      500
    );
  }
});