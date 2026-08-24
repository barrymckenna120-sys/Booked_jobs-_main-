import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authoriseRequest, unauthorisedResponse } from "../_shared/functionAuth.ts";

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await authoriseRequest(req);
  if (!auth.ok) {
    console.warn(`get-upcoming-jobs: unauthorized call (${auth.reason})`);
    return unauthorisedResponse(corsHeaders, auth.reason);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const target = new Date(now);
    target.setDate(target.getDate() + 2);
    const targetStr = target.toISOString().split("T")[0];

    const { data: jobs, error } = await supabase
      .from("service_calls")
      .select(`
        id,
        scheduled_date,
        time_block,
        job_type,
        assigned_engineer,
        status,
        customer_id,
        customers ( name, phone )
      `)
      .eq("scheduled_date", targetStr)
      .not("status", "in", '("Cancelled","Completed","no_show")');

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const result = (jobs || []).map((job: any) => ({
      id: job.id,
      customer_name: job.customers?.name || null,
      customer_phone: job.customers?.phone || null,
      scheduled_date: job.scheduled_date,
      scheduled_time: job.time_block || null,
      job_type: job.job_type,
      assigned_engineer: job.assigned_engineer,
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
