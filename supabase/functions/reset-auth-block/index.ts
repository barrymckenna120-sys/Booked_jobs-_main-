import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// CORS: project-standard shared helper (origin-scoped, tenant-agnostic).
// Local copies drifted per function; see _shared/cors.ts.

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerRole } = await supabaseUser.rpc("get_user_role", { _user_id: caller.id });
    if (callerRole !== "admin" && callerRole !== "superadmin") {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find user by email
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.error("listUsers error:", listError);
      return new Response(JSON.stringify({ error: "Failed to list users" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetUser = usersData?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!targetUser) {
      return new Response(JSON.stringify({ error: "No user found with that email" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cross-tenant guard: superadmins may act platform-wide, everyone else is
    // restricted to users inside their own organisation.
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role, organisation_id")
      .eq("user_id", caller.id)
      .maybeSingle();

    const isSuperadmin =
      callerRole === "superadmin" || (callerProfile as any)?.role === "superadmin";

    if (!isSuperadmin) {
      let callerOrgId: string | null = (callerProfile as any)?.organisation_id ?? null;
      if (!callerOrgId) {
        const { data: callerEng } = await supabaseAdmin
          .from("engineers")
          .select("organisation_id")
          .eq("auth_user_id", caller.id)
          .maybeSingle();
        callerOrgId = (callerEng as any)?.organisation_id ?? null;
      }

      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("organisation_id")
        .eq("user_id", targetUser.id)
        .maybeSingle();
      let targetOrgId: string | null = (targetProfile as any)?.organisation_id ?? null;
      if (!targetOrgId) {
        const { data: targetEng } = await supabaseAdmin
          .from("engineers")
          .select("organisation_id")
          .eq("auth_user_id", targetUser.id)
          .maybeSingle();
        targetOrgId = (targetEng as any)?.organisation_id ?? null;
      }

      if (!callerOrgId || !targetOrgId || callerOrgId !== targetOrgId) {
        return new Response(
          JSON.stringify({ error: "Cross-tenant action not permitted" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }


    // Clear ban and confirm email — treat "already clear" as success.
    let clearedAuthBan = true;
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
      ban_duration: "none",
      email_confirm: true,
    });

    if (updateError) {
      const msg = (updateError.message || "").toLowerCase();
      const benign = msg.includes("not banned") || msg.includes("no ban") || msg.includes("nothing to update");
      if (!benign) {
        console.error("update error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to clear auth block: " + updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.warn(`Auth ban already clear for ${email}:`, updateError.message);
      clearedAuthBan = false;
    }

    console.log(`Auth block cleared for ${email} (${targetUser.id})`);

    // Reset any matching engineers row. Zero matches is NOT an error — the
    // user may not have an engineers profile in this org.
    const { data: engUpdated, error: engErr } = await supabaseAdmin
      .from("engineers")
      .update({
        status: "active",
        blocked_reason: null,
        is_available: true,
      })
      .eq("auth_user_id", targetUser.id)
      .select("id");

    if (engErr) {
      console.error("engineers status reset error:", engErr);
      return new Response(JSON.stringify({ error: "Auth block cleared but failed to reset engineer status: " + engErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clearedEngineerRow = Array.isArray(engUpdated) && engUpdated.length > 0;

    return new Response(JSON.stringify({
      success: true,
      userId: targetUser.id,
      clearedAuthBan,
      clearedEngineerRow,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("reset-auth-block error:", err);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
