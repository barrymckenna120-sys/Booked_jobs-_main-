import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-org-id",
};

// Very long ban duration = de-facto sign-in block. Reversible via unblock-user.
const DEACTIVATE_BAN_DURATION = "876000h"; // ~100 years

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const { data: { user: caller }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Authorisation: mirror unblock-user exactly.
    const callerEmail = caller.email?.toLowerCase() ?? "";
    const PLATFORM_OWNER_EMAILS = ["barrymckenna120@gmail.com"];
    let isAuthorized = PLATFORM_OWNER_EMAILS.includes(callerEmail);

    if (!isAuthorized) {
      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("user_id", caller.id)
        .maybeSingle();
      if ((callerProfile as any)?.role === "superadmin") isAuthorized = true;
    }

    if (!isAuthorized) {
      const { data: callerRole } = await supabaseAdmin.rpc("get_user_role", { _user_id: caller.id });
      isAuthorized = ["admin", "office", "owner", "manager"].includes(callerRole ?? "");
    }

    if (!isAuthorized) {
      const { data: ownedOrg } = await supabaseAdmin
        .from("organisations")
        .select("id")
        .eq("owner_user_id", caller.id)
        .maybeSingle();
      isAuthorized = !!ownedOrg;
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // 1. Mark engineer deactivated
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
      return new Response(JSON.stringify({ error: "Failed to deactivate engineer" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. If linked to an auth user, mark profile inactive + ban auth login.
    if (engineer.auth_user_id) {
      await supabaseAdmin
        .from("profiles")
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString(),
          deactivated_by: caller.id,
        } as any)
        .eq("user_id", engineer.auth_user_id);

      const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(
        engineer.auth_user_id,
        { ban_duration: DEACTIVATE_BAN_DURATION },
      );
      if (banErr) {
        console.error("[deactivate-user] auth ban error:", banErr);
        // Non-fatal — status change is enough to hide them from listings.
      }
    }

    return new Response(
      JSON.stringify({ success: true, name: engineer.name }),
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
