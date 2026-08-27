import { createClient } from "npm:@supabase/supabase-js@2";
import { AUTH_EVENT_HEADER, verifyAuthEventToken } from "../_shared/authEvent.ts";
/**
 * Trusted-caller gate: this function is no longer browser-callable. It accepts
 * only a service-role caller carrying a valid, short-lived auth-event token
 * minted by `track-failed-login` for this same email. Fails closed.
 */
async function requireAuthEvent(
  req: Request,
  purpose: string,
  email: string,
  cors: Record<string, string>,
): Promise<Response | null> {
  const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!serviceKey || token !== serviceKey) {
    console.warn(`lock-failed-login: rejected caller without service-role credentials`);
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const verified = await verifyAuthEventToken(req.headers.get(AUTH_EVENT_HEADER), {
    purpose,
    email,
  });
  if (!verified.ok) {
    console.warn(`lock-failed-login: rejected auth event (${verified.reason})`);
    return new Response(JSON.stringify({ error: "Forbidden", reason: verified.reason }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  return null;
}

import { notifyAdminWhatsApp, notifyAdminsInApp } from "../_shared/notifyAdmin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "null",
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

    const denied = await requireAuthEvent(req, "failed_login_lock", email, corsHeaders);
    if (denied) return denied;

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

    // Send alert email via Resend
    try {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: "noreply@bookedjobs.ie",
            to: "barrymckenna120@gmail.com",
            subject: `⚠️ BookedJobs — Account Locked: ${email}`,
            text: `A BookedJobs account has been locked due to 5 consecutive failed login attempts.\n\nEmail: ${email}\nTime: ${new Date().toISOString()}\n\nThe account has been banned for 24 hours automatically.\n\nLog in to /admin to review or unblock the account.`,
          }),
        });
        console.log(`Alert email sent for locked account: ${email}`);
      } else {
        console.warn("RESEND_API_KEY not set; skipping alert email");
      }
    } catch (emailErr) {
      console.error("Failed to send lock alert email:", emailErr);
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
