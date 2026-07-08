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
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, content-type, apikey, x-client-info, x-org-id, x-org-impersonation-token",
    "Access-Control-Allow-Credentials": "true",
  };
}

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
