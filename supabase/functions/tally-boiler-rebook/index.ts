import { createClient } from "npm:@supabase/supabase-js@2";
import { bindMachineOrganisation } from "../_shared/machineOrg.ts";
import { matchCustomer } from "../_shared/matchCustomer.ts";
import { normalisePhoneE164 } from "../_shared/phone.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isMachineCaller } from "../_shared/machineAuth.ts";
import { flagDuplicateJob } from "../_shared/duplicateJob.ts";


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
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Webhook authentication via the shared machine-auth gate (per-tenant
  // integration secret, global shared secret, or service-role key).
  if (!(await isMachineCaller(req))) {
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
      organisation_id: claimedOrganisationId,
      source,
      tally_submission_id,
      eventId,
      id: bodyId,
    } = body ?? {};

    // Bind the caller to one tenant server-side; the body organisation_id is a
    // hint only and is verified (or overridden) by the resolved identity.
    const bound = await bindMachineOrganisation(req, {
      fnName: "tally-boiler-rebook",
      integrationTypes: ["tally"],
      identifier: {
        keys: ["form_id", "renewal_form_id", "rebook_form_id", "tally_form_id"],
        value: (body as any)?.formId ?? (body as any)?.form_id ?? null,
      },
      claimedOrgId: typeof claimedOrganisationId === "string" ? claimedOrganisationId : null,
      cors: corsHeaders,
    });
    if (!bound.ok) {
      await logInvocation(supabase, body, null, "org_binding_failed");
      return bound.response;
    }
    const organisation_id = bound.orgId;

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

    // Look up customer via shared matcher (exact phone, last-9 fallback, email fallback).
    const { matched: customerMatched, customer: matchedCustomer } = await matchCustomer(
      supabase,
      organisation_id,
      normalisedPhone,
      email,
    );

    if (!customerMatched || !matchedCustomer) {
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
        customer_id: matchedCustomer.id,
        user_id: matchedCustomer.user_id,
        organisation_id,
        job_type: "Boiler Service",
        status: "Pending Payment",
        scheduled_date: preferred_date || null,
        time_block: preferred_time || null,
        source: source === "renewal_tally" ? "Renewal Tally Rebooking" : "Tally Rebooking",
        tally_submission_id: submissionId,
        customer_status_at_booking: "existing",
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
    await supabase.from("customers").update(customerUpdate).eq("id", matchedCustomer.id);

    // BJ-0131a — advisory job-level duplicate detection, post-insert only.
    // Excludes the row just created; all failures are logged and swallowed so a
    // customer rebook is never blocked by duplicate detection.
    try {
      const { data: dupeCustomer } = await supabase
        .from("customers")
        .select("address")
        .eq("id", matchedCustomer.id)
        .eq("organisation_id", organisation_id)
        .maybeSingle();
      await flagDuplicateJob(
        supabase,
        job.id,
        {
          organisationId: organisation_id,
          phone: normalisedPhone,
          jobType: "Boiler Service",
          address: (dupeCustomer as { address?: string } | null)?.address ?? "",
        },
        "tally-boiler-rebook",
      );
    } catch (_e) {
      console.error("[tally-boiler-rebook] duplicate detection skipped:", (_e as Error)?.message ?? _e);
    }

    await logInvocation(supabase, body, organisation_id, `success:job=${job.id}`);


    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        customer_id: matchedCustomer.id,
        customer_name: matchedCustomer.name,
        phone: matchedCustomer.phone,
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
