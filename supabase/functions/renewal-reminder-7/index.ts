import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id",
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
    const target = new Date(today);
    target.setDate(target.getDate() + 7);
    const targetDate = target.toISOString().split("T")[0];

    const { data: customers, error: custErr } = await supabase
      .from("customers")
      .select("id, name, phone, next_service_due, organisation_id, reminder_7_days_sent")
      .eq("next_service_due", targetDate)
      .neq("opted_out", true);

    if (custErr) throw custErr;
    if (!customers || customers.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      .filter((c: any) => {
        if (!c.organisation_id) {
          console.warn(`[renewal-reminder-7] customer ${c.id} missing organisation_id — skipping`);
          return false;
        }
        return true;
      })
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
        function_name: '7-day-reminder',
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
