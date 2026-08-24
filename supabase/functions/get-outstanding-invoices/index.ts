import { createClient } from "npm:@supabase/supabase-js@2";
import { authoriseRequest, unauthorisedResponse } from "../_shared/functionAuth.ts";

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

  const auth = await authoriseRequest(req);
  if (!auth.ok) {
    console.warn(`get-outstanding-invoices: unauthorized call (${auth.reason})`);
    return unauthorisedResponse(corsHeaders, auth.reason);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Parse optional body for organisation_id (required)
    let organisation_id: string | undefined;
    try {
      const body = await req.json();
      organisation_id = body?.organisation_id;
    } catch (_e) {
      // no body / invalid JSON
    }

    if (!organisation_id) {
      return new Response(
        JSON.stringify({ error: "organisation_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const { data: jobs, error } = await supabase
      .from("service_calls")
      .select("id, organisation_id, balance_due, completed_at, invoice_reminder_count, customer_id, invoice_number, invoiced_at, customers(name, phone, opted_out)")
      .eq("organisation_id", organisation_id)
      .eq("payment_status", "unpaid")
      .eq("payment_method", "invoice")
      .lt("invoice_reminder_count", 2)
      .gte("completed_at", sixtyDaysAgo)
      .lte("completed_at", fourteenDaysAgo)
      .not("completed_at", "is", null);

    if (error) throw error;

    const normalisePhone = (raw: string): string => {
      let digits = (raw || "").replace(/[^\d+]/g, "");
      if (digits.startsWith("+")) digits = digits.slice(1);
      digits = digits.replace(/\D/g, "");
      if (digits.startsWith("0")) digits = "353" + digits.slice(1);
      return digits;
    };

    const results = (jobs || [])
      .filter((j: any) => j.customers && j.customers.opted_out !== true)
      .map((j: any) => {
        const customerName = j.customers?.name || "Unknown";
        const customerFirstName = (customerName || "Customer").split(" ")[0];
        return {
          service_call_id: j.id,
          organisation_id: j.organisation_id,
          customer_name: customerName,
          customer_first_name: customerFirstName,
          customer_phone: normalisePhone(j.customers?.phone || ""),
          balance_due: j.balance_due || 0,
          completed_at: j.completed_at,
          invoice_number: j.invoice_number || null,
          invoice_date: j.invoiced_at || j.completed_at,
          invoice_reminder_count: j.invoice_reminder_count || 0,
        };
      });

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
