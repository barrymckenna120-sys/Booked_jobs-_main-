import { createClient } from "npm:@supabase/supabase-js@2";
import { matchCustomer } from "../_shared/matchCustomer.ts";
import { normalisePhoneE164 } from "../_shared/phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Phone helpers now live in ../_shared/phone.ts so other inbound handlers
// (Telnyx missed calls, etc.) reuse one implementation.
const normalisePhone = normalisePhoneE164;


async function logInvocation(
  supabase: any,
  payload: unknown,
  organisationId: string | null,
  outcome: string,
) {
  try {
    await supabase.from("edge_function_logs").insert({
      function_name: "tally-boiler-rebook",
      error_message: `outcome=${outcome}${organisationId ? ` org=${organisationId}` : ""}`,
      payload: payload ?? null,
    });
  } catch (_e) {
    console.error("tally-boiler-rebook: edge_function_logs insert failed", _e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Shared-secret auth: require x-webhook-secret matching MAKE_WEBHOOK_SECRET.
  const providedSecret = req.headers.get("x-webhook-secret");
  const expectedSecret = Deno.env.get("MAKE_WEBHOOK_SECRET");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any = null;

  try {
    body = await req.json();

    const {
      phone,
      email,
      preferred_date,
      preferred_time,
      organisation_id,
      source,
      tally_submission_id,
      eventId,
      id: bodyId,
    } = body ?? {};

    if (!phone || !organisation_id) {
      await logInvocation(supabase, body, organisation_id ?? null, "bad_request_missing_fields");
      return new Response(
        JSON.stringify({ error: "phone and organisation_id are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const normalisedPhone = normalisePhone(phone);
    if (!normalisedPhone) {
      await logInvocation(supabase, body, organisation_id, "bad_request_invalid_phone");
      return new Response(JSON.stringify({ error: "Invalid phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: if this Tally submission was already processed, return the
    // existing job rather than creating a duplicate. Mirrors tally-incoming-job.
    const submissionId: string | null =
      (typeof tally_submission_id === "string" && tally_submission_id.trim()) ||
      (typeof eventId === "string" && eventId.trim()) ||
      (typeof bodyId === "string" && bodyId.trim()) ||
      null;

    if (submissionId) {
      const { data: existingJob } = await supabase
        .from("service_calls")
        .select("id, customer_id")
        .eq("tally_submission_id", submissionId)
        .eq("organisation_id", organisation_id)
        .maybeSingle();

      if (existingJob) {
        await logInvocation(supabase, body, organisation_id, "duplicate_submission");
        return new Response(
          JSON.stringify({
            success: true,
            job_id: existingJob.id,
            customer_id: existingJob.customer_id,
            duplicate: true,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Look up customer by last-9-digit phone match within the org.
    const incomingLast9 = last9Digits(normalisedPhone);
    if (!incomingLast9) {
      await logInvocation(supabase, body, organisation_id, "bad_request_invalid_phone");
      return new Response(JSON.stringify({ error: "Invalid phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: candidates, error: custErr } = await supabase
      .from("customers")
      .select("id, name, phone, user_id")
      .eq("organisation_id", organisation_id);

    if (custErr) {
      console.error("Customer lookup error:", custErr);
      await logInvocation(supabase, body, organisation_id, `db_error:${custErr.message}`);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customer = (candidates ?? []).find(
      (c: { phone: string | null }) => last9Digits(c.phone) === incomingLast9,
    ) ?? null;

    if (!customer) {
      // Notify office of unmatched rebook (unchanged behaviour).
      const { data: settings } = await supabase
        .from("settings")
        .select("user_id")
        .eq("organisation_id", organisation_id)
        .limit(1)
        .maybeSingle();

      const recipientId = settings?.user_id;

      if (recipientId) {
        await supabase.from("notifications").insert({
          recipient_user_id: recipientId,
          notification_type: "unmatched_rebook",
          title: "Unmatched Rebook",
          body: "Tally rebook: phone number not matched — " + normalisedPhone,
          organisation_id,
          role: "office",
        });
      }

      await logInvocation(supabase, body, organisation_id, "not_found");
      return new Response(
        JSON.stringify({ success: false, reason: "not_found" }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Create service call
    const { data: job, error: jobErr } = await supabase
      .from("service_calls")
      .insert({
        customer_id: customer.id,
        user_id: customer.user_id,
        organisation_id,
        job_type: "Boiler Service",
        status: "Pending Payment",
        scheduled_date: preferred_date || null,
        time_block: preferred_time || null,
        source: source === "renewal_tally" ? "Renewal Tally Rebooking" : "Tally Rebooking",
        tally_submission_id: submissionId,
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      // Race: unique index rejects second insert with 23505 — return existing.
      if (submissionId && (jobErr as { code?: string } | null)?.code === "23505") {
        const { data: raceRow } = await supabase
          .from("service_calls")
          .select("id, customer_id")
          .eq("tally_submission_id", submissionId)
          .eq("organisation_id", organisation_id)
          .maybeSingle();
        if (raceRow) {
          await logInvocation(supabase, body, organisation_id, "duplicate_submission_race");
          return new Response(
            JSON.stringify({
              success: true,
              job_id: raceRow.id,
              customer_id: raceRow.customer_id,
              duplicate: true,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
      console.error("Job creation error:", jobErr);
      await logInvocation(
        supabase,
        body,
        organisation_id,
        `job_insert_failed:${jobErr?.message ?? "unknown"}`,
      );
      return new Response(JSON.stringify({ error: "Failed to create job" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update customer next_service_due and advance renewal_stage
    const customerUpdate: Record<string, string> = {
      renewal_stage: source === "renewal_tally" ? "Booked In" : "booked_in",
    };
    if (preferred_date) {
      customerUpdate.next_service_due = preferred_date;
    }
    await supabase.from("customers").update(customerUpdate).eq("id", customer.id);

    await logInvocation(supabase, body, organisation_id, `success:job=${job.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        customer_id: customer.id,
        customer_name: customer.name,
        phone: customer.phone,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("tally-boiler-rebook error:", err);
    await logInvocation(
      supabase,
      body,
      (body && typeof body === "object" && (body as any).organisation_id) || null,
      `exception:${err instanceof Error ? err.message : String(err)}`,
    );
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
