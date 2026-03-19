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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date();
    const rangeStart = new Date(today);
    rangeStart.setDate(rangeStart.getDate() + 28);
    const rangeEnd = new Date(today);
    rangeEnd.setDate(rangeEnd.getDate() + 32);
    const startDate = rangeStart.toISOString().split("T")[0];
    const endDate = rangeEnd.toISOString().split("T")[0];

    // Get customers due in 28-32 days who haven't opted out
    const { data: customers, error: custErr } = await supabase
      .from("customers")
      .select("id, name, phone, next_service_due")
      .gte("next_service_due", startDate)
      .lte("next_service_due", endDate)
      .neq("opted_out", true);

    if (custErr) throw custErr;
    if (!customers || customers.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get customer IDs that already have a pending/booked/confirmed job
    const customerIds = customers.map((c) => c.id);
    const { data: bookedJobs, error: jobErr } = await supabase
      .from("service_calls")
      .select("customer_id")
      .in("customer_id", customerIds)
      .in("status", ["Pending", "pending", "Booked", "booked", "Confirmed", "confirmed", "Scheduled"]);

    if (jobErr) throw jobErr;

    const bookedSet = new Set((bookedJobs || []).map((j) => j.customer_id));

    const result = customers
      .filter((c) => !bookedSet.has(c.id))
      .map((c) => ({
        id: c.id,
        full_name: c.name,
        mobile_number: c.phone,
        next_service_due: c.next_service_due,
      }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from('edge_function_logs').insert({
        function_name: '30-day-reminder',
        error_message: err instanceof Error ? err.message : String(err),
        payload: null,
      });
    } catch (_) { /* best-effort */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
