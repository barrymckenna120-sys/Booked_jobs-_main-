import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-org-id",
};

const PLATFORM_OWNER_EMAILS = ["barrymckenna120@gmail.com"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace(/^Bearer\s+/i, "");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: { user: caller }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !caller) return json({ error: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Authorise: superadmin profile role OR platform owner email
    let authorized = PLATFORM_OWNER_EMAILS.includes(caller.email?.toLowerCase() ?? "");
    if (!authorized) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("user_id", caller.id)
        .maybeSingle();
      authorized = profile?.role === "superadmin";
    }
    if (!authorized) return json({ error: "Insufficient permissions" }, 403);

    const { action, email: rawEmail } = await req.json();
    if (!rawEmail || typeof rawEmail !== "string") return json({ error: "Email required" }, 400);
    const email = rawEmail.trim().toLowerCase();
    if (!email) return json({ error: "Email required" }, 400);

    // Find auth user by email
    const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) return json({ error: "Failed to list users: " + listErr.message }, 500);
    const authUser = usersData?.users?.find((u) => u.email?.toLowerCase() === email) ?? null;

    // Load engineers by email (across all orgs)
    const { data: engineers } = await supabaseAdmin
      .from("engineers")
      .select("id, name, email, role, status, organisation_id, auth_user_id")
      .ilike("email", email);

    // Load profile (via auth_user_id) — profiles has no email column
    let profile: any = null;
    if (authUser) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("id, user_id, display_name, role, organisation_id")
        .eq("user_id", authUser.id)
        .maybeSingle();
      profile = p;
    }

    // Collect org ids to look up names
    const orgIds = new Set<string>();
    if (profile?.organisation_id) orgIds.add(profile.organisation_id);
    for (const e of engineers ?? []) if (e.organisation_id) orgIds.add(e.organisation_id);

    let orgs: Record<string, string> = {};
    if (orgIds.size > 0) {
      const { data: orgRows } = await supabaseAdmin
        .from("organisations")
        .select("id, name")
        .in("id", Array.from(orgIds));
      for (const o of orgRows ?? []) orgs[o.id] = o.name;
    }

    // login_attempts state
    const { data: loginAttempt } = await supabaseAdmin
      .from("login_attempts")
      .select("id, email, attempts, locked_at, last_attempt_at")
      .eq("email", email)
      .maybeSingle();

    const bannedUntil = (authUser as any)?.banned_until ?? null;
    const isAuthBanned = bannedUntil && new Date(bannedUntil).getTime() > Date.now();
    const isEngineerBlocked = (engineers ?? []).some((e) => e.status === "blocked");
    const isLoginLocked = !!loginAttempt?.locked_at;
    const isBlocked = isAuthBanned || isEngineerBlocked || isLoginLocked;

    if (!authUser && !(engineers?.length) && !profile && !loginAttempt) {
      return json({ found: false });
    }

    const result = {
      found: true,
      email,
      authUser: authUser
        ? {
            id: authUser.id,
            email: authUser.email,
            banned_until: bannedUntil,
            last_sign_in_at: authUser.last_sign_in_at,
          }
        : null,
      profile: profile
        ? { ...profile, organisation_name: orgs[profile.organisation_id] ?? null }
        : null,
      engineers: (engineers ?? []).map((e) => ({
        ...e,
        organisation_name: orgs[e.organisation_id] ?? null,
      })),
      loginAttempt,
      status: {
        isBlocked,
        isAuthBanned,
        isEngineerBlocked,
        isLoginLocked,
      },
    };

    if (action === "search") return json(result);

    if (action !== "unblock") return json({ error: "Unknown action" }, 400);

    const performed: string[] = [];

    // 1. Delete login_attempts row
    if (loginAttempt) {
      const { error: delErr } = await supabaseAdmin
        .from("login_attempts")
        .delete()
        .eq("email", email);
      if (delErr) return json({ error: "Failed to clear login_attempts: " + delErr.message }, 500);
      performed.push("cleared login_attempts");
    }

    // 2. Set engineer status back to active
    if (isEngineerBlocked) {
      const { error: engErr } = await supabaseAdmin
        .from("engineers")
        .update({ status: "active", blocked_reason: null })
        .ilike("email", email)
        .eq("status", "blocked");
      if (engErr) return json({ error: "Failed to unblock engineer: " + engErr.message }, 500);
      performed.push("engineers.status → active");
    }

    // 3. Clear auth ban
    if (authUser && isAuthBanned) {
      const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
        ban_duration: "none",
      });
      if (banErr) return json({ error: "Failed to clear auth ban: " + banErr.message }, 500);
      performed.push("cleared auth ban");
    }

    console.log(`superadmin-unblock-user: ${email} by ${caller.email} — ${performed.join(", ") || "no changes"}`);

    return json({ success: true, performed, email });
  } catch (err) {
    console.error("superadmin-unblock-user error:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
