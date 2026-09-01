import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isDenied, requireResourceOrgAccess } from "../_shared/orgAuth.ts";
import {
  consentSkipResponse,
  requireCustomerMessagingConsent,
} from "../_shared/messagingConsent.ts";
import { getTenantPublicUrl } from "../_shared/tenantDomain.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { beginDelivery, completeDelivery } from "../_shared/deliveryStatus.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const reqBody = await req.json();

    const {
      quote_id,
      customer_name,
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
    } = reqBody;

    // A resend owns its own attempt record, so this path must not open a second
    // one for the same delivery.
    const skipTracking =
      reqBody?.skip_delivery_tracking === true;

    // IDOR guard: prove the caller belongs to the quote's organisation before
    // acting with that tenant's WhatsApp credentials.
    const access = await requireResourceOrgAccess(req, {
      fnName: "send-quote-whatsapp",
      cors: corsHeaders,
      resource: { table: "quotes", id: quote_id },
    });
    if (isDenied(access)) return access.error;

    if (
      !quote_id ||
      quote_amount == null
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Missing required fields",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
          status: 400,
        }
      );
    }

    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL"
      );

    const supabaseKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      );

    const dbHeaders = {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey!,
      "Content-Type":
        "application/json",
    };

    // Derive organisation_id, customer_id,
    // and access_token from quote
    const quoteRes = await fetch(
      `${supabaseUrl}/rest/v1/quotes?id=eq.${quote_id}&select=organisation_id,customer_id,access_token&limit=1`,
      {
        headers: dbHeaders,
      }
    );

    const quoteRows =
      await quoteRes.json();

    const orgId =
      Array.isArray(quoteRows) &&
      quoteRows[0]?.organisation_id;

    const resolvedCustomerId =
      (Array.isArray(
        quoteRows
      ) &&
        quoteRows[0]?.customer_id) ||
      customer_id ||
      null;

    const quoteToken =
      Array.isArray(
        quoteRows
      )
        ? quoteRows[0]?.access_token
        : null;

    if (!orgId) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Quote missing organisation_id",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
          status: 400,
        }
      );
    }

    // Consent gate: opted_out is authoritative and the recipient number is the
    // DB-stored one — a body-supplied mobile_number can never be messaged.
    const consent = await requireCustomerMessagingConsent({
      fnName: "send-quote-whatsapp",
      orgId: access.orgId,
      customerId: resolvedCustomerId,
    });
    if (!consent.allowed) return consentSkipResponse(consent.reason, corsHeaders);
    const recipientNumber = consent.phone;
    const recipientName = consent.name || customer_name || "there";

    // Tenant public URLs are resolved through
    // getTenantPublicUrl().
    // No slug fallback: if the tenant has no configured
    // public domain, the relevant link is omitted.
    const acceptUrl = quoteToken
      ? await getTenantPublicUrl(
          supabaseUrl,
          orgId,
          `/quote/${quoteToken}`
        )
      : null;

    const quotePdfUrl =
      pdf_url && quoteToken
        ? await getTenantPublicUrl(
            supabaseUrl,
            orgId,
            `/pdf/${quoteToken}`
          )
        : null;

    if (!acceptUrl) {
      console.warn(
        `[send-quote-whatsapp] organisation ${orgId} has no public_domain or quote has no access_token; omitting quote accept link`
      );
    }

    if (
      pdf_url &&
      !quotePdfUrl
    ) {
      console.warn(
        `[send-quote-whatsapp] organisation ${orgId} has no public_domain or quote has no access_token; omitting quote PDF link`
      );
    }

    // Fetch tenant WhatsApp integration config.
    const tiRes = await fetch(
      `${supabaseUrl}/rest/v1/tenant_integrations?organisation_id=eq.${orgId}&integration_type=eq.360messenger&select=config&limit=1`,
      {
        headers: dbHeaders,
      }
    );

    const tiRows =
      await tiRes.json();

    const config =
      Array.isArray(tiRows) &&
      tiRows[0]?.config
        ? tiRows[0].config
        : null;

    const apiKeySecretName =
      config?.api_key_secret as
        | string
        | undefined;

    const apiKey =
      (
        apiKeySecretName
          ? Deno.env.get(
              apiKeySecretName
            )
          : null
      ) ??
      // Tenant credentials only — no shared THREESIXTY_API_KEY fallback.
      config?.api_key;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "WhatsApp integration not configured for this organisation",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
          status: 400,
        }
      );
    }

    // Fetch message_footer from settings.
    // No shared fallback: a blank footer skips and logs.
    let messageFooter = "";

    const settingsRes =
      await fetch(
        `${supabaseUrl}/rest/v1/settings?organisation_id=eq.${orgId}&select=message_footer&limit=1`,
        {
          headers: dbHeaders,
        }
      );

    const settings =
      await settingsRes.json();

    if (
      Array.isArray(settings) &&
      settings[0]?.message_footer
    ) {
      messageFooter =
        settings[0]
          .message_footer;
    }

    messageFooter =
      String(
        messageFooter
      ).trim();

    if (!messageFooter) {
      await fetch(
        `${supabaseUrl}/rest/v1/edge_function_logs`,
        {
          method: "POST",
          headers: dbHeaders,
          body: JSON.stringify({
            function_name:
              "send-quote-whatsapp",
            error_message:
              "Skipped: message_footer_not_configured for organisation",
            payload: {
              organisation_id:
                orgId,
              quote_id,
              reason:
                "message_footer_not_configured",
            },
          }),
        }
      );

      return new Response(
        JSON.stringify({
          success: false,
          whatsapp_sent: false,
          skipped: true,
          reason:
            "message_footer_not_configured",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
          status: 200,
        }
      );
    }

    const firstName =
      String(recipientName).split(" ")[0];

    const refNumber =
      quote_number ||
      `Q-${quote_id
        .substring(0, 4)
        .toUpperCase()}`;

    const deposit = Number(
      deposit_amount || 0
    );

    let message =
      `Hi ${firstName},

Here is your quote for ${job_description}.

Quote No: ${refNumber}

Total: €${Number(
        quote_amount
      ).toFixed(2)}`;

    if (deposit > 0) {
      message += `\n\nDeposit to secure booking: €${deposit.toFixed(
        2
      )}`;
    }

    message += `

To accept this quote, reply:
YES ${refNumber}`;

    if (acceptUrl) {
      message += `\n\nView and approve here:\n${acceptUrl}`;
    }

    if (quotePdfUrl) {
      message += `\n\n📄 View your full quote PDF:\n${quotePdfUrl}`;
    }

    message += `\n\n${messageFooter}`;

    if (business_phone) {
      message += `\n📞 ${business_phone}`;
    }

    // Domain regression guard.
    // Block any bookedjobs.ie link whose host is NOT the tenant's
    // configured public_domain (hyphens are legitimate, e.g.
    // dublin-gas.bookedjobs.ie). If tripped, log and abort.
    const tenantHost = (
      acceptUrl ||
      quotePdfUrl ||
      ""
    ).replace(
      /^https?:\/\/([^/]+).*$/,
      "$1"
    );

    const badDomainMatch =
      message.match(
        /https?:\/\/([a-z0-9-]+\.bookedjobs\.ie)/i
      );

    if (
      badDomainMatch &&
      tenantHost &&
      badDomainMatch[1].toLowerCase() !==
        tenantHost.toLowerCase()
    ) {

      await fetch(
        `${supabaseUrl}/rest/v1/debug_logs`,
        {
          method: "POST",
          headers: dbHeaders,
          body: JSON.stringify({
            event:
              "send-quote-whatsapp:hyphenated_domain_blocked",
            job_id: refNumber,
            payload: {
              blocked_url:
                badDomainMatch[0],
              offending_subdomain:
                badDomainMatch[1],
              quote_id,
              quote_number:
                refNumber,
              organisation_id:
                orgId,
            },
          }),
        }
      ).catch(() => {});

      return new Response(
        JSON.stringify({
          success: false,
          error: `Domain regression detected: ${badDomainMatch[0]}. Fix the tenant public domain configuration for this organisation.`,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
          status: 500,
        }
      );
    }

    // Log pending message
    const logRes =
      await fetch(
        `${supabaseUrl}/rest/v1/message_log`,
        {
          method: "POST",
          headers: {
            ...dbHeaders,
            Prefer:
              "return=representation",
          },
          body: JSON.stringify({
            organisation_id:
              orgId,
            customer_id:
              resolvedCustomerId,
            message_type:
              "quote",
            channel:
              "whatsapp",
            direction:
              "outbound",
            content:
              message,
            status:
              "pending",
            related_id:
              quote_id,
            related_type:
              "quote",
            sent_by:
              sent_by_user_id ||
              "system",
            sent_at:
              new Date().toISOString(),
          }),
        }
      );

    const logRows =
      await logRes.json();

    const logId =
      Array.isArray(logRows)
        ? logRows[0]?.id
        : null;

    const cleanNumber =
      recipientNumber.replace(
        /^\+/,
        ""
      );

    // Delivery tracking (office badge + failure alert + resend history).
    const trackingClient = createClient(
      supabaseUrl!,
      supabaseKey!
    );

    const deliveryHandle = skipTracking
      ? null
      : await beginDelivery(
        trackingClient,
        {
          organisationId: orgId,
          customerId:
            resolvedCustomerId,
          commType: "quote",
          channel: "whatsapp",
          relatedType: "quote",
          relatedId: quote_id,
          relatedReference:
            quote_number ?? null,
          recipient: cleanNumber,
        }
      );

    const formData =
      new FormData();

    formData.append(
      "phonenumber",
      cleanNumber
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
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
        }
      );

    const resultText =
      await response.text();

    let result: any;

    try {
      result =
        JSON.parse(
          resultText
        );
    } catch {
      result = {
        success: false,
        raw: resultText,
      };
    }

    await completeDelivery(
      trackingClient,
      {
        handle: deliveryHandle,
        channel: "whatsapp",
        ok: !!result.success,
        providerError: result.success
          ? null
          : `[${response.status}] ${resultText.substring(0, 500)}`,
        recipient: cleanNumber,
      }
    );

    // Update message_log status
    if (logId) {
      const updateBody =
        result.success
          ? { status: "sent" }
          : {
              status: "failed",
              error_message: `360Messenger HTTP ${response.status}: ${resultText.substring(
                0,
                500
              )}`,
            };

      await fetch(
        `${supabaseUrl}/rest/v1/message_log?id=eq.${logId}`,
        {
          method: "PATCH",
          headers: dbHeaders,
          body: JSON.stringify(
            updateBody
          ),
        }
      );
    }

    if (result.success) {
      // Never re-open an already-actioned quote.
      // Resending WhatsApp must not restore an Accepted/Paid/
      // converted/rejected quote to Sent.
      await fetch(
        `${supabaseUrl}/rest/v1/quotes?id=eq.${quote_id}&access_token_used_at=is.null&status=not.in.(Accepted,accepted,Paid,paid,converted,Converted,Rejected,rejected)`,
        {
          method: "PATCH",
          headers: dbHeaders,
          body: JSON.stringify({
            status: "Sent",
            sent_at:
              new Date().toISOString(),
          }),
        }
      );

      // sent_at is still stamped for quotes already actioned,
      // but their status is untouched.
      await fetch(
        `${supabaseUrl}/rest/v1/quotes?id=eq.${quote_id}&access_token_used_at=not.is.null`,
        {
          method: "PATCH",
          headers: dbHeaders,
          body: JSON.stringify({
            sent_at:
              new Date().toISOString(),
          }),
        }
      );

      // Log customer activity
      if (customer_id) {
        try {
          await fetch(
            `${supabaseUrl}/rest/v1/customer_activity`,
            {
              method:
                "POST",
              headers:
                dbHeaders,
              body: JSON.stringify({
                organisation_id:
                  orgId,
                customer_id,
                event_type:
                  "whatsapp_sent",
                event_label:
                  "WhatsApp sent — Quote",
              }),
            }
          );
        } catch {
          // non-critical
        }
      }
    } else {
      const errorDetail =
        `360Messenger HTTP ${response.status}: ${resultText.substring(
          0,
          500
        )}`;

      await fetch(
        `${supabaseUrl}/rest/v1/edge_function_logs`,
        {
          method: "POST",
          headers: dbHeaders,
          body: JSON.stringify({
            function_name:
              "send-quote-whatsapp",
            error_message:
              `360Messenger API returned success:false. HTTP ${response.status}`,
            payload: {
              api_response:
                result,
              sent_to:
                recipientNumber,
              quote_id,
            },
          }),
        }
      );

      // Insert failure notification for office/admin users
      const usersRes =
        await fetch(
          `${supabaseUrl}/rest/v1/engineers?user_id=eq.${
            sent_by_user_id || ""
          }&role=in.(admin,office)&auth_user_id=not.is.null&select=auth_user_id`,
          {
            headers: dbHeaders,
          }
        );

      const adminUsers =
        await usersRes.json();

      const recipientIds =
        new Set<string>();

      if (
        sent_by_user_id
      ) {
        recipientIds.add(
          sent_by_user_id
        );
      }

      if (
        Array.isArray(
          adminUsers
        )
      ) {
        adminUsers.forEach(
          (u: any) => {
            if (
              u.auth_user_id
            ) {
              recipientIds.add(
                u.auth_user_id
              );
            }
          }
        );
      }

      for (
        const recipientId of recipientIds
      ) {
        await fetch(
          `${supabaseUrl}/rest/v1/notifications`,
          {
            method: "POST",
            headers: dbHeaders,
            body: JSON.stringify({
              recipient_user_id:
                recipientId,
              notification_type:
                "message",
              title:
                "⚠️ WhatsApp Send Failed",
              body:
                `Failed to send WhatsApp to ${recipientName} (${recipientNumber}). Please contact them manually. Error: ${errorDetail.substring(
                  0,
                  200
                )}`,
              role:
                "office",
              metadata: {
                quote_id,
                customer_name: recipientName,
                phone:
                  recipientNumber,
                error:
                  errorDetail.substring(
                    0,
                    200
                  ),
              },
            }),
          }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success:
          result.success,
        error_detail:
          result.success
            ? undefined
            : `360Messenger HTTP ${response.status}: ${resultText.substring(
                0,
                300
              )}`,
        customer_name,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
        error_detail:
          error instanceof Error
            ? error.message
            : String(error),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
        status: 500,
      }
    );
  }
});