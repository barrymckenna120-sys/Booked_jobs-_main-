import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, reset } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string") {
      return json({ error: "email required" }, 400);
    }
    const normalizedEmail = email.trim().toLowerCase();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Successful login -> clear attempts
    if (reset === true) {
      await supabase
        .from("login_attempts")
        .delete()
        .eq("email", normalizedEmail);
      return json({ reset: true });
    }

    // Increment attempts (upsert on email)
    const { data: existing } = await supabase
      .from("login_attempts")
      .select("attempts")
      .eq("email", normalizedEmail)
      .maybeSingle();

    const newAttempts = (existing?.attempts ?? 0) + 1;

    const { error: upsertError } = await supabase
      .from("login_attempts")
      .upsert(
        {
          email: normalizedEmail,
          attempts: newAttempts,
          last_attempt_at: new Date().toISOString(),
        },
        { onConflict: "email" },
      );

    if (upsertError) {
      console.error("upsert error", upsertError);
      return json({ error: "failed to record attempt" }, 500);
    }

    if (newAttempts < 5) {
      return json({ locked: false, attempts: newAttempts });
    }

    // LOCK
    const lockedAt = new Date().toISOString();
    await supabase
      .from("login_attempts")
      .update({ locked_at: lockedAt })
      .eq("email", normalizedEmail);

    // Find auth user by email & ban
    try {
      const { data: list } = await supabase.auth.admin.listUsers();
      const user = list?.users?.find(
        (u) => (u.email ?? "").toLowerCase() === normalizedEmail,
      );
      if (user) {
        await supabase.auth.admin.updateUserById(user.id, {
          ban_duration: "24h",
        } as any);
      } else {
        console.warn("track-failed-login: no auth user for", normalizedEmail);
      }
    } catch (banErr) {
      console.error("ban error", banErr);
    }

    // Resend alert
    try {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY) {
        const body = `Account locked: ${normalizedEmail}\nTimestamp (UTC): ${lockedAt}\n\nThe account has been banned for 24 hours automatically after 5 failed login attempts.\n\nLog in to /admin to review or unblock the account.`;
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "noreply@bookedjobs.ie",
            to: ["barrymckenna120@gmail.com"],
            subject: `⚠️ BookedJobs — Account Locked: ${normalizedEmail}`,
            text: body,
          }),
        });
        if (!res.ok) {
          console.error("resend failed", res.status, await res.text());
        }
      } else {
        console.warn("RESEND_API_KEY missing — skipping alert email");
      }
    } catch (mailErr) {
      console.error("resend error", mailErr);
    }

    return json({ locked: true, attempts: newAttempts });
  } catch (e) {
    console.error("track-failed-login error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
