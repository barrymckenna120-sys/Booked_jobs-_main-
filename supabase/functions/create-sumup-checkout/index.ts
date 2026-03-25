import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUMUP_API_KEY = Deno.env.get("SUMUP_API_KEY");
    const SUMUP_MERCHANT_CODE = Deno.env.get("SUMUP_MERCHANT_CODE");
    if (!SUMUP_API_KEY) {
      throw new Error("SUMUP_API_KEY is not configured");
    }
    if (!SUMUP_MERCHANT_CODE) {
      throw new Error("SUMUP_MERCHANT_CODE is not configured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { service_call_id } = await req.json();
    if (!service_call_id) {
      return new Response(
        JSON.stringify({ error: "service_call_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch service call
    const { data: job, error: jobErr } = await supabase
      .from("service_calls")
      .select("id, revenue, customer_id")
      .eq("id", service_call_id)
      .single();

    if (jobErr || !job) {
      return new Response(
        JSON.stringify({ error: "Service call not found", detail: jobErr?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!job.revenue || job.revenue <= 0) {
      return new Response(
        JSON.stringify({ error: "No revenue amount set on this job" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch customer
    const { data: customer } = await supabase
      .from("customers")
      .select("name, phone")
      .eq("id", job.customer_id)
      .single();

    // Call SumUp Checkouts API
    const checkoutBody: Record<string, unknown> = {
      checkout_reference: service_call_id,
      amount: job.revenue,
      currency: "EUR",
      merchant_code: SUMUP_MERCHANT_CODE,
      description: "K&N Gas Services Payment",
    };

    console.log("Checkout body:", JSON.stringify(checkoutBody));

    const sumupRes = await fetch("https://api.sumup.com/v0.1/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUMUP_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(checkoutBody),
    });

    const sumupData = await sumupRes.json();

    if (!sumupRes.ok) {
      console.error("SumUp API error:", sumupData);
      await supabase.from("edge_function_logs").insert({
        function_name: "create-sumup-checkout",
        error_message: `SumUp API ${sumupRes.status}: ${JSON.stringify(sumupData)}`,
        payload: { service_call_id, checkout_body: checkoutBody },
      });
      return new Response(
        JSON.stringify({ error: "SumUp checkout creation failed", detail: sumupData }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { id: sumup_checkout_id, hosted_checkout_url } = sumupData;

    // Update service_calls with checkout details
    const { error: updateErr } = await supabase
      .from("service_calls")
      .update({
        sumup_checkout_id,
        payment_link: hosted_checkout_url,
        payment_status: "pending",
      })
      .eq("id", service_call_id);

    if (updateErr) {
      console.error("Failed to update service_call:", updateErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment_link: hosted_checkout_url,
        checkout_id: sumup_checkout_id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-sumup-checkout error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
