import { createClient } from "npm:@supabase/supabase-js@2";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");

    // Verify caller identity using getUser with explicit token
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

    // Use service role for privileged checks and auth admin actions
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const callerEmail = caller.email?.toLowerCase() ?? "";
    const PLATFORM_OWNER_EMAILS = ["barrymckenna120@gmail.com"];
    let isAuthorized = PLATFORM_OWNER_EMAILS.includes(callerEmail);
    let bypassOrgCheck = PLATFORM_OWNER_EMAILS.includes(callerEmail);
    let callerOrgId: string | null = null;

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role, organisation_id")
      .eq("user_id", caller.id)
      .maybeSingle();
    if ((callerProfile as any)?.role === "superadmin") {
      isAuthorized = true;
      bypassOrgCheck = true;
    }
    callerOrgId = (callerProfile as any)?.organisation_id ?? null;

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

    const { userId, engineerId } = await req.json();
    if (!userId && !engineerId) {
      return new Response(JSON.stringify({ error: "userId or engineerId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve target's organisation_id for cross-tenant guard.
    let targetOrgId: string | null = null;
    if (engineerId) {
      const { data: engRow } = await supabaseAdmin
        .from("engineers")
        .select("organisation_id")
        .eq("id", engineerId)
        .maybeSingle();
      targetOrgId = (engRow as any)?.organisation_id ?? null;
    } else if (userId) {
      const { data: profRow } = await supabaseAdmin
        .from("profiles")
        .select("organisation_id")
        .eq("user_id", userId)
        .maybeSingle();
      targetOrgId = (profRow as any)?.organisation_id ?? null;
    }

    if (!bypassOrgCheck && (!callerOrgId || !targetOrgId || callerOrgId !== targetOrgId)) {
      return new Response(
        JSON.stringify({ error: "Cross-tenant action not permitted" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Clear auth-side ban if a userId was provided
    if (userId) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      });

      if (updateError) {
        console.error("unblock error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to unblock user" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Reactivate the profile row so soft-deleted users are restored.
      await supabaseAdmin
        .from("profiles")
        .update({
          is_active: true,
          deactivated_at: null,
          deactivated_by: null,
        } as any)
        .eq("user_id", userId);
    }

    // Also clear engineers.status server-side (RLS restricts client-side status
    // writes to admin/owner; service role bypasses so office/manager unblock works).
    if (engineerId) {
      const { error: engErr } = await supabaseAdmin
        .from("engineers")
        .update({ status: "active", blocked_reason: null, is_available: true })
        .eq("id", engineerId);
      if (engErr) {
        console.error("engineers status reset error:", engErr);
        return new Response(JSON.stringify({ error: "Failed to reset engineer status" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("unblock-user error:", err);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
