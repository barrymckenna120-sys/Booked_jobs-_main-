import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CUSTOMER_REMINDER_COLUMN,
  JOB_REMINDER_COLUMN,
  type ReminderKind,
} from "../_shared/renewalDedup.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const reminder_type = body?.reminder_type as ReminderKind;
    const organisation_id = body?.organisation_id;
    let customer_id: string | null =
      typeof body?.customer_id === "string" && body.customer_id ? body.customer_id : null;
    const job_id: string | null =
      typeof body?.job_id === "string" && body.job_id ? body.job_id : null;

    if (!organisation_id || typeof organisation_id !== "string") {
      return json({ error: "organisation_id is required and must be a string" }, 400);
    }

    if (!(reminder_type in CUSTOMER_REMINDER_COLUMN)) {
      return json(
        { error: "reminder_type must be '30day', '14day', '7day', or '2day'" },
        400,
      );
    }

    const customerColumn = CUSTOMER_REMINDER_COLUMN[reminder_type];
    const jobColumn = JOB_REMINDER_COLUMN[reminder_type];

    // A 2-day appointment reminder only exists in the context of a job.
    if (reminder_type === "2day" && !job_id) {
      return json({ error: "job_id is required for reminder_type '2day'" }, 400);
    }

    // Renewal reminders are customer-level: the customer may legitimately have
    // no job yet (that is the point of the reminder), so job_id is optional.
    if (!customer_id && !job_id) {
      return json({ error: "customer_id is required (job_id may be sent instead)" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Backwards compatible: older Make scenarios send job_id only.
    if (!customer_id && job_id) {
      const { data: job, error: jobLookupErr } = await supabase
        .from("service_calls")
        .select("customer_id")
        .eq("id", job_id)
        .eq("organisation_id", organisation_id)
        .maybeSingle();

      if (jobLookupErr) throw jobLookupErr;
      if (!job) return json({ error: "job not found for this organisation" }, 404);
      customer_id = job.customer_id as string;
    }

    let customer_updated = false;
    let job_updated = false;

    if (customerColumn && customer_id) {
      const { data, error } = await supabase
        .from("customers")
        .update({
          [customerColumn]: true,
          last_reminder_sent: new Date().toISOString(),
          last_message_type: `renewal_${reminder_type}`,
        })
        .eq("id", customer_id)
        .eq("organisation_id", organisation_id)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) {
        return json({ error: "customer not found for this organisation" }, 404);
      }
      customer_updated = true;
    }

    // Keep the legacy job-level flag in sync when a job is available.
    if (jobColumn && job_id) {
      const { data, error } = await supabase
        .from("service_calls")
        .update({ [jobColumn]: true })
        .eq("id", job_id)
        .eq("organisation_id", organisation_id)
        .select("id");

      if (error) throw error;
      job_updated = !!data && data.length > 0;
    }

    return json({
      success: true,
      customer_id,
      job_id,
      reminder_type,
      customer_column_updated: customer_updated ? customerColumn : null,
      job_column_updated: job_updated ? jobColumn : null,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
