import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { service_call_id } = await req.json();

    if (!service_call_id || typeof service_call_id !== "string") {
      return new Response(
        JSON.stringify({ error: "service_call_id is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch current count
    const { data: job, error: fetchError } = await supabase
      .from("service_calls")
      .select("invoice_reminder_count")
      .eq("id", service_call_id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!job) {
      return new Response(
        JSON.stringify({ error: "Service call not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentCount = job.invoice_reminder_count || 0;

    if (currentCount >= 2) {
      return new Response(
        JSON.stringify({ error: "Maximum reminders (2) already sent" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      invoice_reminder_count: currentCount + 1,
    };

    if (currentCount === 0) {
      updatePayload.invoice_reminder_sent_at = now;
    } else if (currentCount === 1) {
      updatePayload.invoice_reminder_2_sent_at = now;
    }

    const { error: updateError } = await supabase
      .from("service_calls")
      .update(updatePayload)
      .eq("id", service_call_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        success: true,
        service_call_id,
        new_count: currentCount + 1,
        updated_field: currentCount === 0 ? "invoice_reminder_sent_at" : "invoice_reminder_2_sent_at",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await supabase.from("edge_function_logs").insert({
      function_name: "mark-invoice-reminder-sent",
      error_message: message,
    });
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
