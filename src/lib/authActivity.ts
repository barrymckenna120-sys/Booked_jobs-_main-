/**
 * Login/session activity reporting (Phase 1 of the tenant activity log).
 *
 * The browser never supplies its own IP address — the Edge Function reads it
 * from the request — and nothing here ever touches a password or token. The
 * client contributes only the event type, an optional failure reason and the
 * device summary the browser already exposes to every page.
 *
 * Every call is fire-and-forget: logging must never delay or break sign-in.
 */

import { supabase } from "@/integrations/supabase/client";
import { collectDiagnostics } from "@/lib/supportDiagnostics";
import { isStandaloneDisplay } from "@/lib/authFailureReport";

export type AuthActivityEventType =
  | "sign_in_success"
  | "sign_in_failed"
  | "sign_out"
  | "password_reset_requested"
  | "password_changed"
  | "account_locked";

export type AuthActivityDevice = {
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  device_type: string | null;
  display_mode: "standalone" | "browser";
  user_agent: string | null;
  route: string | null;
};

export type AuthActivityInput = {
  event_type: AuthActivityEventType;
  email?: string | null;
  user_id?: string | null;
  failure_reason?: string | null;
};

/** Device summary sent alongside an event. No fingerprinting, no probing. */
export function collectAuthDevice(): AuthActivityDevice {
  const d = collectDiagnostics();
  return {
    browser: d.browser,
    browser_version: d.browser_version,
    os: d.os,
    device_type: d.device_type,
    display_mode: isStandaloneDisplay() ? "standalone" : "browser",
    user_agent: d.user_agent,
    route: typeof window === "undefined" ? null : window.location.pathname,
  };
}

/**
 * Normalises a Supabase auth error into a short, stable reason code. Never
 * includes the submitted email or any credential material.
 */
export function classifyFailureReason(error: unknown, isNetworkError = false): string {
  if (isNetworkError) return "network_error";
  const err = error as { message?: unknown; code?: unknown } | null;
  const msg = String(err?.message ?? "").toLowerCase();
  const code = String(err?.code ?? "").toLowerCase();
  if (code === "user_banned" || msg.includes("banned")) return "account_blocked";
  if (msg.includes("locked")) return "account_locked";
  if (msg.includes("invalid")) return "invalid_credentials";
  if (msg.includes("email not confirmed")) return "email_not_confirmed";
  if (msg.includes("rate") || msg.includes("too many")) return "rate_limited";
  return "other";
}

/** Records one login/session event. Failures are swallowed by design. */
export function logAuthActivity(input: AuthActivityInput): void {
  try {
    const outcome =
      input.event_type === "sign_in_failed" || input.event_type === "account_locked"
        ? "failure"
        : "success";

    void supabase.functions
      .invoke("log-auth-event", {
        body: {
          event_type: input.event_type,
          outcome,
          failure_reason: input.failure_reason ?? null,
          email: input.email ? input.email.trim().toLowerCase() : null,
          user_id: input.user_id ?? null,
          device: collectAuthDevice(),
        },
      })
      .catch(() => {
        // Logging is best effort and must never surface to the user.
      });
  } catch {
    // Never let diagnostics break an auth flow.
  }
}
