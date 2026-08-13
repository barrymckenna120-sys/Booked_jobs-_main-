import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const parts = sigHeader.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const signature = parts.find((p) => p.startsWith("v1="))?.slice(3);

  if (!timestamp || !signature) return false;

  // Reject if timestamp is older than 5 minutes
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (age > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return expected === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.text();
  const sigHeader = req.headers.get("stripe-signature");

  if (!sigHeader) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const valid = await verifyStripeSignature(body, sigHeader, webhookSecret);
  if (!valid) {
    console.error("Invalid Stripe signature");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const event = JSON.parse(body);

    if (event.type !== "checkout.session.completed") {
      // Acknowledge but ignore other event types
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = event.data?.object;
    const metadata = session?.metadata || {};
    const jobId = metadata.job_id || metadata.service_call_id;
    const customerId = metadata.customer_id;
    const amountPaid = session?.amount_total ? session.amount_total / 100 : null;

    if (!jobId) {
      console.error("No job_id in session metadata", metadata);
      return new Response(JSON.stringify({ error: "Missing job_id in metadata" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch current revenue to recalculate balance_due
    const { data: existingRow } = await supabase
      .from("service_calls")
      .select("revenue")
      .eq("id", jobId)
      .single();

    const currentRevenue = Number(existingRow?.revenue ?? 0);
    const depositAmount = amountPaid !== null ? amountPaid : 0;
    const newBalanceDue = currentRevenue > 0 ? currentRevenue - depositAmount : null;
    const isFullyPaid = newBalanceDue !== null && newBalanceDue <= 0;

    const updateData: Record<string, unknown> = {
      status: "Booked",
      payment_status: isFullyPaid ? "paid" : "deposit_paid",
      paid_at: new Date().toISOString(),
      deposit_paid: true,
    };

    if (amountPaid !== null) {
      updateData.deposit_amount = amountPaid;
      if (currentRevenue > 0) {
        updateData.balance_due = Math.max(0, newBalanceDue ?? 0);
      }
    }

    const { error: updateErr } = await supabase
      .from("service_calls")
      .update(updateData)
      .eq("id", jobId);

    if (updateErr) {
      console.error("Failed to update service_call:", updateErr);
      return new Response(JSON.stringify({ error: "Database update failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Payment confirmed for job ${jobId}, customer ${customerId}, amount €${amountPaid}`);

    // Log payment_received activity
    try {
      const { data: scRow } = await supabase
        .from("service_calls")
        .select("organisation_id, customer_id")
        .eq("id", jobId)
        .single();
      if (scRow) {
        const amountStr = amountPaid !== null ? String(amountPaid) : "0";
        await supabase.from("customer_activity").insert({
          organisation_id: scRow.organisation_id,
          customer_id: scRow.customer_id,
          service_call_id: jobId,
          event_type: "payment_received",
          event_label: `Payment received — €${amountStr} — Card`,
          created_by: null,
        });
      }
    } catch (e) {
      console.error("Failed to log payment activity:", e);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("stripe-boiler-payment-confirm error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
