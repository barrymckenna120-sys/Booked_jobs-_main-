import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://kngasservices.bookedjobs.ie",
  "https://dublin-gas.bookedjobs.ie",
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const hostname = new URL(origin).hostname;
    return hostname.endsWith(".lovableproject.com") || hostname.endsWith(".lovable.app");
  } catch {
    return false;
  }
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin");
  const allowOrigin = isAllowedOrigin(origin) ? origin! : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Credentials": "true",
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user: caller }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !caller) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Same role resolution order as reset-auth-block: engineers row, then profiles.
    const { data: callerRole } = await supabaseUser.rpc("get_user_role", {
      _user_id: caller.id,
    });
    if (callerRole !== "admin" && callerRole !== "superadmin") {
      return json({ error: "Insufficient permissions" }, 403);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role, organisation_id, display_name")
      .eq("user_id", caller.id)
      .maybeSingle();

    const { data: callerEng } = await supabaseAdmin
      .from("engineers")
      .select("organisation_id, name")
      .eq("auth_user_id", caller.id)
      .maybeSingle();

    const isSuperadmin =
      callerRole === "superadmin" || (callerProfile as any)?.role === "superadmin";

    const callerOrgId: string | null =
      (callerEng as any)?.organisation_id ??
      (callerProfile as any)?.organisation_id ??
      null;

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) ?? {};
    } catch (_e) {
      body = {};
    }

    // Non-superadmins can never target another organisation: the client-supplied
    // value is ignored entirely.
    let targetOrgId: string | null;
    if (isSuperadmin) {
      const requested = typeof body.organisation_id === "string" ? body.organisation_id : null;
      targetOrgId = requested ?? callerOrgId;
    } else {
      targetOrgId = callerOrgId;
    }

    if (!targetOrgId || !UUID_RE.test(targetOrgId)) {
      return json({ error: "Could not resolve a target organisation" }, 400);
    }

    // HARD GATE — before any counting or deletion.
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("organisations")
      .select("id, name, slug, is_test")
      .eq("id", targetOrgId)
      .maybeSingle();

    if (orgErr) {
      console.error("organisation lookup failed:", orgErr);
      return json({ error: "Failed to load organisation" }, 500);
    }
    if (!org) {
      return json({ error: "Organisation not found" }, 404);
    }
    if ((org as any).is_test !== true) {
      return json({ error: "Reset is only available for test organisations." }, 403);
    }

    const actorName =
      (callerEng as any)?.name ?? (callerProfile as any)?.display_name ?? caller.email ?? "unknown";

    // Pre-delete counts.
    const { data: beforeCounts, error: beforeErr } = await supabaseAdmin.rpc("count_org_data", {
      _org_id: targetOrgId,
    });
    if (beforeErr) {
      console.error("count_org_data (before) failed:", beforeErr);
      return json({ error: "Failed to count existing data" }, 500);
    }

    const startedAt = new Date().toISOString();

    const { data: startAudit, error: startAuditErr } = await supabaseAdmin
      .from("audit_log")
      .insert({
        organisation_id: targetOrgId,
        user_id: caller.id,
        user_name: actorName,
        user_role: callerRole,
        action_type: "org_data_reset",
        entity_type: "organisation",
        entity_id: targetOrgId,
        detail: `Test data reset started for ${(org as any).name}`,
        metadata: {
          phase: "before",
          started_at: startedAt,
          actor_id: caller.id,
          target_organisation_id: targetOrgId,
          counts: beforeCounts,
        },
      })
      .select("id")
      .maybeSingle();

    if (startAuditErr) {
      console.error("failed to write pre-reset audit row:", startAuditErr);
      return json({ error: "Failed to record audit entry; reset aborted" }, 500);
    }

    // Single transaction: one function call = one transaction. Any failure
    // rolls the whole thing back.
    const { data: result, error: resetErr } = await supabaseAdmin.rpc("reset_org_data", {
      _org_id: targetOrgId,
    });

    if (resetErr) {
      const msg = resetErr.message || "";
      if (msg.includes("NOT_TEST_ORG")) {
        return json({ error: "Reset is only available for test organisations." }, 403);
      }
      if (msg.includes("ORG_NOT_FOUND")) {
        return json({ error: "Organisation not found" }, 404);
      }
      console.error("reset_org_data failed:", resetErr);
      return json({ error: `Reset failed and was rolled back: ${msg}` }, 500);
    }

    const counts = ((result as any)?.counts ?? {}) as Record<string, number>;
    const media = ((result as any)?.media ?? []) as Array<{
      bucket: string | null;
      path: string | null;
      public_url: string | null;
    }>;

    // Storage cleanup runs after the transaction commits. Failures here are
    // reported, never fatal.
    const unresolved: Array<{ path: string | null; bucket: string | null; reason: string }> = [];
    const byBucket = new Map<string, string[]>();

    for (const item of media) {
      const bucket = item.bucket ?? "";
      const path = item.path ?? "";
      if (!path) {
        unresolved.push({ path, bucket, reason: "no storage path recorded" });
        continue;
      }
      if (bucket === "cloudinary" || (item.public_url ?? "").includes("res.cloudinary.com")) {
        // Only an unsigned upload preset is configured for Cloudinary; there is
        // no admin API credential available to delete assets.
        unresolved.push({
          path,
          bucket,
          reason: "cloudinary asset — no admin credentials configured for deletion",
        });
        continue;
      }
      const list = byBucket.get(bucket || "job-media") ?? [];
      list.push(path);
      byBucket.set(bucket || "job-media", list);
    }

    let storageDeleted = 0;
    for (const [bucket, paths] of byBucket) {
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        const { data: removed, error: rmErr } = await supabaseAdmin.storage
          .from(bucket)
          .remove(chunk);
        if (rmErr) {
          for (const p of chunk) {
            unresolved.push({ path: p, bucket, reason: rmErr.message });
          }
          continue;
        }
        storageDeleted += removed?.length ?? 0;
        const removedSet = new Set((removed ?? []).map((r: any) => r.name));
        for (const p of chunk) {
          if (!removedSet.has(p)) {
            unresolved.push({ path: p, bucket, reason: "file not found in storage" });
          }
        }
      }
    }

    const { data: afterCounts, error: afterErr } = await supabaseAdmin.rpc("count_org_data", {
      _org_id: targetOrgId,
    });
    if (afterErr) {
      console.error("count_org_data (after) failed:", afterErr);
    }

    await supabaseAdmin.from("audit_log").insert({
      organisation_id: targetOrgId,
      user_id: caller.id,
      user_name: actorName,
      user_role: callerRole,
      action_type: "org_data_reset",
      entity_type: "organisation",
      entity_id: targetOrgId,
      detail: `Test data reset completed for ${(org as any).name}`,
      metadata: {
        phase: "after",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        related_audit_id: (startAudit as any)?.id ?? null,
        deleted: counts,
        counts: afterCounts ?? null,
        storage_deleted: storageDeleted,
        unresolved,
      },
    });

    const totalDeleted = Object.values(counts).reduce(
      (sum, v) => sum + (Number(v) || 0),
      0,
    );

    return json({
      success: true,
      organisation: { id: (org as any).id, name: (org as any).name, slug: (org as any).slug },
      deleted: counts,
      total_deleted: totalDeleted,
      remaining: afterCounts ?? null,
      storage_deleted: storageDeleted,
      unresolved,
    });
  } catch (err) {
    console.error("reset-org-data error:", err);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});
