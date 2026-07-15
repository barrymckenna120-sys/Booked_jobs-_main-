import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-webhook-secret",
};

// Normalise IE mobile numbers to E.164 (+353XXXXXXXXX). Mirrors the logic
// used in tally-incoming-job so we no longer depend on Make's slicing step.
const normalisePhone = (raw: unknown): string => {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.replace(/[\s\-()]/g, "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("353")) return "+" + trimmed;
  return "+353" + trimmed.replace(/^0/, "");
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

  // Shared-secret auth: require x-webhook-secret matching MAKE_WEBHOOK_SECRET.
  const providedSecret = req.headers.get("x-webhook-secret");
  const expectedSecret = Deno.env.get("MAKE_WEBHOOK_SECRET");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { phone, preferred_date, preferred_time, organisation_id, source } = await req.json();

    if (!phone || !organisation_id) {
      return new Response(JSON.stringify({ error: "phone and organisation_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalisedPhone = normalisePhone(phone);
    if (!normalisedPhone) {
      return new Response(JSON.stringify({ error: "Invalid phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Look up customer by phone + organisation_id
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, name, phone, user_id")
      .eq("phone", normalisedPhone)
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
          body: "Tally rebook: phone number not matched — " + normalisedPhone,
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
        source: source === "renewal_tally" ? "Renewal Tally Rebooking" : "Tally Rebooking",
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

    // Update customer next_service_due and advance renewal_stage
    const customerUpdate: Record<string, string> = { renewal_stage: source === "renewal_tally" ? "Booked In" : "booked_in" };
    if (preferred_date) {
      customerUpdate.next_service_due = preferred_date;
    }
    await supabase
      .from("customers")
      .update(customerUpdate)
      .eq("id", customer.id);

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
