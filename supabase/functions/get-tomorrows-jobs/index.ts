import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate tomorrow's date in ISO format
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0]; // yyyy-MM-dd

    // Query jobs scheduled for tomorrow, excluding cancelled/completed
    const { data: jobs, error } = await supabase
      .from("service_calls")
      .select(`
        id,
        scheduled_date,
        time_block,
        job_type,
        assigned_engineer,
        assigned_engineer_id,
        status,
        customer_id,
        customers ( name, phone, address, eircode, boiler_make_model, access_notes ),
        engineers:assigned_engineer_id ( name )
      `)
      .eq("scheduled_date", tomorrowStr)
      .not("status", "in", '("Cancelled","Completed","no_show")');

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const result = (jobs || []).map((job: any) => ({
      job_id: job.id,
      customer_name: job.customers?.name || null,
      customer_phone: job.customers?.phone || null,
      customer_address: job.customers?.address || null,
      customer_eircode: job.customers?.eircode || null,
      boiler_make_model: job.customers?.boiler_make_model || null,
      access_notes: job.customers?.access_notes || null,
      appointment_time: job.time_block || "No time set",
      scheduled_date: job.scheduled_date,
      engineer_name: job.engineers?.name || job.assigned_engineer || null,
      job_type: job.job_type,
      status: job.status,
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
