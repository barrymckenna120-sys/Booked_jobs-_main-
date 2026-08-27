import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildAdminEmailHtml,
  resolveOrgAdminEmails,
  sendAdminEmail,
} from "../_shared/notifyOrgAdmins.ts";
import { crossTenantDenied, isAdminDenied, requireAdminCaller } from "../_shared/adminAuth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

// Very long ban duration = de-facto sign-in block. Reversible via unblock-user.
const DEACTIVATE_BAN_DURATION = "876000h"; // ~100 years

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authorisation: verified JWT -> trusted role loaded server-side.
    // Tenant admins keep own-organisation authority; only platform admins
    // (superadmin role, or the single centrally configured owner override)
    // may act across tenants. No email allowlist lives in this function.
    const caller = await requireAdminCaller(req, {
      fnName: "deactivate-user",
      cors: corsHeaders,
    });
    if (isAdminDenied(caller)) return caller.error;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );


    const body = await req.json().catch(() => ({}));
    const engineerId: string | undefined = body?.engineerId;
    if (!engineerId) {
      return new Response(JSON.stringify({ error: "engineerId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load engineer
    const { data: engineer, error: engErr } = await supabaseAdmin
      .from("engineers")
      .select("id, name, auth_user_id, organisation_id")
      .eq("id", engineerId)
      .maybeSingle();

    if (engErr || !engineer) {
      return new Response(JSON.stringify({ error: "Engineer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cross-tenant guard: target org derived from the engineer row server-side.
    // Fails closed on null on either side; platform admins may cross tenants.
    const targetOrgId = (engineer as any).organisation_id ?? null;
    const blocked = crossTenantDenied(caller, targetOrgId, corsHeaders, "deactivate-user");
    if (blocked) return blocked;


    // Guard: active jobs assigned. Uses TitleCase to match service_calls.status.
    const { data: activeJobs, error: activeJobsError } = await supabaseAdmin
      .from("service_calls")
      .select("id")
      .eq("assigned_engineer_id", engineerId)
      .not("status", "in", "(Completed,Cancelled)");

    if (activeJobsError) {
      console.error("[deactivate-user] active jobs check error:", activeJobsError);
      return new Response(JSON.stringify({ error: "Failed to check active jobs" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (activeJobs && activeJobs.length > 0) {
      return new Response(
        JSON.stringify({ error: "active_jobs", count: activeJobs.length }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Write sequence: ban first (if there's an auth user), then engineers, then profiles.
    // Any failure after a successful ban triggers a rollback of the ban.
    let banIssued = false;

    const reverseBan = async (reason: string) => {
      if (!banIssued || !engineer.auth_user_id) return;
      const { error: rbErr } = await supabaseAdmin.auth.admin.updateUserById(
        engineer.auth_user_id,
        { ban_duration: "none" },
      );
      if (rbErr) {
        console.error(`[deactivate-user] ROLLBACK FAILED after ${reason}:`, rbErr);
      }
    };

    // 1. Ban auth login FIRST (if linked to an auth user).
    if (engineer.auth_user_id) {
      const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(
        engineer.auth_user_id,
        { ban_duration: DEACTIVATE_BAN_DURATION },
      );
      if (banErr) {
        console.error("[deactivate-user] BAN FAILED:", banErr);
        return new Response(JSON.stringify({ error: "Failed to ban auth user" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      banIssued = true;
    }

    // 2. Mark engineer deactivated.
    const { error: updEngErr } = await supabaseAdmin
      .from("engineers")
      .update({
        status: "deactivated",
        is_available: false,
        blocked_reason: "Deactivated",
      } as any)
      .eq("id", engineerId);

    if (updEngErr) {
      console.error("[deactivate-user] engineers update error:", updEngErr);
      await reverseBan("engineers update error");
      return new Response(JSON.stringify({ error: "Failed to deactivate engineer" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Mark profile inactive (only if linked to an auth user).
    if (engineer.auth_user_id) {
      const { error: updProfErr } = await supabaseAdmin
        .from("profiles")
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString(),
          deactivated_by: caller.userId,
        } as any)
        .eq("user_id", engineer.auth_user_id);

      if (updProfErr) {
        console.error("[deactivate-user] profiles update error:", updProfErr);
        await reverseBan("profiles update error");
        return new Response(JSON.stringify({ error: "Failed to deactivate profile" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Deactivation is fully committed at this point (ban + engineer + profile).
    // The alert email is best-effort: a failure here must never turn a completed
    // deactivation into an error response or trigger the ban rollback.
    let emailResult: unknown = null;
    try {
      const { data: org } = await supabaseAdmin
        .from("organisations")
        .select("name")
        .eq("id", targetOrgId)
        .maybeSingle();

      const html = buildAdminEmailHtml({
        title: "User deactivated",
        heading: "A user has been deactivated",
        intro:
          "This account can no longer sign in to BookedJobs. The change is reversible from the Team screen.",
        rows: [
          ["User deactivated", engineer.name ?? "—"],
          ["Organisation", (org as any)?.name ?? "Unknown organisation"],
          ["Deactivated by", caller.email ?? caller.userId],
          [
            "When",
            new Date().toLocaleString("en-IE", { timeZone: "Europe/Dublin" }),
          ],
        ],
      });

      const recipients = await resolveOrgAdminEmails(supabaseAdmin, targetOrgId);
      emailResult = await sendAdminEmail({
        subject: `User deactivated — ${engineer.name ?? "unnamed user"}`,
        html,
        recipients,
      });
    } catch (_e) {
      const msg = _e instanceof Error ? _e.message : String(_e);
      console.error("[deactivate-user] alert email failed (deactivation stands):", msg);
    }

    return new Response(
      JSON.stringify({ success: true, name: engineer.name, email_alert: emailResult }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("deactivate-user error:", err);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
