// Office-triggered resend of a customer communication that failed to deliver.
//
// Security model:
//  - signed-in user only; the organisation is derived from the delivery row and
//    proven against the caller's own profile (never from the request body).
//  - the only client input is the delivery id — recipient, payload and channel
//    are rebuilt server-side from the database, so nobody can retarget a send.
//  - opt-out is re-checked at resend time and recorded as `opted_out`, not sent.
//  - an in-flight attempt is rejected (409) so double-tapping can't double-send.
//  - the resend attempt is appended to the delivery history with the actor id.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isDenied, requireResourceOrgAccess } from "../_shared/orgAuth.ts";
import { evaluateOptOut } from "../_shared/optOut.ts";
import {
  abandonDelivery,
  beginDelivery,
  completeDelivery,
  DeliveryBusyError,
  markOptedOut,
} from "../_shared/deliveryStatus.ts";

/** Automated, non-transactional types where opt-out must suppress the send. */
const OPT_OUT_GATED = new Set(["service_reminder", "quote_followup", "renewal"]);

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const deliveryId = typeof body?.delivery_id === "string" ? body.delivery_id : "";
    if (!deliveryId) return json({ error: "delivery_id is required" }, 400);

    // Tenant gate on the delivery row itself.
    const access = await requireResourceOrgAccess(req, {
      fnName: "resend-communication",
      cors: corsHeaders,
      allowMachine: false,
      resource: { table: "communication_deliveries", id: deliveryId },
    });
    if (isDenied(access)) return access.error;

    const { data: delivery } = await supabase
      .from("communication_deliveries")
      .select(
        "id, organisation_id, customer_id, comm_type, channel, related_type, related_id, related_reference, delivery_status, in_flight, in_flight_at",
      )
      .eq("id", deliveryId)
      .maybeSingle();

    if (!delivery) return json({ error: "Delivery not found" }, 404);
    if (delivery.organisation_id !== access.orgId) {
      return json({ error: "Forbidden" }, 403);
    }
    if (delivery.delivery_status === "opted_out") {
      return json({ success: false, status: "opted_out", reason: "Customer has opted out" });
    }

    // Re-check consent at resend time.
    if (delivery.customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("opted_out, phone, email, name")
        .eq("id", delivery.customer_id)
        .maybeSingle();

      const decision = evaluateOptOut(customer);
      if (customer?.opted_out === true && OPT_OUT_GATED.has(delivery.comm_type)) {
        await markOptedOut(supabase, {
          organisationId: delivery.organisation_id,
          customerId: delivery.customer_id,
          commType: delivery.comm_type,
          channel: delivery.channel,
          relatedType: delivery.related_type,
          relatedId: delivery.related_id,
          relatedReference: delivery.related_reference,
          triggerSource: "resend",
        });
        return json({ success: false, status: "opted_out", reason: "Customer has opted out" });
      }
      if (decision.skip && decision.reason === "no_phone_number" && delivery.channel === "whatsapp") {
        return json({
          success: false,
          status: "failed",
          reason: "No contact details on the customer record",
        }, 200);
      }
    }

    const target = await resolveTarget(supabase, delivery);
    if (!target) {
      return json({ error: "This communication type cannot be resent automatically" }, 400);
    }

    let handle;
    try {
      handle = await beginDelivery(supabase, {
        organisationId: delivery.organisation_id,
        customerId: delivery.customer_id,
        commType: delivery.comm_type,
        channel: delivery.channel,
        relatedType: delivery.related_type,
        relatedId: delivery.related_id,
        relatedReference: delivery.related_reference,
        triggerSource: "resend",
        triggeredBy: access.userId ?? null,
      });
    } catch (e) {
      if (e instanceof DeliveryBusyError) {
        return json({ error: "A resend is already in progress" }, 409);
      }
      throw e;
    }

    // Forward the caller's credentials so the downstream send function applies
    // its own tenant checks exactly as it does for a normal office send.
    let ok = false;
    let providerError: string | null = null;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/${target.fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.get("Authorization") ?? "",
          apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          ...(req.headers.get("x-org-impersonation-token")
            ? { "x-org-impersonation-token": req.headers.get("x-org-impersonation-token")! }
            : {}),
        },
        body: JSON.stringify(target.payload),
      });
      const text = await res.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch (_e) {
        parsed = null;
      }
      ok = res.ok && parsed?.success !== false && !parsed?.error;
      if (!ok) providerError = `[${res.status}] ${text}`.slice(0, 2000);
    } catch (e) {
      providerError = e instanceof Error ? e.message : String(e);
    }

    if (!handle) {
      // Tracking row unavailable — still report the real outcome.
      return json({ success: ok, status: ok ? "sent" : "failed" });
    }

    if (!ok && providerError === null) await abandonDelivery(supabase, handle);

    const result = await completeDelivery(supabase, {
      handle,
      channel: delivery.channel,
      ok,
      providerError,
    });

    return json({ success: ok, status: result.status, reason: result.reason });
  } catch (e) {
    console.error("resend-communication error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

/** Rebuild the downstream send payload from the database only. */
async function resolveTarget(
  supabase: any,
  delivery: { comm_type: string; related_id: string | null; customer_id: string | null },
): Promise<{ fn: string; payload: Record<string, unknown> } | null> {
  const id = delivery.related_id;

  if (delivery.comm_type === "quote" && id) {
    const { data: quote } = await supabase
      .from("quotes")
      .select(
        "id, description, total_amount, parts_cost, labour_cost, deposit_amount, pdf_url, quote_number, customer_id",
      )
      .eq("id", id)
      .maybeSingle();
    if (!quote) return null;
    return {
      fn: "send-quote-whatsapp",
      payload: {
        quote_id: quote.id,
        job_description: quote.description,
        quote_amount: quote.total_amount,
        parts_cost: quote.parts_cost,
        labour_cost: quote.labour_cost,
        deposit_amount: quote.deposit_amount,
        pdf_url: quote.pdf_url,
        quote_number: quote.quote_number,
        customer_id: quote.customer_id,
      },
    };
  }

  if (delivery.comm_type === "invoice" && id) {
    return { fn: "send-invoice-whatsapp", payload: { service_call_id: id } };
  }

  if (delivery.comm_type === "receipt" && id) {
    return { fn: "send-whatsapp-receipt", payload: { job_id: id } };
  }

  if (delivery.comm_type === "service_reminder" && delivery.customer_id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, next_service_due")
      .eq("id", delivery.customer_id)
      .maybeSingle();
    if (!customer) return null;
    return {
      fn: "send-renewal-reminder",
      payload: {
        customer_id: customer.id,
        first_name: String(customer.name ?? "").split(" ")[0] || "there",
        renewal_date: customer.next_service_due,
        force: true,
      },
    };
  }

  return null;
}
