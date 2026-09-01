import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { bookingConfirmationSkip } from "../_shared/bookingConfirmationSkip.ts";
import { isDenied, requireResourceOrgAccess } from "../_shared/orgAuth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  beginDelivery,
  completeDelivery,
  DeliveryBusyError,
  markOptedOut,
} from "../_shared/deliveryStatus.ts";



serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  /** Deliberate non-send: HTTP 200, success true, sent false, explicit reason. */
  const skip = (reason: string, message: string) =>
    json({ success: true, sent: false, skipped: true, reason, message });

  /** Send attempt that did not deliver. */
  const fail = (reason: string, message: string, status = 500) =>
    json({ success: false, sent: false, reason, message, error: message }, status);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }


  try {
    const reqBody = await req.json();
    const service_call_id = reqBody?.service_call_id;
    /** resend-communication tracks the attempt itself; avoid double-recording. */
    const skipTracking = reqBody?.skip_delivery_tracking === true;


    // IDOR guard: prove the caller belongs to the organisation owning this row.
    const access = await requireResourceOrgAccess(req, {
      fnName: "send-booking-confirmation",
      cors: corsHeaders,
      resource: { table: "service_calls", id: service_call_id },
    });
    if (isDenied(access)) return access.error;

    if (!service_call_id) {
      return fail("missing_service_call_id", "Missing service_call_id", 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const dbHeaders = {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey!,
      "Content-Type": "application/json",
    };

    // Delivery tracking client (office badge + admin log + failure alerts).
    const trackingClient = createClient(supabaseUrl!, supabaseKey!);

    // Fetch the service call with customer details
    const scRes = await fetch(
      `${supabaseUrl}/rest/v1/service_calls?id=eq.${service_call_id}&select=id,job_reference,customer_id,scheduled_date,time_block,job_type,assigned_engineer,organisation_id`,

      { headers: dbHeaders },
    );
    const scRows = await scRes.json();
    const job = Array.isArray(scRows) ? scRows[0] : null;
    if (!job) {
      return fail("job_not_found", "Service call not found", 404);
    }

    const orgId = job.organisation_id;
    if (!orgId) {
      return fail("job_missing_organisation", "Service call missing organisation_id", 400);
    }

    // Fetch tenant WhatsApp integration config
    const tiRes = await fetch(
      `${supabaseUrl}/rest/v1/tenant_integrations?organisation_id=eq.${orgId}&integration_type=eq.360messenger&select=config&limit=1`,
      { headers: dbHeaders },
    );
    const tiRows = await tiRes.json();
    const config = Array.isArray(tiRows) && tiRows[0]?.config ? tiRows[0].config : null;
    if (!config) {
      return skip("no_integration", "WhatsApp is not connected for this business");
    }

    const apiKey = config.api_key || (config.api_key_secret ? Deno.env.get(config.api_key_secret) : null);
    const templateName = config?.templates?.booking_confirmation ?? "booking_confirmation";
    if (!apiKey) {
      return skip("no_api_key", "WhatsApp credentials are missing for this business");
    }

    // Fetch customer details (incl. opt-out flag)
    const custRes = await fetch(
      `${supabaseUrl}/rest/v1/customers?id=eq.${job.customer_id}&select=name,phone,opted_out`,
      { headers: dbHeaders },
    );
    const custRows = await custRes.json();
    const customer = Array.isArray(custRows) ? custRows[0] : null;

    // Shared opt-out / phone guard — same pattern as the other customer-facing sends.
    const decision = bookingConfirmationSkip(customer);
    if (decision.skip) {
      const reason = decision.reason!;
      const message = decision.message!;
      console.warn("send-booking-confirmation skipped", { service_call_id, customer_id: job.customer_id, reason });
      // Record the skip so the office can see why nothing went out.
      try {
        await fetch(`${supabaseUrl}/rest/v1/message_log`, {
          method: "POST",
          headers: dbHeaders,
          body: JSON.stringify({
            customer_id: job.customer_id,
            organisation_id: orgId,
            message_type: "booking_confirmation",
            channel: "whatsapp",
            direction: "outbound",
            content: `Skipped: ${message}`,
            status: "skipped",
            related_id: service_call_id,
            related_type: "service_call",
            sent_by: "system",
            sent_at: new Date().toISOString(),
          }),
        });
      } catch { /* non-critical */ }

      // Intentional suppression is a distinct state, never a failure.
      if (!skipTracking && (reason === "opted_out" || reason === "customer_opted_out")) {
        await markOptedOut(trackingClient, {
          organisationId: orgId,
          customerId: job.customer_id,
          commType: "booking_confirmation",
          channel: "whatsapp",
          relatedType: "service_call",
          relatedId: service_call_id,
          relatedReference: job.job_reference ?? null,
        });
      }
      return skip(reason, message);
    }



    // Fetch settings (message_footer / business_name) by organisation_id
    let messageFooter = "";
    let companyName = "";
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/settings?organisation_id=eq.${orgId}&select=message_footer,business_name&limit=1`,
      { headers: dbHeaders },
    );
    const settings = await settingsRes.json();
    if (Array.isArray(settings) && settings[0]) {
      if (settings[0].message_footer) messageFooter = settings[0].message_footer;
      if (settings[0].business_name) companyName = settings[0].business_name;
    }

    const SALUTATIONS = ["mr", "mrs", "ms", "dr", "miss"];
    const getFirstName = (fullName: string): string => {
      if (!fullName) return "";
      const parts = fullName.trim().split(/\s+/);
      if (parts.length > 1 && SALUTATIONS.includes(parts[0].toLowerCase().replace(/\.$/, ""))) {
        return parts[1];
      }
      return parts[0];
    };
    const firstName = getFirstName(customer.name) || "there";
    const formattedDate = job.scheduled_date
      ? (() => {
          const d = new Date(job.scheduled_date + "T12:00:00");
          const dd = String(d.getDate()).padStart(2, "0");
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const yyyy = d.getFullYear();
          return `${dd}/${mm}/${yyyy}`;
        })()
      : "TBC";
    const timeSlot = job.time_block || "TBC";
    const engineerName = job.assigned_engineer || "TBC";

    // Build message body (360Messenger /v2/sendMessage only supports free text)
    const message =
      `Hi ${firstName}, your booking with ${companyName || "us"} is confirmed.\n\n` +
      `📅 Date: ${formattedDate}\n` +
      `⏰ Time: ${timeSlot}\n` +
      `👷 Engineer: ${engineerName}\n\n` +
      `If you need to make any changes please reply to this message.` +
      (messageFooter ? `\n\n${messageFooter}` : "");

    // Send via 360Messenger free-text endpoint (template name retained for reference: ${templateName})
    const cleanNumber = customer.phone.replace(/^\+/, "");

    // Log pending message — recipient_phone recorded so the office can always
    // see the number actually used, even if the customer record changes later.
    const logRes = await fetch(`${supabaseUrl}/rest/v1/message_log`, {
      method: "POST",
      headers: { ...dbHeaders, Prefer: "return=representation" },
      body: JSON.stringify({
        customer_id: job.customer_id,
        organisation_id: orgId,
        message_type: "booking_confirmation",
        channel: "whatsapp",
        direction: "outbound",
        content: message,
        status: "pending",
        recipient_phone: customer.phone,
        related_id: service_call_id,
        related_type: "service_call",
        sent_by: "system",
        sent_at: new Date().toISOString(),
      }),
    });
    const logRows = await logRes.json();
    const logId = Array.isArray(logRows) ? logRows[0]?.id : null;

    // Open the delivery record before the provider call.
    let deliveryHandle = null;
    if (!skipTracking) {
      try {
        deliveryHandle = await beginDelivery(trackingClient, {
          organisationId: orgId,
          customerId: job.customer_id,
          commType: "booking_confirmation",
          channel: "whatsapp",
          relatedType: "service_call",
          relatedId: service_call_id,
          relatedReference: job.job_reference ?? null,
          recipient: customer.phone,
        });
      } catch (e) {
        if (e instanceof DeliveryBusyError) {
          return fail("send_in_progress", "A confirmation for this job is already being sent", 409);
        }
        throw e;
      }
    }

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

    // 360Messenger returns 201 + success:true when it ACCEPTS the request. That
    // is queue acceptance, not delivery — recorded as `accepted` and only a real
    // provider callback may promote it to `delivered`.
    const providerMessageId: string | null = result?.data?.id ?? null;
    const accepted = !!result?.success;

    // Log full API response to edge_function_logs for debugging
    await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify({
        function_name: "send-booking-confirmation",
        error_message: `360Messenger HTTP ${response.status}: ${accepted ? "accepted" : "failed"}`,
        payload: { api_response: result, sent_to: customer.phone, service_call_id, template_name: templateName, http_status: response.status, provider_message_id: providerMessageId },
      }),
    });

    if (!skipTracking) {
      await completeDelivery(trackingClient, {
        handle: deliveryHandle,
        channel: "whatsapp",
        ok: accepted,
        providerError: accepted
          ? null
          : `[${response.status}] ${resultText.substring(0, 500)}`,
        providerMessageId,
        providerStatus: accepted ? "accepted" : null,
        recipient: customer.phone,
      });
    }

    // Update message_log status. `accepted` — provider took the request; it is
    // not a delivery confirmation.
    if (logId) {
      const updateBody = accepted
        ? { status: "accepted" }
        : { status: "failed", error_message: `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}` };

      await fetch(`${supabaseUrl}/rest/v1/message_log?id=eq.${logId}`, {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify(updateBody),
      });
    }

    if (!accepted) {
      const errorDetail = `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}`;

      await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
        method: "POST",
        headers: dbHeaders,
        body: JSON.stringify({
          function_name: "send-booking-confirmation",
          error_message: `360Messenger API returned success:false. HTTP ${response.status}`,
          payload: { api_response: result, sent_to: customer.phone, service_call_id },
        }),
      });

      return fail("whatsapp_send_failed", errorDetail, 500);
    }

    // Log customer activity on acceptance
    try {
      await fetch(`${supabaseUrl}/rest/v1/customer_activity`, {
        method: "POST",
        headers: dbHeaders,
        body: JSON.stringify({
          organisation_id: orgId,
          customer_id: job.customer_id,
          service_call_id: service_call_id,
          event_type: "whatsapp_sent",
          event_label: "WhatsApp sent — Booking Confirmation",
        }),
      });
    } catch {
      /* non-critical */
    }

    return json({
      success: true,
      sent: true,
      status: "accepted",
      provider_message_id: providerMessageId,
      recipient: customer.phone,
    });

  } catch (error) {
    return fail("unexpected_error", error?.message ?? "Unexpected error", 500);
  }
});
