import { createClient } from "npm:@supabase/supabase-js@2";
import { notifyAdminWhatsApp, notifyAdminsInApp } from "../_shared/notifyAdmin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up user by email
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.error("listUsers error:", listError);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetUser = usersData?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );

    if (!targetUser) {
      // Don't reveal whether email exists
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch profile (role + org) once — used for superadmin exemption AND
    // for the admin alert metadata.
    const { data: profileRow } = await supabaseAdmin
      .from("profiles")
      .select("role, organisation_id, display_name")
      .eq("user_id", targetUser.id)
      .maybeSingle();

    if ((profileRow as any)?.role === "superadmin") {
      console.log(`Skipping auto-ban for superadmin ${email} (${targetUser.id})`);
      return new Response(JSON.stringify({ success: true, skipped: "superadmin" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ban for 1 hour (auto-unlock). UI copy in src/lib/authLockout.ts must match.
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUser.id,
      { ban_duration: "1h" },
    );

    if (banError) {
      console.error("ban error:", banError);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`User ${targetUser.id} (${email}) banned for 1h due to failed login attempts`);

    // ---- Admin alert: in-app notification + WhatsApp ----
    let orgName: string | null = null;
    const orgId = (profileRow as any)?.organisation_id ?? null;
    if (orgId) {
      const { data: orgRow } = await supabaseAdmin
        .from("organisations")
        .select("name")
        .eq("id", orgId)
        .maybeSingle();
      orgName = (orgRow as any)?.name ?? null;
    }

    const displayName = (profileRow as any)?.display_name ?? null;
    const tenantLabel = orgName ?? "Unknown tenant";
    const lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const title = `🔒 User Locked Out — ${email}`;
    const body = `${email} (${tenantLabel}) locked for 1h after 5 failed login attempts.`;

    // In-app to every superadmin (best-effort; never fail the request on this)
    try {
      const res = await notifyAdminsInApp(supabaseAdmin, {
        notification_type: "user_locked_out",
        title,
        body,
        metadata: {
          locked_user_id: targetUser.id,
          locked_user_email: email,
          locked_user_name: displayName,
          organisation_id: orgId,
          organisation_name: orgName,
          locked_until: lockedUntil,
          reason: "5_failed_attempts",
        },
      });
      console.log(`[lock-failed-login] admin notifications inserted: ${res.inserted}`);
    } catch (e) {
      console.error("[lock-failed-login] notifyAdminsInApp threw:", e);
    }

    // WhatsApp to platform admin number (best-effort)
    try {
      const waRes = await notifyAdminWhatsApp(
        `🔒 BookedJobs security alert\n\n${email} (${tenantLabel}) was locked out after 5 failed login attempts. Auto-unlock in 1 hour.`,
      );
      console.log(
        `[lock-failed-login] admin WhatsApp: ok=${waRes.ok} status=${waRes.status} skipped=${waRes.skipped ?? "-"}`,
      );
    } catch (e) {
      console.error("[lock-failed-login] notifyAdminWhatsApp threw:", e);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("lock-failed-login error:", err);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
