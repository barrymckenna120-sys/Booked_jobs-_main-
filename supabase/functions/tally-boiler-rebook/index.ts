import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { phone, preferred_date, preferred_time, organisation_id } = await req.json();

    if (!phone || !organisation_id) {
      return new Response(JSON.stringify({ error: "phone and organisation_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up customer by phone + organisation_id
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, name, phone, user_id")
      .eq("phone", phone)
      .eq("organisation_id", organisation_id)
      .limit(1)
      .maybeSingle();

    if (custErr) {
      console.error("Customer lookup error:", custErr);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!customer) {
      // Get a recipient for the notification (org owner from settings)
      const { data: settings } = await supabase
        .from("settings")
        .select("user_id")
        .eq("organisation_id", organisation_id)
        .limit(1)
        .maybeSingle();

      const recipientId = settings?.user_id;

      if (recipientId) {
        await supabase.from("notifications").insert({
          recipient_user_id: recipientId,
          notification_type: "unmatched_rebook",
          title: "Unmatched Rebook",
          body: "Tally rebook: phone number not matched — " + phone,
          organisation_id,
          role: "office",
        });
      }

      return new Response(JSON.stringify({ success: false, reason: "not_found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create service call
    const { data: job, error: jobErr } = await supabase
      .from("service_calls")
      .insert({
        customer_id: customer.id,
        user_id: customer.user_id,
        organisation_id,
        job_type: "Boiler Service",
        status: "Pending Payment",
        scheduled_date: preferred_date || null,
        time_block: preferred_time || null,
        source: "Tally Rebooking",
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      console.error("Job creation error:", jobErr);
      return new Response(JSON.stringify({ error: "Failed to create job" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update customer next_service_due
    if (preferred_date) {
      await supabase
        .from("customers")
        .update({ next_service_due: preferred_date })
        .eq("id", customer.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        customer_id: customer.id,
        customer_name: customer.name,
        phone: customer.phone,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("tally-boiler-rebook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
