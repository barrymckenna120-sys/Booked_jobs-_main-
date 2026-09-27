// trigger-tenant-restore — superadmin-only entry point for BJ-NEW-X tenant restore.
//
// Validates the request, records a queued row in tenant_restores (one active
// restore per tenant, enforced by a unique index), dispatches the
// tenant-restore.yml GitHub Actions workflow on branch dev, and writes an
// audit_log row. Never returns or logs the GitHub PAT.

import { createClient } from "npm:@supabase/supabase-js@2";
import { isPlatformAdminDenied, requirePlatformAdmin } from "../_shared/platformAdmin.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const FN = "trigger-tenant-restore";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAMP_RE = /^\d{4}-\d{2}-\d{2}-\d{4}$/;
const DISPATCH_URL =
  "https://api.github.com/repos/barrymckenna120-sys/Booked_jobs-_main-/actions/workflows/tenant-restore.yml/dispatches";

function json(cors: Record<string, string>, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(cors, 405, { error: "Method not allowed" });

  try {
    const admin = await requirePlatformAdmin(req, { fnName: FN, cors });
    if (isPlatformAdminDenied(admin)) return admin.error;

    let body: {
      organisation_id?: unknown;
      backup_stamp?: unknown;
      mode?: unknown;
      confirm?: unknown;
      dry_run_id?: unknown;
    };
    try {
      body = await req.json();
    } catch (_e) {
      return json(cors, 400, { error: "Invalid JSON body" });
    }

    const organisationId = typeof body.organisation_id === "string" ? body.organisation_id : "";
    const backupStamp = typeof body.backup_stamp === "string" ? body.backup_stamp : "";
    const mode = typeof body.mode === "string" ? body.mode : "";

    if (!UUID_RE.test(organisationId)) {
      return json(cors, 400, { error: "organisation_id must be a UUID" });
    }
    if (!STAMP_RE.test(backupStamp)) {
      return json(cors, 400, { error: "backup_stamp must match YYYY-MM-DD-HHMM" });
    }
    if (mode !== "dry_run" && mode !== "recover_missing") {
      return json(cors, 400, { error: "mode must be 'dry_run' or 'recover_missing'" });
    }

    const dryRunId = typeof body.dry_run_id === "string" ? body.dry_run_id : "";
    if (mode === "recover_missing") {
      if (body.confirm !== true) {
        return json(cors, 400, { error: "recover_missing requires confirm === true" });
      }
      if (!UUID_RE.test(dryRunId)) {
        return json(cors, 400, { error: "recover_missing requires dry_run_id (UUID of a successful dry run)" });
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // organisation_id must exist in organisations
    const { data: org } = await supabase
      .from("organisations")
      .select("id")
      .eq("id", organisationId)
      .maybeSingle();
    if (!org) return json(cors, 400, { error: "organisation_id not found" });

    // backup_stamp must exist in backup_runs.stamp
    const { data: run } = await supabase
      .from("backup_runs")
      .select("id")
      .eq("stamp", backupStamp)
      .maybeSingle();
    if (!run) return json(cors, 400, { error: "backup_stamp not found in backup_runs" });

    // Record the queued restore (unique index: one active restore per tenant)
    const { data: restore, error: insertErr } = await supabase
      .from("tenant_restores")
      .insert({
        organisation_id: organisationId,
        backup_stamp: backupStamp,
        mode,
        status: "queued",
        requested_by: admin.userId,
      })
      .select("id")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        return json(cors, 409, { error: "A restore is already running for this tenant" });
      }
      console.error(`${FN}: tenant_restores insert failed:`, insertErr.message);
      return json(cors, 500, { error: "Failed to queue restore" });
    }

    const restoreId = restore.id as string;

    // Dispatch the GitHub Actions workflow
    const failRestore = async (msg: string) => {
      await supabase.from("tenant_restores").update({ status: "failed", error: msg }).eq("id", restoreId);
      return json(cors, 502, { error: msg });
    };
    const pat = (Deno.env.get("GITHUB_ACTIONS_PAT") ?? "").trim();
    if (!pat) return await failRestore("GitHub dispatch failed (no PAT configured)");
    // A token pasted with hidden/non-ASCII characters makes fetch() throw
    // "not a valid ByteString" — fail the row cleanly instead of leaving it queued.
    if (!/^[\x21-\x7E]+$/.test(pat)) {
      return await failRestore("GitHub dispatch failed (PAT contains invalid characters — re-enter the secret)");
    }

    let gh: Response;
    try {
      gh = await fetch(DISPATCH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "bookedjobs-tenant-restore",
        },
        body: JSON.stringify({
          ref: "dev",
          inputs: { org_id: organisationId, backup: backupStamp, mode, restore_id: restoreId },
        }),
      });
    } catch (_e) {
      return await failRestore("GitHub dispatch failed (network error)");
    }

    if (gh.status !== 204) {
      const msg = `GitHub dispatch failed (${gh.status})`;
      await supabase.from("tenant_restores").update({ status: "failed", error: msg }).eq("id", restoreId);
      return json(cors, 502, { error: msg });
    }

    // Audit trail
    const { error: auditErr } = await supabase.from("audit_log").insert({
      user_id: admin.userId,
      user_name: admin.email,
      user_role: admin.role,
      action_type: "tenant_restore_requested",
      entity_type: "tenant_restore",
      entity_id: restoreId,
      organisation_id: organisationId,
      detail: `Tenant restore requested (mode=${mode}, stamp=${backupStamp})`,
      metadata: { restore_id: restoreId, mode, backup_stamp: backupStamp },
    });
    if (auditErr) console.error(`${FN}: audit_log insert failed:`, auditErr.message);

    return json(cors, 200, { restore_id: restoreId });
  } catch (e) {
    console.error(`${FN}: unhandled error:`, e instanceof Error ? e.message : e);
    return json(cors, 500, { error: "Internal error" });
  }
});
