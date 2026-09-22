// Phase 3B — Tally "Find My Boiler" → BookedJobs new boiler enquiry.
//
// This endpoint NEVER creates a job. It creates (or returns) one structured
// `boiler_enquiries` row, matches or creates the customer, copies uploaded
// photos into tenant-scoped storage, records attribution, writes a customer
// activity entry and notifies the office.
//
// Tenant resolution is strictly server-side: the caller must present its own
// per-tenant webhook secret, or a Tally form id registered on the tenant's
// `tally` integration row. A body-supplied organisation_id is a hint only and is
// rejected when it disagrees. The `unbound_claim` fallback used by the older
// booking endpoints is deliberately NOT used here.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isMachineCaller } from "../_shared/machineAuth.ts";
import { machineOrgDenial, resolveMachineOrganisation } from "../_shared/machineOrg.ts";
import { matchCustomer } from "../_shared/matchCustomer.ts";
import { normalisePhoneE164 } from "../_shared/phone.ts";
import {
  customerFillDecision,
  enquiryPhotoUrls,
  extractAttribution,
  extractContact,
  extractSubmissionId,
  flattenTallyPayload,
  imageTypeForUrl,
  isAcceptablePhotoSize,
  isAllowedEnquiryImage,
  mapBoilerEnquiryFields,
  MAX_ENQUIRY_PAYLOAD_BYTES,
  validateEnquirySubmission,
} from "../_shared/boilerEnquiryPayload.ts";

const FN = "tally-boiler-enquiry";
const BUCKET = "job-media";

async function logStage(
  supabase: any,
  stage: string,
  payload: Record<string, unknown>,
) {
  try {
    await supabase.from("edge_function_logs").insert({
      function_name: FN,
      error_message: `stage=${stage}`,
      payload,
    });
  } catch (e) {
    console.error(`${FN}: edge_function_logs insert failed`, e);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!(await isMachineCaller(req))) {
    console.warn(`${FN}: rejected unauthenticated caller`);
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let submissionId: string | null = null;
  let organisationId: string | null = null;

  try {
    // --- payload size limit -------------------------------------------------
    const raw = await req.text();
    if (raw.length > MAX_ENQUIRY_PAYLOAD_BYTES) {
      await logStage(supabase, "payload_too_large", { bytes: raw.length });
      return json({ success: false, error: "Payload too large" }, 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      await logStage(supabase, "invalid_json", { bytes: raw.length });
      return json({ success: false, error: "Invalid JSON body" }, 400);
    }

    const root = (body ?? {}) as Record<string, unknown>;
    const flat = flattenTallyPayload(body);
    submissionId = extractSubmissionId(body);

    // --- strict tenant binding ---------------------------------------------
    const formId =
      (root.formId as string) ??
      (root.form_id as string) ??
      ((root.data as Record<string, unknown> | undefined)?.formId as string) ??
      null;

    const resolved = await resolveMachineOrganisation(req, {
      fnName: FN,
      integrationTypes: ["tally"],
      identifier: {
        keys: ["boiler_enquiry_form_id", "find_my_boiler_form_id", "enquiry_form_id", "tally_form_id"],
        value: formId,
      },
      claimedOrgId: typeof root.organisation_id === "string" ? root.organisation_id : null,
    });

    if (!resolved.ok) {
      await logStage(supabase, `org_binding_failed:${resolved.reason}`, {
        submission_id: submissionId,
        form_id: formId,
      });
      return machineOrgDenial(resolved, corsHeaders);
    }
    organisationId = resolved.orgId;

    // --- validation ---------------------------------------------------------
    const contact = extractContact(flat);
    // Question NAMES only (never answers) so a mapping mismatch is diagnosable
    // without storing personal data in the log.
    const fieldNames = Object.keys(flat).slice(0, 100);
    const valid = validateEnquirySubmission(contact);
    if (!valid.ok) {
      await logStage(supabase, "validation_failed", {
        submission_id: submissionId,
        organisation_id: organisationId,
        reason: valid.error,
        field_names: fieldNames,
      });
      return json({ success: false, error: valid.error }, 400);
    }

    const phone = normalisePhoneE164(contact.phone) || null;

    // --- idempotency --------------------------------------------------------
    if (submissionId) {
      const { data: existing } = await supabase
        .from("boiler_enquiries")
        .select("id, customer_id")
        .eq("organisation_id", organisationId)
        .eq("external_source", "tally")
        .eq("external_submission_id", submissionId)
        .maybeSingle();
      if (existing) {
        await logStage(supabase, "duplicate_submission", {
          submission_id: submissionId,
          organisation_id: organisationId,
          enquiry_id: existing.id,
        });
        return json({
          success: true,
          duplicate: true,
          enquiry_id: existing.id,
          customer_id: existing.customer_id,
        });
      }
    }

    // --- owning user (customers.user_id is NOT NULL) ------------------------
    const { data: orgRow } = await supabase
      .from("organisations")
      .select("id, owner_user_id")
      .eq("id", organisationId)
      .maybeSingle();
    let ownerUserId = (orgRow as { owner_user_id: string | null } | null)?.owner_user_id ?? null;
    if (!ownerUserId) {
      // Older tenants may have no owner recorded on the organisation: fall back
      // to an office/admin profile inside the SAME organisation.
      const { data: fallbackProfile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("organisation_id", organisationId)
        .in("role", ["admin", "office", "owner", "manager"])
        .limit(1)
        .maybeSingle();
      ownerUserId = (fallbackProfile as { user_id: string } | null)?.user_id ?? null;
    }
    if (!ownerUserId) {
      await logStage(supabase, "organisation_owner_missing", {
        submission_id: submissionId,
        organisation_id: organisationId,
      });
      return json({ success: false, error: "Organisation owner not configured" }, 500);
    }

    // --- customer match or create ------------------------------------------
    const fields = mapBoilerEnquiryFields(flat);
    const attribution = extractAttribution(flat);

    const { matched, customer } = await matchCustomer(
      supabase,
      organisationId,
      phone ?? contact.phone,
      contact.email,
    );

    let customerId: string | null = matched && customer ? customer.id : null;
    let customerDifferences: Record<string, { existing: string; submitted: string }> = {};

    if (customerId) {
      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("id, name, phone, email, address, eircode")
        .eq("id", customerId)
        .eq("organisation_id", organisationId)
        .maybeSingle();

      const decision = customerFillDecision((existingCustomer ?? {}) as Record<string, unknown>, {
        name: contact.name,
        phone: phone ?? contact.phone,
        email: contact.email,
        address: (fields.address as string | null) ?? null,
        eircode: (fields.eircode as string | null) ?? null,
      });
      customerDifferences = decision.differences;

      if (Object.keys(decision.update).length > 0) {
        const { error: fillErr } = await supabase
          .from("customers")
          .update(decision.update)
          .eq("id", customerId)
          .eq("organisation_id", organisationId);
        if (fillErr) console.error(`${FN}: customer blank-field fill failed`, fillErr.message);
      }
    } else {
      const { data: created, error: createErr } = await supabase
        .from("customers")
        .insert({
          organisation_id: organisationId,
          user_id: ownerUserId,
          name: contact.name || "New boiler enquiry",
          phone: phone ?? contact.phone,
          email: contact.email,
          address: (fields.address as string | null) ?? null,
          eircode: (fields.eircode as string | null) ?? null,
          source: attribution.source ?? "New boiler enquiry",
        })
        .select("id")
        .single();
      if (createErr || !created) {
        await logStage(supabase, `customer_insert_failed:${createErr?.message ?? "unknown"}`, {
          submission_id: submissionId,
          organisation_id: organisationId,
          field_names: fieldNames,
        });
        return json({ success: false, error: "Failed to record customer" }, 500);
      }
      customerId = created.id;
    }

    // --- enquiry ------------------------------------------------------------
    const { data: enquiry, error: enquiryErr } = await supabase
      .from("boiler_enquiries")
      .insert({
        organisation_id: organisationId,
        customer_id: customerId,
        enquiry_type: "new_boiler",
        status: "NEW",
        ...fields,
        contact_name: contact.name,
        contact_phone: phone ?? contact.phone,
        contact_email: contact.email,
        ...attribution,
        external_source: "tally",
        external_submission_id: submissionId,
        raw_payload: body as Record<string, unknown>,
        office_review_notes:
          Object.keys(customerDifferences).length > 0
            ? { customer_differences: customerDifferences }
            : null,
      })
      .select("id")
      .single();

    if (enquiryErr || !enquiry) {
      // Unique index race: a concurrent retry already created it.
      if ((enquiryErr as { code?: string } | null)?.code === "23505" && submissionId) {
        const { data: raceRow } = await supabase
          .from("boiler_enquiries")
          .select("id, customer_id")
          .eq("organisation_id", organisationId)
          .eq("external_source", "tally")
          .eq("external_submission_id", submissionId)
          .maybeSingle();
        if (raceRow) {
          await logStage(supabase, "duplicate_submission_race", {
            submission_id: submissionId,
            organisation_id: organisationId,
          });
          return json({
            success: true,
            duplicate: true,
            enquiry_id: raceRow.id,
            customer_id: raceRow.customer_id,
          });
        }
      }
      await logStage(supabase, `enquiry_insert_failed:${enquiryErr?.message ?? "unknown"}`, {
        submission_id: submissionId,
        organisation_id: organisationId,
      });
      return json({ success: false, error: "Failed to record enquiry" }, 500);
    }

    // --- photos: copied server-side, validated, tenant-scoped --------------
    const photoUrls = enquiryPhotoUrls(flat);
    let storedPhotos = 0;
    const rejectedPhotos: string[] = [];

    for (const url of photoUrls) {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          rejectedPhotos.push(`fetch_${res.status}`);
          continue;
        }
        const headerType = res.headers.get("content-type");
        const contentType = isAllowedEnquiryImage(headerType) ? headerType! : imageTypeForUrl(url);
        if (!isAllowedEnquiryImage(contentType)) {
          rejectedPhotos.push("unsupported_type");
          continue;
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!isAcceptablePhotoSize(bytes.byteLength)) {
          rejectedPhotos.push("too_large");
          continue;
        }

        const ext = (contentType!.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
        const fileName = `enquiry-photo-${storedPhotos + 1}.${ext}`;
        const storagePath = `${organisationId}/boiler-enquiries/${enquiry.id}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, bytes, { contentType: contentType!, upsert: false });
        if (upErr) {
          rejectedPhotos.push(`upload_failed:${upErr.message}`);
          continue;
        }

        const { error: mediaErr } = await supabase.from("job_media").insert({
          organisation_id: organisationId,
          customer_id: customerId,
          boiler_enquiry_id: enquiry.id,
          file_name: fileName,
          file_type: contentType,
          storage_path: storagePath,
          storage_bucket: BUCKET,
          notes: "New boiler enquiry photo",
        });
        if (mediaErr) {
          rejectedPhotos.push(`media_row_failed:${mediaErr.message}`);
          continue;
        }
        storedPhotos += 1;
      } catch (e) {
        rejectedPhotos.push(`error:${(e as Error).message}`);
      }
    }

    // --- activity + office notification ------------------------------------
    try {
      await supabase.from("customer_activity").insert({
        organisation_id: organisationId,
        customer_id: customerId,
        event_type: "boiler_enquiry_received",
        event_label: "New boiler enquiry received",
        event_data: {
          enquiry_id: enquiry.id,
          source: attribution.source,
          installation_timeframe: fields.installation_timeframe,
          photos: storedPhotos,
        },
      });
    } catch (e) {
      console.error(`${FN}: activity insert failed`, e);
    }

    try {
      const { data: recipients } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("organisation_id", organisationId)
        .in("role", ["admin", "office", "owner", "manager"]);
      const rows = (recipients ?? []).map((r: { user_id: string }) => ({
        recipient_user_id: r.user_id,
        notification_type: "boiler_enquiry",
        title: "New boiler enquiry",
        body: `${contact.name ?? "A customer"} submitted a new boiler enquiry`,
        organisation_id: organisationId,
        role: "office",
        metadata: { enquiry_id: enquiry.id },
      }));
      if (rows.length) await supabase.from("notifications").insert(rows);
    } catch (e) {
      console.error(`${FN}: notification insert failed`, e);
    }

    await logStage(supabase, `success:enquiry=${enquiry.id}`, {
      submission_id: submissionId,
      organisation_id: organisationId,
      via: resolved.via,
      photos_stored: storedPhotos,
      photos_rejected: rejectedPhotos,
      customer_matched: matched,
    });

    return json({
      success: true,
      enquiry_id: enquiry.id,
      customer_id: customerId,
      customer_matched: matched,
      photos_stored: storedPhotos,
      photos_rejected: rejectedPhotos.length,
    });
  } catch (err) {
    console.error(`${FN}: unhandled error`, err);
    await logStage(supabase, `exception:${err instanceof Error ? err.message : String(err)}`, {
      submission_id: submissionId,
      organisation_id: organisationId,
    });
    return json({ success: false, error: "Internal server error" }, 500);
  }
});
