import { createClient } from "npm:@supabase/supabase-js@2";
import { isPlatformAdminDenied, requirePlatformAdmin } from "../_shared/platformAdmin.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Centralised platform-admin authorization (no per-function email lists).
    const admin = await requirePlatformAdmin(req, {
      fnName: "admin-set-password",
      cors: corsHeaders,
    });
    if (isPlatformAdminDenied(admin)) return admin.error;


    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const userId = (body as { userId?: unknown }).userId;
    const newPassword = (body as { newPassword?: unknown }).newPassword;

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof userId !== "string" || !UUID_RE.test(userId)) {
      return new Response(JSON.stringify({ error: "userId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return new Response(JSON.stringify({ error: "newPassword required (min 8 chars)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Target must exist. Role/org are never taken from the request body, so no
    // caller-controlled escalation is possible here.
    const { data: target, error: targetErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (targetErr || !target?.user?.id) {
      return new Response(JSON.stringify({ error: "Target user not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (updateError) {
      console.error("admin-set-password: updateUserById failed:", updateError.message);
      return new Response(JSON.stringify({ error: "Failed to set password" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit trail: acting admin + target id only. Never the password.
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("organisation_id")
      .eq("user_id", userId)
      .maybeSingle();
    console.log(
      `admin-set-password: password reset by ${admin.userId} (via ${admin.via}) for target ${userId} in org ${
        (targetProfile as { organisation_id?: string | null } | null)?.organisation_id ?? "unknown"
      }`,
    );

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-set-password error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

});
