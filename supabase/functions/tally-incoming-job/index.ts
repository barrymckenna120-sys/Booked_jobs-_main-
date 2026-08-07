import { createClient } from "npm:@supabase/supabase-js@2";
import { normaliseMediaUrls } from "./mediaUrls.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-webhook-secret",
};

const MAX_NAME_LEN = 200;
const MAX_ADDRESS_LEN = 500;
const MAX_TEXT_LEN = 1000;
const MAX_SHORT_LEN = 100;

const CLOUDINARY_CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME") ?? "ddx2gnklt";
const CLOUDINARY_TALLY_PRESET = Deno.env.get("CLOUDINARY_TALLY_UPLOAD_PRESET");

const sanitize = (val: unknown, maxLen: number): string | null => {
  if (!val || typeof val !== "string") return null;
  return val.trim().substring(0, maxLen) || null;
};

const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidPhone = (phone: string): boolean => /^(\+353|0)[0-9]{8,9}$/.test(phone.replace(/[\s\-()]/g, ""));

// Tolerant normalisation of `photo_video_upload` into string[] (see mediaUrls.ts)
const collectMediaUrls = (input: unknown): string[] => normaliseMediaUrls(input);


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
    let cleanText = rawText.replace(/[\x00-\x1F\x7F]/g, (ch) =>
      ch === "\n" || ch === "\r" || ch === "\t" ? " " : "",
    );

    // Repair empty values produced by unmapped Make tokens, e.g.
    // `"photo_video_upload": ,` or `"photo_video_upload": }` → null.
    cleanText = cleanText
      // `"key": ,` / `"key": }` → `"key": null`
      .replace(/"\s*:\s*(?=[,}\]])/g, '": null')
      // stray double commas and trailing commas left by empty tokens
      .replace(/,\s*(?=,)/g, "")
      .replace(/,\s*(?=[}\]])/g, "");


    let body: Record<string, unknown>;
    try {
      body = JSON.parse(cleanText);
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error(
        "[tally-incoming-job] Malformed JSON body:",
        msg,
        "| snippet:",
        cleanText.slice(0, 1000),
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Malformed JSON body",
          detail: msg,
          snippet: cleanText.slice(0, 500),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
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
    const media: {
      attempted: number;
      uploaded: number;
      skipped: { url: string | null; reason: string; content_type?: string; status?: number }[];
    } = { attempted: 0, uploaded: 0, skipped: [] };

    const logMediaFailure = async (reason: string, detail: Record<string, unknown>) => {
      console.error("[tally-incoming-job] media skipped:", reason, detail);
      try {
        await supabase.from("edge_function_logs").insert({
          function_name: "tally-incoming-job",
          error_message: `media skipped: ${reason}`,
          payload: { job_id: job.id, organisation_id: orgData.id, ...detail },
        });
      } catch (_e) {
        /* logging best-effort */
      }
    };

    const EXT_MIME: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      heic: "image/heic",
      heif: "image/heif",
      webp: "image/webp",
      gif: "image/gif",
      mp4: "video/mp4",
      mov: "video/quicktime",
      m4v: "video/mp4",
      "3gp": "video/3gpp",
      webm: "video/webm",
      avi: "video/x-msvideo",
      pdf: "application/pdf",
    };

    const extensionOf = (url: string): string | null => {
      try {
        const path = new URL(url).pathname;
        const m = path.match(/\.([a-z0-9]{2,4})$/i);
        return m ? m[1].toLowerCase() : null;
      } catch {
        const m = url.split("?")[0].match(/\.([a-z0-9]{2,4})$/i);
        return m ? m[1].toLowerCase() : null;
      }
    };

    if (photoVideoUpload) {
      const urls = collectMediaUrls(photoVideoUpload);
      console.log(
        "[tally-incoming-job] photo_video_upload raw:",
        JSON.stringify(photoVideoUpload),
        "| parsed urls:",
        JSON.stringify(urls),
      );
      if (urls.length === 0) {
        media.skipped.push({ url: null, reason: "no_url_in_entry" });
        await logMediaFailure("no_url_in_entry", { entry: photoVideoUpload });
      }
      for (const fileUrl of urls) {
        if (media.uploaded >= 10) break;
        const fileEntry = fileUrl;
        media.attempted++;
        try {
          if (!fileUrl || typeof fileUrl !== "string") {
            media.skipped.push({ url: null, reason: "no_url_in_entry" });
            await logMediaFailure("no_url_in_entry", { entry: fileEntry });
            continue;
          }
          if (!CLOUDINARY_TALLY_PRESET) {
            media.skipped.push({ url: fileUrl, reason: "missing_cloudinary_preset" });
            await logMediaFailure("missing_cloudinary_preset", { url: fileUrl });
            continue;
          }

          const fileResponse = await fetch(fileUrl);
          const rawContentType = fileResponse.headers.get("content-type");
          console.log(
            "[tally-incoming-job] fetched file:",
            fileUrl,
            "status:", fileResponse.status,
            "content-type:", rawContentType,
            "content-length:", fileResponse.headers.get("content-length"),
          );

          if (!fileResponse.ok) {
            media.skipped.push({
              url: fileUrl,
              reason: "fetch_failed",
              status: fileResponse.status,
              content_type: rawContentType ?? undefined,
            });
            await logMediaFailure("fetch_failed", {
              url: fileUrl,
              status: fileResponse.status,
              status_text: fileResponse.statusText,
              content_type: rawContentType,
            });
            continue;
          }

          const contentLength = Number(fileResponse.headers.get("content-length") ?? 0);
          const MAX_BYTES = 25 * 1024 * 1024;
          if (contentLength > MAX_BYTES) {
            media.skipped.push({ url: fileUrl, reason: "file_too_large" });
            await logMediaFailure("file_too_large", { url: fileUrl, bytes: contentLength });
            continue;
          }

          const fileBuffer = await fileResponse.arrayBuffer();
          if (fileBuffer.byteLength > MAX_BYTES) {
            media.skipped.push({ url: fileUrl, reason: "file_too_large" });
            await logMediaFailure("file_too_large", { url: fileUrl, bytes: fileBuffer.byteLength });
            continue;
          }

          // Resolve a usable mime type: trust image/* and video/* (and pdf) from the
          // server; otherwise fall back to the file extension.
          const ext = extensionOf(fileUrl);
          const base = (rawContentType ?? "").split(";")[0].trim().toLowerCase();
          let contentType: string | null = null;
          if (base.startsWith("image/") || base.startsWith("video/") || base === "application/pdf") {
            contentType = base;
          } else if (ext && EXT_MIME[ext]) {
            contentType = EXT_MIME[ext];
          }

          if (!contentType) {
            media.skipped.push({
              url: fileUrl,
              reason: "unsupported_type",
              content_type: rawContentType ?? undefined,
            });
            await logMediaFailure("unsupported_type", {
              url: fileUrl,
              content_type: rawContentType,
              extension: ext,
            });
            continue;
          }

          const cloudinaryForm = new FormData();
          cloudinaryForm.append("file", new Blob([fileBuffer], { type: contentType }));
          cloudinaryForm.append("upload_preset", CLOUDINARY_TALLY_PRESET);
          cloudinaryForm.append("folder", `tally-uploads/${orgData.id}/${job.id}`);
          cloudinaryForm.append("tags", `org:${orgData.id},job:${job.id},source:tally`);

          const cloudinaryRes = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
            { method: "POST", body: cloudinaryForm },
          );
          const cloudinaryText = await cloudinaryRes.text();
          let cloudinaryData: any = null;
          try {
            cloudinaryData = JSON.parse(cloudinaryText);
          } catch (_e) {
            cloudinaryData = null;
          }

          if (!cloudinaryRes.ok || !cloudinaryData?.secure_url) {
            media.skipped.push({
              url: fileUrl,
              reason: "cloudinary_upload_failed",
              status: cloudinaryRes.status,
              content_type: contentType,
            });
            await logMediaFailure("cloudinary_upload_failed", {
              url: fileUrl,
              status: cloudinaryRes.status,
              content_type: contentType,
              response: cloudinaryText.slice(0, 1000),
            });
            continue;
          }

          const { error: mediaErr } = await supabase.from("job_media").insert({
            job_id: job.id,
            customer_id: customerId,
            user_id: userId,
            organisation_id: orgData.id,
            file_name: cloudinaryData.public_id,
            file_type: cloudinaryData.resource_type === "video" ? "video" : "image",
            storage_path: cloudinaryData.public_id,
            storage_bucket: "cloudinary",
            public_url: cloudinaryData.secure_url,
            uploaded_by: "customer",
          });

          if (mediaErr) {
            media.skipped.push({
              url: fileUrl,
              reason: "job_media_insert_failed",
              content_type: contentType,
            });
            await logMediaFailure("job_media_insert_failed", {
              url: fileUrl,
              error: mediaErr.message,
              code: (mediaErr as { code?: string }).code ?? null,
            });
            continue;
          }

          media.uploaded++;
        } catch (fileErr) {
          media.skipped.push({
            url: fileUrl,
            reason: "exception",
          });
          await logMediaFailure("exception", {
            url: fileUrl,
            error: fileErr instanceof Error ? fileErr.message : String(fileErr),
          });
        }
      }
    }

    console.log("[tally-incoming-job] media summary:", JSON.stringify(media));

    return new Response(
      JSON.stringify({ success: true, id: job.id, customer_id: customerId, media }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
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
