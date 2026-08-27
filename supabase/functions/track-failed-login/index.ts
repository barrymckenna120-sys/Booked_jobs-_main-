import { getCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { AUTH_EVENT_HEADER, mintAuthEventToken } from "../_shared/authEvent.ts";

/**
 * Single trusted entry point for failed-login events.
 *
 * The browser calls ONLY this function. It counts attempts server-side and,
 * when a downstream action is warranted, mints a short-lived signed auth-event
 * token and invokes `lock-failed-login` / `notify-failed-login` itself. Those
 * two functions no longer accept anonymous browser calls, so an attacker can no
 * longer lock arbitrary accounts or spam alert emails.
 */
async function callAuthEventFunction(
  fn: string,
  body: Record<string, unknown>,
  token: string | null,
): Promise<void> {
  if (!token) {
    console.warn(`track-failed-login: skipping ${fn} — no auth-event token could be minted`);
    return;
  }
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        [AUTH_EVENT_HEADER]: token,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`track-failed-login: ${fn} responded ${res.status}`);
    await res.text().catch(() => "");
  } catch (e) {
    console.error(`track-failed-login: ${fn} invocation failed`, e);
  }
}

// Pre-auth endpoint, but still origin-restricted to the tenant domains/preview
// so it cannot be driven from arbitrary sites.
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const { email, reset } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string") {
      return json(req, { error: "email required" }, 400);
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
      return json(req, { reset: true });
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
      return json(req, { error: "failed to record attempt" }, 500);
    }

    if (newAttempts < 5) {
      await callAuthEventFunction(
        "notify-failed-login",
        { email: normalizedEmail, attempt: newAttempts, timestamp: new Date().toISOString() },
        await mintAuthEventToken({
          purpose: "failed_login_notify",
          email: normalizedEmail,
          attempts: newAttempts,
        }),
      );
      return json(req, { locked: false, attempts: newAttempts });
    }

    // LOCK
    const lockedAt = new Date().toISOString();
    await supabase
      .from("login_attempts")
      .update({ locked_at: lockedAt })
      .eq("email", normalizedEmail);

    const lockToken = await mintAuthEventToken({
      purpose: "failed_login_lock",
      email: normalizedEmail,
      attempts: newAttempts,
    });
    await callAuthEventFunction("lock-failed-login", { email: normalizedEmail }, lockToken);
    await callAuthEventFunction(
      "notify-failed-login",
      { email: normalizedEmail, attempt: newAttempts, timestamp: lockedAt },
      await mintAuthEventToken({
        purpose: "failed_login_notify",
        email: normalizedEmail,
        attempts: newAttempts,
      }),
    );

    return json(req, { locked: true, attempts: newAttempts });
  } catch (e) {
    console.error("track-failed-login error", e);
    return json(req, { error: (e as Error).message }, 500);
  }
});
