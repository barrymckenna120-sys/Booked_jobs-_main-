import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { service_call_id, customer_id } = await req.json();

    if (!service_call_id || !customer_id) {
      return new Response(
        JSON.stringify({ error: "service_call_id and customer_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Check if customer has opted out
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("name, phone, opted_out")
      .eq("id", customer_id)
      .maybeSingle();

    if (custErr || !customer) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "customer_not_found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (customer.opted_out) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "customer_opted_out" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if review already sent
    const { data: job, error: jobErr } = await supabase
      .from("service_calls")
      .select("id, review_sent, payment_method, organisation_id")
      .eq("id", service_call_id)
      .maybeSingle();

    if (jobErr || !job) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "job_not_found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (job.review_sent) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "review_already_sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgId = (job as any).organisation_id;
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: "organisation_id missing on service_call" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get Google review URL from settings (scoped per org)
    const { data: settings } = await supabase
      .from("settings")
      .select("google_review_url")
      .eq("organisation_id", orgId)
      .limit(1)
      .maybeSingle();

    // No cross-tenant fallback: if this org has no review URL configured, skip.
    const reviewLink = settings?.google_review_url?.trim() || null;

    if (!reviewLink) {
      await supabase.from("edge_function_logs").insert({
        function_name: "trigger-review-request",
        error_message: `No google_review_url configured for org ${orgId} — review request skipped`,
        payload: { service_call_id, customer_id, organisation_id: orgId },
      });
      return new Response(
        JSON.stringify({ skipped: true, reason: "google_review_url_not_configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. POST to Make.com webhook — per-org lookup
    const { data: makeIntegration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", orgId)
      .eq("integration_type", "make")
      .maybeSingle();

    const webhookSecretName = (makeIntegration as any)?.config?.review_webhook_secret ?? "MAKE_REVIEW_WEBHOOK_URL";
    const webhookUrl = Deno.env.get(webhookSecretName);

    if (!webhookUrl) {
      // Log the error but don't fail the completion flow
      await supabase.from("edge_function_logs").insert({
        function_name: "trigger-review-request",
        error_message: `No Make webhook URL found for org ${orgId} (secret: ${webhookSecretName})`,
        payload: { service_call_id, customer_id, organisation_id: orgId },
      });
      return new Response(
        JSON.stringify({ skipped: true, reason: "webhook_url_not_configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const webhookPayload = {
      customer_name: customer.name,
      customer_phone: customer.phone,
      service_call_id: service_call_id,
      review_link: reviewLink,
    };

    const webhookRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPayload),
    });

    if (!webhookRes.ok) {
      const errBody = await webhookRes.text();

      await supabase.from("edge_function_logs").insert({
        function_name: "trigger-review-request",
        error_message: `Webhook failed: ${webhookRes.status} - ${errBody}`,
        payload: webhookPayload,
      });
      return new Response(
        JSON.stringify({ error: "webhook_failed", status: webhookRes.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Log customer activity
    const { data: custFull } = await supabase
      .from("customers")
      .select("organisation_id")
      .eq("id", customer_id)
      .maybeSingle();

    if (custFull?.organisation_id) {
      await supabase.from("customer_activity").insert({
        organisation_id: custFull.organisation_id,
        customer_id,
        event_type: "whatsapp_sent",
        event_label: "WhatsApp sent — Review Request",
        created_by: null,
      });
    }

    // 6. Mark review as sent
    await supabase
      .from("service_calls")
      .update({
        review_sent: true,
        review_sent_at: new Date().toISOString(),
      })
      .eq("id", service_call_id);

    return new Response(
      JSON.stringify({ success: true, customer_name: customer.name }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
