import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isPlatformOwnerEmail } from "../_shared/platformAdmin.ts";

// CORS: project-standard shared helper (origin-scoped, tenant-agnostic).
// Local copies drifted per function; see _shared/cors.ts.

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
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

    // Optional org_id param — from JSON body (POST) or ?org_id= (GET)
    // Optional scope param — { scope: "all_orgs" } (POST body only, superadmin-only cross-tenant listing)
    // Defensive parse: read raw text once and JSON.parse under an explicit try/catch
    // so a silent body-parse failure can never route to the wrong branch again.
    let orgIdParam: string | null = null;
    let allOrgsScope = false;
    if (req.method === "POST") {
      let raw = "";
      try {
        raw = await req.text();
      } catch (e) {
        console.error("list-users: failed to read request body", e);
      }
      if (raw && raw.trim().length > 0) {
        try {
          const body = JSON.parse(raw);
          if (body && typeof body.org_id === "string") orgIdParam = body.org_id;
          if (body && body.scope === "all_orgs") allOrgsScope = true;
        } catch (e) {
          console.error("list-users: failed to JSON.parse body", e, "raw=", raw.slice(0, 200));
        }
      }
    }
    if (!orgIdParam) {
      try {
        const url = new URL(req.url);
        const q = url.searchParams.get("org_id");
        if (q) orgIdParam = q;
      } catch (_e) {
        // ignore
      }
    }

    if (orgIdParam && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgIdParam)) {
      return new Response(JSON.stringify({ error: "Invalid org_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (allOrgsScope && orgIdParam) {
      return new Response(JSON.stringify({ error: "scope=all_orgs and org_id are mutually exclusive" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Verify caller identity. Use the service-role client (auth.getUser(jwt) on an
    // anon client throws AuthSessionMissingError when the client itself has no
    // stored session in some runtime/auth-js combinations).
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // A non-JWT token (e.g. the publishable/anon key) can never identify a user.
    if (token.split(".").length !== 3) {
      console.error("list-users: non-JWT Authorization token received");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the JWT against the auth REST endpoint directly. auth-js's
    // getUser(jwt) throws AuthSessionMissingError in this runtime because the
    // server-side client has no stored session.
    let authUser: { id: string; email?: string | null } | null = null;
    try {
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
        },
      });
      if (res.ok) authUser = await res.json();
      else {
        console.error(
          "list-users: /auth/v1/user rejected the caller token",
          res.status,
          (await res.text()).slice(0, 200),
        );
      }


    } catch (e) {
      console.error("list-users: auth verification failed", e);
    }

    if (!authUser?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = authUser.id;
    const callerEmail = authUser.email?.toLowerCase() ?? "";





    // Determine caller role once
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", callerId)
      .maybeSingle();
    const callerRole = (callerProfile as any)?.role ?? null;
    const isSuperadmin = callerRole === "superadmin";

    // Platform authority comes from the shared, centrally configured helper —
    // never a hardcoded email in this function. Tenant roles below are
    // unchanged: admin/office and the organisation owner keep their existing
    // access, scoped to their own organisation.
    const platformOwner = isPlatformOwnerEmail(callerEmail);
    let isAuthorized = isSuperadmin || platformOwner;

    // Check caller has admin/office role OR is the organisation owner
    if (!isAuthorized) {
      const { data: legacyRole } = await supabaseAdmin.rpc("get_user_role", { _user_id: callerId });
      isAuthorized = legacyRole === "admin" || legacyRole === "office";
    }

    if (!isAuthorized) {
      const { data: ownedOrg } = await supabaseAdmin
        .from("organisations")
        .select("id")
        .eq("owner_user_id", callerId)
        .maybeSingle();
      isAuthorized = !!ownedOrg;
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List all auth users (needed for email lookup in both branches).
    // supabase-js `auth.admin.listUsers` is paginated (default perPage=50);
    // loop through every page so counts never silently truncate.
    const PER_PAGE = 200;
    const authUsers: any[] = [];
    for (let page = 1; ; page++) {
      const { data: pageData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: PER_PAGE,
      });
      if (listError) {
        console.error("listUsers error:", listError);
        return new Response(JSON.stringify({ error: "Failed to list users" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const batch = pageData?.users ?? [];
      authUsers.push(...batch);
      if (batch.length < PER_PAGE) break;
      if (page > 500) break; // hard safety cap (~100k users)
    }

    const emailByUserId = new Map<string, string | null>();
    const blockedByUserId = new Map<string, boolean>();
    for (const u of authUsers) {
      emailByUserId.set(u.id, u.email ?? null);
      const bu = (u as any).banned_until;
      const isBlocked = !!bu && bu !== "none" && new Date(bu).getTime() > Date.now();
      blockedByUserId.set(u.id, isBlocked);
    }


    // Org-scoped branch — superadmin only
    if (orgIdParam) {
      if (!isSuperadmin) {
        return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [profilesRes, engineersRes] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("user_id, display_name, role")
          .eq("organisation_id", orgIdParam),
        supabaseAdmin
          .from("engineers")
          .select("auth_user_id, name, role, status")
          .eq("organisation_id", orgIdParam),
      ]);

      const engineerBlockedAuthIds = new Set<string>(
        ((engineersRes.data as any[]) || [])
          .filter((e) => e?.auth_user_id && e?.status === "blocked")
          .map((e) => e.auth_user_id as string)
      );
      const isBlockedFor = (userId: string): boolean =>
        (blockedByUserId.get(userId) ?? false) || engineerBlockedAuthIds.has(userId);

      if (profilesRes.error && engineersRes.error) {
        console.error("org list error:", profilesRes.error, engineersRes.error);
        return new Response(JSON.stringify({ error: "Failed to load org users" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const map = new Map<string, { userId: string; email: string | null; name: string; role: string; blocked: boolean }>();
      for (const p of (profilesRes.data as any[]) || []) {
        if (!p?.user_id) continue;
        map.set(p.user_id, {
          userId: p.user_id,
          email: emailByUserId.get(p.user_id) ?? null,
          name: p.display_name || "—",
          role: p.role || "—",
          blocked: isBlockedFor(p.user_id),
        });
      }
      for (const e of (engineersRes.data as any[]) || []) {
        if (!e?.auth_user_id) continue;
        const existing = map.get(e.auth_user_id);
        if (existing) {
          if (!existing.name || existing.name === "—") existing.name = e.name || existing.name;
          if (existing.role === "—") existing.role = e.role || existing.role;
          if (e.status === "blocked") existing.blocked = true;
        } else {
          map.set(e.auth_user_id, {
            userId: e.auth_user_id,
            email: emailByUserId.get(e.auth_user_id) ?? null,
            name: e.name || "—",
            role: e.role || "engineer",
            blocked: isBlockedFor(e.auth_user_id),
          });
        }
      }

      const orgUsers = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));


      return new Response(JSON.stringify({ users: orgUsers }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cross-tenant Overview branch — superadmin only.
    // `isSuperadmin` was derived from the caller's verified JWT
    // (getUser(token) → profiles.role lookup); it never trusts the request body.
    if (allOrgsScope) {
      if (!isSuperadmin) {
        return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [profilesRes, engineersRes, orgsRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("user_id, display_name, role, organisation_id"),
        supabaseAdmin.from("engineers").select("auth_user_id, name, role, organisation_id"),
        supabaseAdmin.from("organisations").select("id, name"),
      ]);

      if (profilesRes.error || engineersRes.error || orgsRes.error) {
        console.error("all_orgs list error:", profilesRes.error, engineersRes.error, orgsRes.error);
        return new Response(JSON.stringify({ error: "Failed to load users" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const orgNameById = new Map<string, string>();
      for (const o of (orgsRes.data as any[]) || []) {
        if (o?.id) orgNameById.set(o.id, o.name ?? null);
      }

      type Row = {
        user_id: string;
        email: string | null;
        name: string;
        role: string;
        organisation_id: string | null;
        organisation_name: string | null;
        last_sign_in_at: string | null;
        created_at: string;
      };

      const byUser = new Map<string, Row>();
      for (const u of authUsers) {
        byUser.set(u.id, {
          user_id: u.id,
          email: u.email ?? null,
          name: "—",
          role: "—",
          organisation_id: null,
          organisation_name: null,
          last_sign_in_at: u.last_sign_in_at ?? null,
          created_at: u.created_at,
        });
      }

      for (const p of (profilesRes.data as any[]) || []) {
        if (!p?.user_id) continue;
        const row = byUser.get(p.user_id);
        if (!row) continue;
        if (p.display_name) row.name = p.display_name;
        if (p.role) row.role = p.role;
        if (p.organisation_id) {
          row.organisation_id = p.organisation_id;
          row.organisation_name = orgNameById.get(p.organisation_id) ?? null;
        }
      }

      for (const e of (engineersRes.data as any[]) || []) {
        if (!e?.auth_user_id) continue;
        const row = byUser.get(e.auth_user_id);
        if (!row) continue;
        if ((!row.name || row.name === "—") && e.name) row.name = e.name;
        if ((!row.role || row.role === "—") && e.role) row.role = e.role;
        if (!row.organisation_id && e.organisation_id) {
          row.organisation_id = e.organisation_id;
          row.organisation_name = orgNameById.get(e.organisation_id) ?? null;
        }
      }

      return new Response(JSON.stringify({ users: Array.from(byUser.values()) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }



    // Default behaviour — list all auth users. Merge in engineers.status='blocked'
    // so blocked engineers show as blocked even when auth ban is unset.
    const { data: blockedEngRows } = await supabaseAdmin
      .from("engineers")
      .select("auth_user_id")
      .eq("status", "blocked");
    const engineerBlockedIds = new Set<string>(
      ((blockedEngRows as any[]) || [])
        .filter((r) => !!r?.auth_user_id)
        .map((r) => r.auth_user_id as string)
    );

    const users = authUsers.map((u) => ({
      id: u.id,
      email: u.email,
      banned_until: u.banned_until ?? null,
      blocked: (blockedByUserId.get(u.id) ?? false) || engineerBlockedIds.has(u.id),
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
    }));


    return new Response(JSON.stringify({ users }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("list-users error:", err);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
