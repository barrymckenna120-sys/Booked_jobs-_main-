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

    const body = await req.json();
    const { action, email: rawEmail } = body;

    // ---- list_blocked: return all currently blocked/locked accounts across tenants ----
    if (action === "list_blocked") {
      const supabaseAdmin2 = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const [usersRes, engRes, laRes] = await Promise.all([
        supabaseAdmin2.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        supabaseAdmin2
          .from("engineers")
          .select("id, name, email, role, status, organisation_id, auth_user_id, updated_at")
          .eq("status", "blocked"),
        supabaseAdmin2
          .from("login_attempts")
          .select("id, email, attempts, locked_at, last_attempt_at")
          .not("locked_at", "is", null),
      ]);

      const nowMs = Date.now();
      const bannedUsers = (usersRes.data?.users ?? []).filter((u: any) => {
        const bu = u.banned_until;
        return bu && new Date(bu).getTime() > nowMs;
      });

      // Aggregate by lowercased email
      type Row = {
        email: string;
        organisation_id: string | null;
        organisation_name: string | null;
        role: string | null;
        name: string | null;
        reasons: string[];
        blocked_at: string | null;
      };
      const byEmail = new Map<string, Row>();
      const ensure = (email: string) => {
        const k = email.toLowerCase();
        let r = byEmail.get(k);
        if (!r) {
          r = {
            email: k,
            organisation_id: null,
            organisation_name: null,
            role: null,
            name: null,
            reasons: [],
            blocked_at: null,
          };
          byEmail.set(k, r);
        }
        return r;
      };
      const bumpBlockedAt = (r: Row, ts: string | null | undefined) => {
        if (!ts) return;
        if (!r.blocked_at || new Date(ts).getTime() > new Date(r.blocked_at).getTime()) {
          r.blocked_at = ts;
        }
      };

      for (const e of engRes.data ?? []) {
        if (!e.email) continue;
        const r = ensure(e.email);
        r.organisation_id = e.organisation_id ?? r.organisation_id;
        r.role = e.role ?? r.role;
        r.name = e.name ?? r.name;
        r.reasons.push("Manually blocked");
        bumpBlockedAt(r, (e as any).updated_at);
      }

      for (const la of laRes.data ?? []) {
        if (!la.email) continue;
        const r = ensure(la.email);
        r.reasons.push("Failed login lockout");
        bumpBlockedAt(r, la.locked_at);
      }

      for (const u of bannedUsers) {
        if (!u.email) continue;
        const r = ensure(u.email);
        r.reasons.push("Auth banned");
        bumpBlockedAt(r, (u as any).banned_until);
      }

      // Enrich with profile/org for rows only known via login_attempts / auth ban
      const emails = Array.from(byEmail.keys());
      if (emails.length > 0) {
        // Match auth users by email → profile → org
        const authByEmail = new Map<string, any>();
        for (const u of usersRes.data?.users ?? []) {
          if (u.email) authByEmail.set(u.email.toLowerCase(), u);
        }
        const userIds = emails
          .map((e) => authByEmail.get(e)?.id)
          .filter(Boolean) as string[];
        let profiles: any[] = [];
        if (userIds.length) {
          const { data } = await supabaseAdmin2
            .from("profiles")
            .select("user_id, display_name, role, organisation_id")
            .in("user_id", userIds);
          profiles = data ?? [];
        }
        const profileByUserId = new Map(profiles.map((p) => [p.user_id, p]));

        for (const [email, r] of byEmail.entries()) {
          const au = authByEmail.get(email);
          if (au) {
            const p = profileByUserId.get(au.id);
            if (p) {
              r.organisation_id = r.organisation_id ?? p.organisation_id;
              r.role = r.role ?? p.role;
              r.name = r.name ?? p.display_name;
            }
          }
        }

        // Resolve org names
        const orgIds = Array.from(
          new Set(
            Array.from(byEmail.values())
              .map((r) => r.organisation_id)
              .filter(Boolean) as string[],
          ),
        );
        if (orgIds.length) {
          const { data: orgs } = await supabaseAdmin2
            .from("organisations")
            .select("id, name")
            .in("id", orgIds);
          const orgMap = new Map((orgs ?? []).map((o) => [o.id, o.name]));
          for (const r of byEmail.values()) {
            if (r.organisation_id) r.organisation_name = orgMap.get(r.organisation_id) ?? null;
          }
        }
      }

      const rows = Array.from(byEmail.values()).sort((a, b) => {
        const at = a.blocked_at ? new Date(a.blocked_at).getTime() : 0;
        const bt = b.blocked_at ? new Date(b.blocked_at).getTime() : 0;
        return bt - at;
      });

      return json({ rows, count: rows.length });
    }

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
