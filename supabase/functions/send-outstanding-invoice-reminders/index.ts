import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWhatsappApiKeyWithClient } from "../_shared/whatsappCredentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

// BJ-B2a: no hardcoded payment-link or branding fallbacks.
// A tenant without its own payment link / business details is skipped
// and logged — never routed to another tenant's payment account.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

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

    const {
      organisation_id,
    } = await req
      .json()
      .catch(() => ({}));

    if (!organisation_id) {
      return json(
        {
          error:
            "organisation_id is required",
        },
        400
      );
    }

    const now = Date.now();

    const fourteenDaysAgo =
      new Date(
        now -
          14 *
            24 *
            60 *
            60 *
            1000
      ).toISOString();

    const sixtyDaysAgo =
      new Date(
        now -
          60 *
            24 *
            60 *
            60 *
            1000
      ).toISOString();

    // 1. Outstanding invoices
    const {
      data: jobs,
      error: jobsErr,
    } =
      await supabase
        .from("service_calls")
        .select(
          "id, organisation_id, balance_due, completed_at, invoiced_at, invoice_reminder_count, customer_id, customers(name, phone, opted_out)"
        )
        .eq(
          "organisation_id",
          organisation_id
        )
        .eq(
          "payment_status",
          "unpaid"
        )
        .eq(
          "payment_method",
          "invoice"
        )
        .lt(
          "invoice_reminder_count",
          2
        )
        .gte(
          "completed_at",
          sixtyDaysAgo
        )
        .lte(
          "completed_at",
          fourteenDaysAgo
        )
        .not(
          "completed_at",
          "is",
          null
        );

    if (jobsErr) {
      return json(
        {
          error:
            jobsErr.message,
        },
        500
      );
    }

    // 2. WhatsApp integration
    // Shared resolver handles api_key_secret and literal api_key.
    const {
      data: integration,
    } =
      await supabase
        .from(
          "tenant_integrations"
        )
        .select("config")
        .eq(
          "organisation_id",
          organisation_id
        )
        .eq(
          "integration_type",
          "360messenger"
        )
        .maybeSingle();

    const cfg =
      (integration?.config as any) ||
      {};

    // 2b. Tenant business details
    // Single source of truth, no hardcoded branding.
    const {
      data: orgSettings,
    } =
      await supabase
        .from("settings")
        .select(
          "business_name, business_phone"
        )
        .eq(
          "organisation_id",
          organisation_id
        )
        .maybeSingle();

    const businessName =
      String(
        orgSettings?.business_name ??
          ""
      ).trim();

    const businessPhone =
      String(
        orgSettings?.business_phone ??
          ""
      ).trim();

    // Stripe payment link is tenant-specific.
    // Prefer tenant Stripe integration, then legacy config.stripe_payment_link.
    const {
      data: stripeIntegration,
    } =
      await supabase
        .from(
          "tenant_integrations"
        )
        .select("config")
        .eq(
          "organisation_id",
          organisation_id
        )
        .eq(
          "integration_type",
          "stripe"
        )
        .maybeSingle();

    const stripeLink = String(
      (
        stripeIntegration?.config as any
      )?.payment_link ??
        cfg.stripe_payment_link ??
        ""
    ).trim();

    // Pre-flight guards (BJ-B2a).
    // Missing tenant configuration stops the batch before any message is sent
    // and before any invoice reminder counter moves.
    const missing =
      !stripeLink
        ? "payment_link_not_configured"
        : !businessName
          ? "business_name_not_configured"
          : !businessPhone
            ? "business_phone_not_configured"
            : null;

    if (missing) {
      await supabase
        .from(
          "edge_function_logs"
        )
        .insert({
          function_name:
            "send-outstanding-invoice-reminders",
          error_message:
            `Skipped: ${missing} for organisation`,
          payload: {
            organisation_id,
            reason: missing,
          },
        });

      return json({
        success: true,
        skipped: true,
        reason: missing,
        sent: 0,
      });
    }

    const keyRes =
      await fetchWhatsappApiKeyWithClient(
        supabase,
        organisation_id
      );

    if (!keyRes.apiKey) {
      console.error(
        `[send-outstanding-invoice-reminders] no WhatsApp key for org ${organisation_id} (${keyRes.resolution})`
      );

      return json(
        {
          error:
            "WhatsApp integration not configured",
          detail:
            keyRes.detail,
          resolution:
            keyRes.resolution,
        },
        400
      );
    }

    const apiKey =
      keyRes.apiKey;

    let sent = 0;
    let skipped = 0;

    for (const j of jobs || []) {
      const customer: any =
        (j as any).customers;

      if (
        !customer ||
        customer.opted_out ||
        !customer.phone
      ) {
        skipped++;
        continue;
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

      const firstName =
        String(
          customer.name ||
            "there"
        )
          .trim()
          .split(/\s+/)[0];

      const invoiceDateRaw =
        j.invoiced_at ||
        j.completed_at;

      let invoiceDate = "—";

      if (invoiceDateRaw) {
        const d =
          new Date(
            invoiceDateRaw
          );

        const dd = String(
          d.getDate()
        ).padStart(2, "0");

        const mm = String(
          d.getMonth() + 1
        ).padStart(2, "0");

        invoiceDate = `${dd}/${mm}/${d.getFullYear()}`;
      }

      const balance =
        Number(
          j.balance_due || 0
        ).toFixed(2);

      const message =
        `Hi ${firstName}, this is a friendly reminder from ${businessName} that you have an outstanding balance of €${balance} for work completed on ${invoiceDate}.\n\n` +
        `Pay securely here: ${stripeLink}\n\n` +
        `If you have already made payment please ignore this message. Any questions reply to this message.\n\n` +
        `${businessName} ☎️ ${businessPhone}`;

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

      let responseBody = "";
      let responseStatus = 0;

      try {
        const resp =
          await fetch(
            "https://api.360messenger.com/v2/sendMessage",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
              body: formData,
            }
          );

        responseStatus =
          resp.status;

        responseBody =
          await resp.text();

        // 360Messenger may return HTTP 200 even when
        // the payload reports an unsuccessful send.
        try {
          const parsed =
            JSON.parse(
              responseBody
            );

          ok =
            resp.ok &&
            parsed?.success ===
              true;
        } catch {
          ok = false;
        }
      } catch (_e) {
        ok = false;
      }

      try {
        const logResp =
          await fetch(
            `${supabaseUrl}/functions/v1/log-message`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
                Authorization: `Bearer ${serviceKey}`,
                "x-make-secret":
                  Deno.env.get(
                    "MAKE_WEBHOOK_SECRET"
                  ) ?? "",
              },
              body: JSON.stringify({
                service_call_id:
                  j.id,
                organisation_id,
                customer_id:
                  j.customer_id,
                message_type:
                  "outstanding_invoice",
                channel:
                  "whatsapp",
                direction:
                  "outbound",
                recipient_phone:
                  phone,
                message_body:
                  message,
                status: ok
                  ? "success"
                  : "fail",
              }),
            }
          );

        if (!logResp.ok) {
          console.error(
            "log-message returned",
            logResp.status,
            await logResp.text()
          );
        }
      } catch (_e) {
        console.error(
          "log-message invoke failed",
          _e
        );
      }

      if (ok) {
        const currentCount =
          j.invoice_reminder_count ||
          0;

        const updatePayload: Record<
          string,
          any
        > = {
          invoice_reminder_count:
            currentCount + 1,
        };

        if (currentCount === 0) {
          updatePayload.invoice_reminder_sent_at =
            new Date().toISOString();
        } else if (
          currentCount === 1
        ) {
          updatePayload.invoice_reminder_2_sent_at =
            new Date().toISOString();
        }

        await supabase
          .from("service_calls")
          .update(
            updatePayload
          )
          .eq(
            "id",
            j.id
          );

        sent++;
      } else {
        console.error(
          "[send-outstanding-invoice-reminders] WhatsApp send failed",
          {
            service_call_id:
              j.id,
            status:
              responseStatus,
            body:
              responseBody.slice(
                0,
                300
              ),
          }
        );

        skipped++;
      }
    }

    return json({
      success: true,
      sent,
      skipped,
    });
  } catch (e) {
    console.error(
      "send-outstanding-invoice-reminders error",
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