import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-org-id",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const callerEmail = caller.email?.toLowerCase() ?? "";
    const PLATFORM_OWNER_EMAILS = ["barrymckenna120@gmail.com"];
    let isAuthorized = PLATFORM_OWNER_EMAILS.includes(callerEmail);

    if (!isAuthorized) {
      const { data: callerRole } = await supabaseAdmin.rpc("get_user_role", { _user_id: caller.id });
      isAuthorized = ["admin", "office", "owner", "manager", "superadmin"].includes(callerRole ?? "");
    }

    if (!isAuthorized) {
      const { data: ownedOrg } = await supabaseAdmin
        .from("organisations")
        .select("id")
        .eq("owner_user_id", caller.id)
        .maybeSingle();
      isAuthorized = !!ownedOrg;
    }

    if (!isAuthorized) return json({ error: "Insufficient permissions" }, 403);

    const body = await req.json().catch(() => ({}));

    // ── list_locked mode: return which of the supplied emails are currently locked
    if (Array.isArray(body?.emails)) {
      const emails = (body.emails as string[])
        .filter((e) => typeof e === "string" && e.trim().length > 0)
        .map((e) => e.trim().toLowerCase());
      if (emails.length === 0) return json({ locked_emails: [] });

      const { data, error } = await supabaseAdmin
        .from("login_attempts")
        .select("email, locked_at, attempts, last_attempt_at")
        .in("email", emails)
        .not("locked_at", "is", null);
      if (error) {
        console.error("[unblock-user] list_locked error:", error);
        return json({ error: "Failed to list lockouts" }, 500);
      }
      return json({
        locked_emails: (data ?? []).map((r) => (r.email as string).toLowerCase()),
        rows: data ?? [],
      });
    }

    // ── unblock mode
    const { userId, email } = body as { userId?: string; email?: string };
    if (!userId && !email) return json({ error: "userId or email is required" }, 400);

    const performed: string[] = [];

    if (userId) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      });
      if (updateError) {
        console.error("[unblock-user] auth ban clear error:", updateError);
        return json({ error: "Failed to unblock user" }, 500);
      }
      performed.push("cleared auth ban");
    }

    if (email) {
      const normalized = email.trim().toLowerCase();
      const { error: delErr } = await supabaseAdmin
        .from("login_attempts")
        .delete()
        .eq("email", normalized);
      if (delErr) {
        console.error("[unblock-user] login_attempts clear error:", delErr);
        // non-fatal — still report success for the auth ban clear
      } else {
        performed.push("cleared login_attempts");
      }
    }

    return json({ success: true, performed });
  } catch (err) {
    console.error("unblock-user error:", err);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});
