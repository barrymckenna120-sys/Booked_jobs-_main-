import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isDenied, requireBoundOrg } from "../_shared/orgAuth.ts";

/**
 * Reminder work-list feed (customer name + phone + job details).
 *
 * This previously ran an UNSCOPED query and returned every tenant's customers
 * and phone numbers to any anonymous caller. Now:
 *   authenticate caller -> bind to exactly one organisation -> query that
 *   organisation only -> return.
 *
 * A body-supplied organisation_id is never authorization: a signed-in user is
 * scoped to their own organisation, and a machine caller must be bound to the
 * organisation it names.
 */
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const days_ahead = (body as any)?.days_ahead;

    if (![30, 14, 2].includes(days_ahead)) {
      return json({ error: "days_ahead must be 30, 14, or 2" }, 400);
    }

    const access = await requireBoundOrg(req, {
      fnName: "get-service-reminders",
      cors: corsHeaders,
      requestedOrgId: typeof (body as any)?.organisation_id === "string"
        ? (body as any).organisation_id
        : null,
    });
    if (isDenied(access)) return access.error;
    const orgId = access.orgId;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Calculate target date
    const today = new Date();
    const target = new Date(today);
    target.setDate(target.getDate() + days_ahead);
    const targetDate = target.toISOString().split("T")[0];

    // Map days_ahead to the reminder flag column
    const reminderCol = days_ahead === 30
      ? "reminder_30day_sent"
      : days_ahead === 14
        ? "reminder_14day_sent"
        : "reminder_2day_sent";

    const { data: jobs, error } = await supabase
      .from("service_calls")
      .select(`
        id,
        organisation_id,
        scheduled_date,
        time_block,
        payment_status,
        reminder_30day_sent,
        reminder_14day_sent,
        reminder_2day_sent,
        assigned_engineer,
        assigned_engineer_id,
        customer_id,
        customers ( name, phone, opted_out, organisation_id ),
        engineers:assigned_engineer_id ( name )
      `)
      .eq("organisation_id", orgId)
      .eq("scheduled_date", targetDate)
      .eq(reminderCol, false)
      .not("status", "in", '("Cancelled","Completed","no_show")');

    if (error) {
      console.error("get-service-reminders query failed:", error.message);
      return json({ error: "query_failed" }, 500);
    }

    const result = (jobs || [])
      // Defence in depth: never emit a customer row that belongs elsewhere, and
      // never emit an opted-out customer into a send work-list.
      .filter((job: any) =>
        job.organisation_id === orgId &&
        (!job.customers?.organisation_id || job.customers.organisation_id === orgId) &&
        !job.customers?.opted_out
      )
      .map((job: any) => ({
        customer_name: job.customers?.name || "",
        customer_phone: job.customers?.phone || "",
        engineer_name: job.engineers?.name || job.assigned_engineer || "",
        job_date: job.scheduled_date,
        job_time: job.time_block || "",
        job_id: job.id,
        organisation_id: job.organisation_id,
        payment_status: job.payment_status || "unpaid",
        gdpr_opt_out: job.customers?.opted_out || false,
        reminder_30day_sent: job.reminder_30day_sent || false,
        reminder_14day_sent: job.reminder_14day_sent || false,
        reminder_2day_sent: job.reminder_2day_sent || false,
      }));

    return json(result);
  } catch (err) {
    console.error("get-service-reminders error:", err instanceof Error ? err.message : String(err));
    return json({ error: "internal_error" }, 500);
  }
});
