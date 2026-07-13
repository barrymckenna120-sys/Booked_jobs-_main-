import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-org-id",
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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!targetUser) {
      // Don't reveal whether email exists
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Superadmin exemption: locking out the platform-wide superadmin is a
    // bigger operational risk than a brute-force attempt against them.
    // Regular office/engineer/customer accounts remain protected.
    const { data: profileRow } = await supabaseAdmin
      .from("profiles")
      .select("role")
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
      { ban_duration: "1h" }
    );

    if (banError) {
      console.error("ban error:", banError);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`User ${targetUser.id} (${email}) banned for 1h due to failed login attempts`);

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
