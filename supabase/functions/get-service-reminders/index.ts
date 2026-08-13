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
    const { days_ahead } = await req.json();

    if (![30, 14, 2].includes(days_ahead)) {
      return new Response(
        JSON.stringify({ error: "days_ahead must be 30, 14, or 2" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Calculate target date
    const today = new Date();
    const target = new Date(today);
    target.setDate(target.getDate() + days_ahead);
    const targetDate = target.toISOString().split("T")[0];

    // Map days_ahead to the reminder flag column
    const reminderCol =
      days_ahead === 30
        ? "reminder_30day_sent"
        : days_ahead === 14
        ? "reminder_14day_sent"
        : "reminder_2day_sent";

    // Query jobs on target date, joining customers and engineers
    const { data: jobs, error } = await supabase
      .from("service_calls")
      .select(`
        id,
        scheduled_date,
        time_block,
        payment_status,
        reminder_30day_sent,
        reminder_14day_sent,
        reminder_2day_sent,
        assigned_engineer,
        assigned_engineer_id,
        customer_id,
        customers ( name, phone, opted_out ),
        engineers:assigned_engineer_id ( name )
      `)
      .eq("scheduled_date", targetDate)
      .eq(reminderCol, false)
      .not("status", "in", '("Cancelled","Completed","no_show")');

    if (error) throw error;

    // Filter out opted-out customers and shape the response
    const result = (jobs || [])
      .filter((job: any) => !job.customers?.opted_out)
      .map((job: any) => ({
        customer_name: job.customers?.name || "",
        customer_phone: job.customers?.phone || "",
        engineer_name: job.engineers?.name || job.assigned_engineer || "",
        job_date: job.scheduled_date,
        job_time: job.time_block || "",
        job_id: job.id,
        payment_status: job.payment_status || "unpaid",
        gdpr_opt_out: job.customers?.opted_out || false,
        reminder_30day_sent: job.reminder_30day_sent || false,
        reminder_14day_sent: job.reminder_14day_sent || false,
        reminder_2day_sent: job.reminder_2day_sent || false,
      }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
