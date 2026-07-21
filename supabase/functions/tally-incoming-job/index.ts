import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-webhook-secret",
};

const MAX_NAME_LEN = 200;
const MAX_ADDRESS_LEN = 500;
const MAX_TEXT_LEN = 1000;
const MAX_SHORT_LEN = 100;

const sanitize = (val: unknown, maxLen: number): string | null => {
  if (!val || typeof val !== "string") return null;
  return val.trim().substring(0, maxLen) || null;
};

const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidPhone = (phone: string): boolean => /^(\+353|0)[0-9]{8,9}$/.test(phone.replace(/[\s\-()]/g, ""));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
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

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // Sanitize control characters that Make/Tally may inject into string values
    const rawText = await req.text();
    const cleanText = rawText.replace(/[\x00-\x1F\x7F]/g, (ch) =>
      ch === "\n" || ch === "\r" || ch === "\t" ? " " : "",
    );
    const body = JSON.parse(cleanText);
    console.log("[tally-incoming-job] RAW BODY:", JSON.stringify(body));

    // Extract and sanitize fields
    const customerName = sanitize(body.customer_name, MAX_NAME_LEN);
    const mobileNumber = sanitize(body.mobile_number, MAX_SHORT_LEN);
    const email = sanitize(body.email, MAX_NAME_LEN);
    const jobIssue = sanitize(body.job_issue, MAX_TEXT_LEN);
    const extraDetails = sanitize(body.extra_details, MAX_TEXT_LEN);
    const boilerType = sanitize(body.boiler_type, MAX_SHORT_LEN);
    const boilerBrand = sanitize(body.boiler_brand, MAX_SHORT_LEN);
    const boilerModel = sanitize(body.boiler_model, MAX_SHORT_LEN);
    const boilerErrorCode = sanitize(body.boiler_error_code, MAX_SHORT_LEN);
    const boilerWorking = body.boiler_working;
    const fullAddress = sanitize(body.full_address, MAX_ADDRESS_LEN);
    const areaCode = (() => {
      const raw = sanitize(body.area_code, MAX_SHORT_LEN);
      return raw ? raw.replace(/^dublin\s+/i, "D").toUpperCase() : null;
    })();
    const eircode = sanitize(body.eircode, 10);
    const preferredDay = sanitize(body.preferred_day, MAX_SHORT_LEN);
    const preferredTime = sanitize(body.preferred_time, MAX_SHORT_LEN);
    const ownerOrTenant = sanitize(body.owner_or_tenant, MAX_SHORT_LEN);
    const accessNotes = sanitize(body.access_notes, MAX_TEXT_LEN);
    const photoVideoUpload = body.photo_video_upload; // could be string URL or array

    // Validate required fields
    const missingFields: string[] = [];
    if (!customerName) missingFields.push("customer_name");
    if (!mobileNumber) missingFields.push("mobile_number");
    if (!fullAddress) missingFields.push("full_address");
    if (!eircode) missingFields.push("eircode");
    if (!jobIssue) missingFields.push("job_issue");
    if (!preferredDay) missingFields.push("preferred_day");
    if (!preferredTime) missingFields.push("preferred_time");

    if (missingFields.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: `Missing required fields: ${missingFields.join(", ")}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!isValidPhone(mobileNumber)) {
      return new Response(JSON.stringify({ success: false, error: "Invalid mobile number format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (email && !isValidEmail(email)) {
      return new Response(JSON.stringify({ success: false, error: "Invalid email format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalise phone to E.164 (+353XXXXXXXXX)
    const normalisedPhone = mobileNumber
      ? mobileNumber.startsWith("+")
        ? mobileNumber
        : mobileNumber.startsWith("353")
        ? "+" + mobileNumber
        : "+353" + mobileNumber.replace(/^0/, "")
      : "";

    // Resolve organisation dynamically from the Tally payload.
    // Accept either an explicit organisation_id (UUID) or an org slug field.
    const payloadOrgId = sanitize(body.organisation_id, MAX_SHORT_LEN);
    const payloadOrgSlug =
      sanitize(body.org_slug, MAX_SHORT_LEN) ??
      sanitize(body.organisation_slug, MAX_SHORT_LEN);

    let orgData: { id: string; owner_user_id: string | null } | null = null;

    if (payloadOrgId) {
      const { data } = await supabase
        .from("organisations")
        .select("id, owner_user_id")
        .eq("id", payloadOrgId)
        .maybeSingle();
      orgData = data as typeof orgData;
    } else if (payloadOrgSlug) {
      const { data } = await supabase
        .from("organisations")
        .select("id, owner_user_id")
        .eq("slug", payloadOrgSlug)
        .maybeSingle();
      orgData = data as typeof orgData;
    } else {
      console.error("tally-incoming-job: no org identifier in payload");
      try {
        await supabase.from("edge_function_logs").insert({
          function_name: "tally-incoming-job",
          error_message: "tally-incoming-job: no org identifier in payload",
          payload: body ?? null,
        });
      } catch (_e) {
        /* logging best-effort */
      }
      // Tally always needs a 200 — acknowledge without processing.
      return new Response(
        JSON.stringify({ success: false, error: "No organisation identifier in payload" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!orgData) {
      return new Response(JSON.stringify({ success: false, error: "Organisation not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = orgData.owner_user_id;

    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: "Organisation owner not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: if this Tally submission was already processed, return the
    // existing job rather than creating a duplicate. Falls back through the
    // known field names Tally/Make send.
    const submissionId = sanitize(
      body.tally_submission_id ?? body.eventId ?? body.id ?? null,
      MAX_SHORT_LEN,
    );

    if (submissionId) {
      const { data: existingJob } = await supabase
        .from("service_calls")
        .select("id, customer_id")
        .eq("tally_submission_id", submissionId)
        .eq("organisation_id", orgData.id)
        .maybeSingle();
      if (existingJob) {
        console.log("[tally-incoming-job] duplicate submission:", submissionId);
        return new Response(
          JSON.stringify({
            success: true,
            id: existingJob.id,
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

    // Upsert customer (match by phone)
    let customerId: string;

    console.log("[tally-incoming-job] orgData.id:", orgData.id, "userId:", userId);

    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", normalisedPhone)
      .eq("organisation_id", orgData.id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      customerId = existing.id;
      await supabase
        .from("customers")
        .update({
          user_id: userId,
          organisation_id: orgData.id,
          name: customerName,
          email,
          address: fullAddress,
          eircode: eircode,
          area_code: areaCode,
          boiler_brand: boilerBrand,
          boiler_model: boilerModel,
        })
        .eq("id", customerId);
    } else {
      const nextServiceDue = new Date();
      nextServiceDue.setFullYear(nextServiceDue.getFullYear() + 1);
      const { data: newCustomer, error: insertErr } = await supabase
        .from("customers")
        .insert({
          user_id: userId,
          organisation_id: orgData.id,
          name: customerName,
          phone: normalisedPhone,
          email,
          address: fullAddress,
          eircode: eircode,
          area_code: areaCode,
          boiler_brand: boilerBrand,
          boiler_model: boilerModel,
          next_service_due: nextServiceDue.toISOString().split("T")[0],
          renewal_stage: "none",
          service_status: "active",
        })
        .select("id")
        .single();

      if (insertErr || !newCustomer) {
        console.error("Customer creation failed:", insertErr);
        return new Response(JSON.stringify({ success: false, error: "Unable to process submission." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      customerId = newCustomer.id;
    }

    console.log("[tally-incoming-job] customerId:", customerId);

    // Parse boiler_working
    const boilerWorkingBool =
      boilerWorking === true || boilerWorking === "Yes" || boilerWorking === "yes" || boilerWorking === "true";

    // Map preferred_time to time_block
    const timeBlockMap: Record<string, string> = {
      morning: "Morning",
      midday: "Midday",
      afternoon: "Afternoon",
    };
    const timeBlock = timeBlockMap[(preferredTime ?? "").toLowerCase()] ?? preferredTime ?? null;

    // Create service call
    const { data: job, error: jobErr } = await supabase
      .from("service_calls")
      .insert({
        user_id: userId,
        organisation_id: orgData?.id,
        customer_id: customerId,
        job_type: "Boiler Service",
        status: "Pending",
        source: "Tally Form",
        incoming_status: "Pending",
        scheduled_date: preferredDay ?? null,
        time_block: timeBlock,
        boiler_brand: boilerBrand,
        boiler_working: boilerWorking != null ? boilerWorkingBool : null,
        boiler_issue: jobIssue,
        email,
        job_issue: jobIssue,
        extra_details: extraDetails,
        boiler_type: boilerType,
        boiler_error_code: boilerErrorCode,
        area_code: areaCode,
        owner_or_tenant: ownerOrTenant,
        access_notes: accessNotes,
        notes: extraDetails,
        tally_submission_id: submissionId,
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      // If two requests raced past the pre-check, the unique partial index on
      // tally_submission_id will reject the second one (Postgres 23505).
      // Re-query and return the existing row so the caller sees success.
      if (submissionId && (jobErr as { code?: string } | null)?.code === "23505") {
        const { data: raceRow } = await supabase
          .from("service_calls")
          .select("id, customer_id")
          .eq("tally_submission_id", submissionId)
          .eq("organisation_id", orgData.id)
          .maybeSingle();
        if (raceRow) {
          return new Response(
            JSON.stringify({
              success: true,
              id: raceRow.id,
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
      console.error("Job creation failed:", jobErr);
      return new Response(JSON.stringify({ success: false, error: "Unable to process submission." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Notify office of new incoming job
    try {
      const { data: officeSettings } = await supabase
        .from("settings")
        .select("user_id")
        .eq("organisation_id", orgData.id)
        .limit(1)
        .maybeSingle();
      const recipientId = (officeSettings as any)?.user_id || userId;
      if (recipientId) {
        await supabase.from("notifications").insert({
          recipient_user_id: recipientId,
          organisation_id: orgData.id,
          notification_type: "new_job",
          title: "New Job Request",
          body: `${customerName} — ${jobIssue ?? "New booking from Tally"}`,
          role: "office",
          job_id: job.id,
          metadata: { source: "Tally Form", customer_id: customerId, service_call_id: job.id },
        });
      }
    } catch (notifyErr) {
      console.error("tally-incoming-job: notification insert failed", notifyErr);
    }

    // Handle photo/video uploads if provided as URLs
    if (photoVideoUpload) {
      const urls = Array.isArray(photoVideoUpload) ? photoVideoUpload : [photoVideoUpload];
      let fileCount = 0;
      for (const fileEntry of urls) {
        if (fileCount >= 10) break;
        try {
          const fileUrl = typeof fileEntry === "string" ? fileEntry : fileEntry?.url;
          if (!fileUrl || typeof fileUrl !== "string") continue;

          const fileResponse = await fetch(fileUrl);
          const fileBuffer = await fileResponse.arrayBuffer();
          const rawName =
            typeof fileEntry === "object" && fileEntry?.name
              ? (sanitize(fileEntry.name, MAX_SHORT_LEN) ?? `upload-${Date.now()}`)
              : `upload-${Date.now()}`;
          const fileName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `customers/${customerId}/${job.id}/${fileName}`;
          const isVideo = /\.(mp4|mov|avi|webm)$/i.test(fileName);

          await supabase.storage.from("job-media").upload(storagePath, fileBuffer, {
            contentType: fileResponse.headers.get("content-type") ?? "image/jpeg",
            upsert: true,
          });

          await supabase.from("job_media").insert({
            job_id: job.id,
            customer_id: customerId,
            user_id: userId,
            file_name: fileName,
            file_type: isVideo ? "video" : "image",
            storage_path: storagePath,
            public_url: null,
            uploaded_by: "customer",
          });
          fileCount++;
        } catch (fileErr) {
          console.error("File upload error:", fileErr);
        }
      }
    }
    // v2 - force redeploy
    return new Response(JSON.stringify({ success: true, id: job.id, customer_id: customerId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("tally-incoming-job error:", err);
    try {
      await supabase.from("edge_function_logs").insert({
        function_name: "tally-incoming-job",
        error_message: err instanceof Error ? err.message : String(err),
        payload: null,
      });
    } catch (_) {
      /* logging best-effort */
    }
    return new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
