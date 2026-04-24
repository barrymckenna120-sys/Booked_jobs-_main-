import { createClient } from "npm:@supabase/supabase-js@2";

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

    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const { data: jobs, error } = await supabase
      .from("service_calls")
      .select("id, balance_due, completed_at, invoice_reminder_count, customer_id, invoice_number, invoice_date, customers(name, phone, opted_out)")
      .eq("payment_status", "unpaid")
      .eq("payment_method", "invoice")
      .lt("invoice_reminder_count", 2)
      .gte("completed_at", sixtyDaysAgo)
      .lte("completed_at", fourteenDaysAgo)
      .not("completed_at", "is", null);

    if (error) throw error;

    const results = (jobs || [])
      .filter((j: any) => j.customers && j.customers.opted_out !== true)
      .map((j: any) => ({
        service_call_id: j.id,
        customer_name: j.customers?.name || "Unknown",
        customer_phone: j.customers?.phone || "",
        balance_due: j.balance_due || 0,
        completed_at: j.completed_at,
        invoice_number: j.invoice_number || null,
        invoice_date: j.invoice_date || j.completed_at,
        invoice_reminder_count: j.invoice_reminder_count || 0,
      }));

    return new Response(JSON.stringify({ data: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await supabase.from("edge_function_logs").insert({
      function_name: "get-outstanding-invoices",
      error_message: message,
    });
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
