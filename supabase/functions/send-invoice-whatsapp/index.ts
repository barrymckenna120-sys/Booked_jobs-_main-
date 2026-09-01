import { createClient } from "npm:@supabase/supabase-js@2";
import { isDenied, requireResourceOrgAccess } from "../_shared/orgAuth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { beginDelivery, completeDelivery } from "../_shared/deliveryStatus.ts";



Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
      service_call_id,
    } = await req.json();

    // IDOR guard: prove the caller belongs to the organisation that owns this
    // record before loading it or acting with that tenant's credentials.
    const access = await requireResourceOrgAccess(req, {
      fnName: "send-invoice-whatsapp",
      cors: corsHeaders,
      resource: { table: "service_calls", id: service_call_id },
    });
    if (isDenied(access)) return access.error;


    if (!service_call_id) {
      return json(
        {
          error:
            "service_call_id is required",
        },
        400
      );
    }

    // 1. Fetch job + customer
    const {
      data: job,
      error: jobErr,
    } =
      await supabase
        .from("service_calls")
        .select(
          "id, organisation_id, job_reference, invoice_number, invoiced_at, balance_due, customer_id"
        )
        .eq(
          "id",
          service_call_id
        )
        .single();

    if (jobErr || !job) {
      return json(
        {
          error: "Job not found",
        },
        404
      );
    }

    const {
      data: customer,
    } =
      await supabase
        .from("customers")
        .select(
          "name, phone, opted_out"
        )
        .eq(
          "id",
          job.customer_id
        )
        .single();

    if (!customer) {
      return json(
        {
          error:
            "Customer not found",
        },
        404
      );
    }

    // 2. Opt-out check
    if (customer.opted_out) {
      return json({
        success: true,
        message:
          "Customer opted out",
      });
    }

    if (!customer.phone) {
      return json(
        {
          error:
            "Customer has no phone number",
        },
        400
      );
    }

    // 3. tenant_integrations: WhatsApp config
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
          job.organisation_id
        )
        .eq(
          "integration_type",
          "360messenger"
        )
        .maybeSingle();

    const cfg =
      (integration?.config ??
        {}) as Record<
        string,
        any
      >;

    // BJ-0090: tenant credentials ONLY. The shared THREESIXTY_API_KEY fallback
    // is removed — a tenant with no key of its own must fail, never send from
    // (and bill) another tenant's WhatsApp account.
    const apiKey =
      cfg.api_key ||
      (cfg.api_key_secret
        ? Deno.env.get(
            cfg.api_key_secret
          )
        : null);

    if (!apiKey) {
      return json(
        {
          error:
            "WhatsApp API key not configured for this organisation",
        },
        400
      );
    }

    // 4. Org settings: branding + cert prefix
    const {
      data: orgSettings,
    } =
      await supabase
        .from("settings")
        .select(
          "business_name, business_phone, cert_prefix"
        )
        .eq(
          "organisation_id",
          job.organisation_id
        )
        .maybeSingle();

    // Tenant-specific Stripe payment link.
    // Never fall back to another tenant's payment account.
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
          job.organisation_id
        )
        .eq(
          "integration_type",
          "stripe"
        )
        .maybeSingle();

    const stripeCfg =
      (stripeIntegration?.config ??
        {}) as Record<
        string,
        any
      >;

    const paymentLink =
      typeof stripeCfg.payment_link ===
      "string"
        ? stripeCfg.payment_link.trim()
        : "";

    // Tenant-scoped branding only.
    const businessName =
      orgSettings?.business_name?.trim() ||
      "";

    if (!businessName) {
      await supabase
        .from(
          "edge_function_logs"
        )
        .insert({
          function_name:
            "send-invoice-whatsapp",
          error_message:
            "Skipped: settings.business_name not configured for organisation",
          payload: {
            organisation_id:
              job.organisation_id,
            service_call_id,
          },
        });

      return json({
        success: true,
        skipped: true,
        reason:
          "business_name_not_configured",
      });
    }

    if (!paymentLink) {
      await supabase
        .from(
          "edge_function_logs"
        )
        .insert({
          function_name:
            "send-invoice-whatsapp",
          error_message:
            "Skipped: no Stripe payment link configured for organisation",
          payload: {
            organisation_id:
              job.organisation_id,
            service_call_id,
          },
        });

      return json({
        success: true,
        skipped: true,
        reason:
          "payment_link_not_configured",
      });
    }

    // Phone is optional for the business contact line.
    const businessPhone =
      orgSettings?.business_phone?.trim() ||
      "";

    const certPrefix =
      orgSettings?.cert_prefix ||
      "JOB";

    // 5. Normalise phone: strip +, leading 0 -> 353
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

    // Format job ref (<prefix>-XXXXXX)
    const jobRef =
      job.job_reference ||
      `${certPrefix}-${(
        job.id || ""
      )
        .replace(/-/g, "")
        .substring(0, 6)
        .toUpperCase()}`;

    const invoiceNumber =
      job.invoice_number || "—";

    let invoiceDate = "—";

    if (job.invoiced_at) {
      const d = new Date(
        job.invoiced_at
      );

      const dd = String(
        d.getDate()
      ).padStart(2, "0");

      const mm = String(
        d.getMonth() + 1
      ).padStart(2, "0");

      const yyyy =
        d.getFullYear();

      invoiceDate = `${dd}/${mm}/${yyyy}`;
    }

    const balanceDue =
      `€${Number(
        job.balance_due || 0
      ).toFixed(2)}`;

    // 6. Build message
    const message =
      `Hi ${customer.name}, please find your invoice from ${businessName}.\n\n` +
      `Job Ref: ${jobRef}\n` +
      `Invoice #: ${invoiceNumber}\n` +
      `Invoice Date: ${invoiceDate}\n` +
      `Balance Due: ${balanceDue}\n\n` +
      `Pay securely here: ${paymentLink}\n\n` +
      `If you have any questions please reply to this message.\n\n` +
      `${businessName}${
        businessPhone
          ? `\n☎️ ${businessPhone}`
          : ""
      }`;

    // Delivery tracking (office badge + failure alert + resend history).
    const deliveryHandle =
      await beginDelivery(
        supabase,
        {
          organisationId:
            job.organisation_id,
          customerId:
            job.customer_id,
          commType: "invoice",
          channel: "whatsapp",
          relatedType:
            "service_call",
          relatedId:
            service_call_id,
          relatedReference:
            job.invoice_number ||
            job.job_reference ||
            null,
          recipient: phone,
        }
      );

    // 7. POST to 360 Messenger
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

    const respText =
      await resp.text();

    const ok = resp.ok;

    await completeDelivery(
      supabase,
      {
        handle: deliveryHandle,
        channel: "whatsapp",
        ok,
        providerError: ok
          ? null
          : `[${resp.status}] ${respText}`,
        recipient: phone,
      }
    );

    // 8. Call log-message edge function
    // log-message authenticates on x-make-secret, not the service key.
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
              service_call_id,
              organisation_id:
                job.organisation_id,
              customer_id:
                job.customer_id,
              message_type:
                "invoice_sent",
              channel:
                "whatsapp",
              direction:
                "outbound",
              recipient_phone:
                phone,
              message_body:
                message,
              status: ok
                ? "sent"
                : "failed",
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

    if (!ok) {
      return json(
        {
          error:
            "Failed to send WhatsApp message",
          detail: respText,
        },
        502
      );
    }

    // 9. Update service_calls.invoice_sent_at
    await supabase
      .from("service_calls")
      .update({
        invoice_sent_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        service_call_id
      );

    // 10. Success
    return json({
      success: true,
    });
  } catch (e) {
    console.error(
      "send-invoice-whatsapp error",
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