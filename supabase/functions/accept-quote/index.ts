import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { customer_mobile_number } = await req.json();

    if (!customer_mobile_number || typeof customer_mobile_number !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing or invalid customer_mobile_number" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Strip non-digits for matching
    const digits = customer_mobile_number.replace(/\D/g, "");

    // Find recent "Sent" quotes joined with customer phone
    const searchRes = await fetch(
      `${supabaseUrl}/rest/v1/quotes?status=eq.Sent&order=created_at.desc&limit=20&select=id,total_amount,description,customer_id,customers!inner(phone)`,
      {
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
          "Content-Type": "application/json",
        },
      }
    );

    const quotes = await searchRes.json();

    // Filter by phone match (compare digits only)
    const match = Array.isArray(quotes)
      ? quotes.find((q: any) => {
          const custPhone = (q.customers?.phone || "").replace(/\D/g, "");
          // Match last 9 digits to handle country code differences
          return custPhone.length >= 9 && digits.length >= 9 &&
            custPhone.slice(-9) === digits.slice(-9);
        })
      : null;

    if (!match) {
      return new Response(
        JSON.stringify({ success: false, error: "No matching Sent quote found for this mobile number" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const quoteRef = `Q-${match.id.slice(0, 4).toUpperCase()}`;

    // Update status to Accepted
    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/quotes?id=eq.${match.id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "Accepted",
          accepted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update quote: " + errText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Auto-create job from accepted quote (if not already converted)
    // First check if quote already has a converted_job_id
    const quoteCheckRes = await fetch(
      `${supabaseUrl}/rest/v1/quotes?id=eq.${match.id}&select=converted_job_id,customer_id,description,user_id,job_id`,
      {
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
          "Content-Type": "application/json",
        },
      }
    );
    const quoteData = await quoteCheckRes.json();
    const quoteRow = Array.isArray(quoteData) ? quoteData[0] : null;

    let newJobId: string | null = null;
    if (quoteRow && !quoteRow.converted_job_id) {
      // Get original job details for engineer info
      const origJobRes = await fetch(
        `${supabaseUrl}/rest/v1/service_calls?id=eq.${quoteRow.job_id}&select=job_type,assigned_engineer,assigned_engineer_id`,
        {
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
            "Content-Type": "application/json",
          },
        }
      );
      const origJobs = await origJobRes.json();
      const origJob = Array.isArray(origJobs) ? origJobs[0] : null;

      const insertRes = await fetch(
        `${supabaseUrl}/rest/v1/service_calls`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            customer_id: quoteRow.customer_id,
            user_id: quoteRow.user_id,
            job_type: origJob?.job_type || "Repair",
            job_issue: quoteRow.description,
            assigned_engineer: origJob?.assigned_engineer || null,
            assigned_engineer_id: origJob?.assigned_engineer_id || null,
            status: "Pending",
            has_quote: true,
            notes: `Created from quote ${quoteRef}`,
            source: "Quote",
          }),
        }
      );

      if (insertRes.ok) {
        const newJobs = await insertRes.json();
        newJobId = Array.isArray(newJobs) ? newJobs[0]?.id : null;
        if (newJobId) {
          await fetch(
            `${supabaseUrl}/rest/v1/quotes?id=eq.${match.id}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${supabaseKey}`,
                apikey: supabaseKey,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify({ converted_job_id: newJobId }),
            }
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, quote_ref: quoteRef, quote_id: match.id, job_id: newJobId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
