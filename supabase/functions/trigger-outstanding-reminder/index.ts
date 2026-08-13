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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let service_call_id: string | undefined;
  let customer_name: string | null = null;

  const logFailure = async (error_message: string) => {
    try {
      await supabase.from("edge_function_logs").insert({
        function_name: "trigger-outstanding-reminder",
        payload: { service_call_id, customer_name },
        error_message,
      });
    } catch (_e) { /* best-effort */ }
  };

  try {
    const body = await req.json().catch(() => ({}));
    service_call_id = body?.service_call_id;

    if (!service_call_id || typeof service_call_id !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "service_call_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Lookup service_call + customer
    const { data: job, error: fetchErr } = await supabase
      .from("service_calls")
      .select("id, invoice_reminder_count, invoiced_at, organisation_id, customer_id, customers(name, phone)")
      .eq("id", service_call_id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!job) {
      await logFailure("Service call not found");
      return new Response(
        JSON.stringify({ success: false, error: "Service call not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customer = (job as any).customers || {};
    customer_name = customer.name || null;
    const customer_phone: string | null = customer.phone || null;
    const invoice_reminder_count: number = job.invoice_reminder_count || 0;

    if (invoice_reminder_count >= 2) {
      return new Response(
        JSON.stringify({ success: false, reason: "max_reminders_reached" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgId = (job as any).organisation_id;

    // Load make config for this org
    const { data: makeIntegration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", orgId)
      .eq("integration_type", "make")
      .maybeSingle();

    const webhookSecretName =
      (makeIntegration as any)?.config?.outstanding_reminder_webhook_secret
      ?? "OUTSTANDING_REMINDER_WEBHOOK_URL";
    const webhookUrl = Deno.env.get(webhookSecretName);

    if (!webhookUrl) {
      const msg = `No Make webhook URL found for org ${orgId} (secret: ${webhookSecretName})`;
      await logFailure(msg);
      return new Response(
        JSON.stringify({ success: false, reason: "webhook_url_not_configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load 360messenger config for this org
    const { data: messengerIntegration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", orgId)
      .eq("integration_type", "360messenger")
      .maybeSingle();

    const companyName = (messengerIntegration as any)?.config?.company_name ?? "K & N Gas Services";
    const companyPhone = (messengerIntegration as any)?.config?.company_phone ?? "087 3686252";

    const makeSecret = Deno.env.get("MAKE_WEBHOOK_SECRET") || "";

    const webhookPayload = {
      service_call_id,
      customer_name,
      customer_phone,
      invoice_reminder_count,
      invoiced_at: job.invoiced_at,
      company_name: companyName,
      company_phone: companyPhone,
    };

    const makeRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-make-secret": makeSecret,
      },
      body: JSON.stringify(webhookPayload),
    });

    const makeText = await makeRes.text();

    if (!makeRes.ok) {
      const msg = `Make webhook failed HTTP ${makeRes.status}: ${makeText.substring(0, 300)}`;
      await logFailure(msg);
      return new Response(
        JSON.stringify({ success: false, error: msg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Increment count via existing function
    const markRes = await fetch(`${supabaseUrl}/functions/v1/mark-invoice-reminder-sent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: JSON.stringify({ service_call_id }),
    });

    const markJson = await markRes.json().catch(() => ({}));
    if (!markRes.ok || !markJson?.success) {
      const msg = `mark-invoice-reminder-sent failed: ${JSON.stringify(markJson)}`;
      await logFailure(msg);
      return new Response(
        JSON.stringify({ success: false, error: msg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Success log
    await supabase.from("edge_function_logs").insert({
      function_name: "trigger-outstanding-reminder",
      payload: { service_call_id, customer_name },
      error_message: null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        new_count: markJson.new_count,
        customer_name,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logFailure(msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
