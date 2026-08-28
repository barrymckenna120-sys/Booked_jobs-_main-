import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isDenied, requireBoundOrg } from "../_shared/orgAuth.ts";

/**
 * Financial data: only tenant roles that are allowed to see money in the app
 * may read outstanding invoices. Engineers are excluded by design.
 * Machine callers (Make.com scenario / cron) are bound to one tenant by
 * requireBoundOrg and are not role-gated.
 */
const FINANCE_ROLES = ["owner", "admin", "manager", "office", "superadmin"];

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    // Bind the caller (user JWT or machine credential) to a single tenant.
    // A body-supplied organisation_id can never widen access.
    const access = await requireBoundOrg(req, {
      fnName: "get-outstanding-invoices",
      cors: corsHeaders,
      requestedOrgId: organisation_id ?? null,
    });
    if (isDenied(access)) return access.error;
    organisation_id = access.orgId;

    // Tenant-role authorization for signed-in users (unchanged for machines).
    if (access.kind === "user" && !FINANCE_ROLES.includes(String(access.role ?? ""))) {
      console.warn(
        `get-outstanding-invoices: role ${access.role ?? "none"} is not permitted to read invoices`,
      );
      return new Response(JSON.stringify({ error: "Forbidden", reason: "role_not_permitted" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
