import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-org-id",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    const rawEmail = (body as { email?: unknown } | null)?.email;
    if (!rawEmail || typeof rawEmail !== "string" || !rawEmail.includes("@") || rawEmail.length > 320) {
      return json({ error: "A valid email is required" }, 400);
    }
    const email = rawEmail.trim().toLowerCase();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Targeted lookup — avoids scanning the whole user list.
    let user: { banned_until?: string | null } | undefined;
    try {
      const { data, error } = await (supabaseAdmin.auth.admin as unknown as {
        listUsers: (opts: Record<string, unknown>) => Promise<{ data: { users?: any[] } | null; error: unknown }>;
      }).listUsers({ page: 1, perPage: 1, filter: `email eq "${email.replace(/"/g, "")}"` });
      if (!error) {
        user = data?.users?.find((u: any) => u.email?.toLowerCase() === email);
      }
    } catch (_e) {
      user = undefined;
    }

    if (!user) {
      // Fallback: paged scan matching on email only.
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) {
        console.error("[check-lockout-status] listUsers error:", error);
        // Fail open — never block a legitimate sign-in on our own failure.
        return json({ email, locked: false, locked_until: null });
      }
      user = data?.users?.find((u: any) => u.email?.toLowerCase() === email);
    }

    // Unknown email → same shape as an unlocked account (no existence leak).
    const bannedUntil = (user as any)?.banned_until ?? null;
    if (!bannedUntil) {
      return json({ email, locked: false, locked_until: null });
    }

    const until = new Date(bannedUntil);
    const locked = !Number.isNaN(until.getTime()) && until.getTime() > Date.now();

    return json({
      email,
      locked,
      locked_until: locked ? until.toISOString() : null,
    });
  } catch (err) {
    console.error("[check-lockout-status] error:", err);
    // Fail open.
    return json({ locked: false, locked_until: null });
  }
});
