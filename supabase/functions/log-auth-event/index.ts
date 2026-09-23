/**
 * log-auth-event — records one login/session event for the superadmin activity
 * log (auth_activity_events).
 *
 * Why verify_jwt = false: the most valuable events (failed sign-in, lockout,
 * password reset request) happen before a session exists. To keep an
 * unauthenticated writer safe:
 *   - the event type is checked against a fixed allowlist;
 *   - pre-auth callers may only record pre-auth event types;
 *   - the IP address is read from the request, never from the body;
 *   - the tenant is resolved server-side from profiles, never from the body;
 *   - every string is length-capped and the payload size is capped;
 *   - a per-IP burst limit drops floods without telling the caller anything.
 *
 * No password, token or session material is read or stored.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-make-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BODY_BYTES = 8 * 1024;
const BURST_WINDOW_SECONDS = 60;
const BURST_LIMIT = 40;

const ALL_EVENTS = [
  "sign_in_success",
  "sign_in_failed",
  "sign_out",
  "password_reset_requested",
  "password_changed",
  "account_locked",
] as const;

/** Types an unauthenticated caller is allowed to record. */
const PRE_AUTH_EVENTS = new Set([
  "sign_in_failed",
  "password_reset_requested",
  "account_locked",
  "sign_in_success",
]);

const cap = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

const clientIp = (req: Request): string | null => {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("cf-connecting-ip")?.trim() || null;
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
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ success: false, error: "Payload too large" }, 413);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return json({ success: false, error: "Invalid JSON" }, 400);
  }

  const eventType = cap(body.event_type, 40);
  if (!eventType || !ALL_EVENTS.includes(eventType as (typeof ALL_EVENTS)[number])) {
    return json({ success: false, error: "Unknown event type" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Identify the caller when a session is present; otherwise stay pre-auth.
  let sessionUserId: string | null = null;
  let sessionEmail: string | null = null;
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (token) {
    const { data } = await supabase.auth.getUser(token);
    if (data?.user) {
      sessionUserId = data.user.id;
      sessionEmail = data.user.email ?? null;
    }
  }

  if (!sessionUserId && !PRE_AUTH_EVENTS.has(eventType)) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const ip = clientIp(req);

  // Burst limit per IP — drops floods quietly.
  if (ip) {
    const since = new Date(Date.now() - BURST_WINDOW_SECONDS * 1000).toISOString();
    const { count } = await supabase
      .from("auth_activity_events")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since);
    if ((count ?? 0) >= BURST_LIMIT) {
      return json({ success: true, throttled: true });
    }
  }

  const email = sessionEmail ?? cap(body.email, 200)?.toLowerCase() ?? null;
  const userId = sessionUserId ?? (cap(body.user_id, 40) as string | null);

  // Tenant is resolved server-side only.
  let organisationId: string | null = null;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organisation_id")
      .eq("user_id", userId)
      .maybeSingle();
    organisationId = (profile?.organisation_id as string | null) ?? null;
  }
  if (!organisationId && email) {
    // Pre-auth events (failed sign-in, reset request) have no session, so the
    // tenant comes from a server-only lookup on the email address.
    const { data: orgId } = await supabase.rpc("org_for_login_email", { _email: email });
    organisationId = (orgId as string | null) ?? null;
  }

  const device = (body.device ?? {}) as Record<string, unknown>;
  const outcome =
    eventType === "sign_in_failed" || eventType === "account_locked" ? "failure" : "success";

  const { error } = await supabase.from("auth_activity_events").insert({
    event_type: eventType,
    outcome,
    failure_reason: cap(body.failure_reason, 80),
    user_id: userId,
    email,
    organisation_id: organisationId,
    ip,
    browser: cap(device.browser, 40),
    browser_version: cap(device.browser_version, 20),
    os: cap(device.os, 40),
    device_type: cap(device.device_type, 20),
    display_mode: cap(device.display_mode, 20),
    user_agent: cap(device.user_agent, 400),
    app: cap(body.app, 20),
    route: cap(device.route, 120),
    metadata: null,
  });

  if (error) {
    console.error("log-auth-event insert failed:", error.message);
    return json({ success: false, error: "Could not record event" }, 500);
  }

  return json({ success: true });
});
