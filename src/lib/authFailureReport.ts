/**
 * Diagnostics for network-flavoured sign-in failures.
 *
 * Context: iPhone reports show sign-in failing in Safari (including Private
 * Browsing and the installed home-screen app) while Chrome on the same phone
 * and network succeeds. The sign-in handler treats those as "No internet
 * connection" and returned early, which made this the only sign-in failure path
 * with no report attached — so we had no evidence to tell the candidate causes
 * apart (Apple private relay, a content blocker, a WebKit connection-reuse
 * failure, a third-party startup script).
 *
 * Pure detection helpers live here so they can be unit-tested; the reporting
 * wrapper is a thin Sentry call. Nothing here reads credentials.
 */

import * as Sentry from "@sentry/react";

export type BrowserEngine = "webkit-ios" | "webkit-mac" | "blink" | "gecko" | "unknown";

/**
 * iOS Chrome/Firefox are WebKit under the hood but do NOT use Safari's
 * networking privacy features, so they must not be reported as Safari.
 */
export function detectEngine(ua: string): BrowserEngine {
  const s = ua.toLowerCase();
  if (/crios|fxios|edgios|opios/.test(s)) return "blink";
  if (/chrome|chromium|edg\//.test(s)) return "blink";
  if (/firefox/.test(s)) return "gecko";
  if (/iphone|ipad|ipod/.test(s)) return "webkit-ios";
  if (/safari/.test(s)) return "webkit-mac";
  return "unknown";
}

/** True when the app is running from the home-screen icon rather than a tab. */
export function isStandaloneDisplay(
  win: Pick<Window, "matchMedia"> & { navigator?: { standalone?: boolean } } = window
): boolean {
  if (win.navigator?.standalone === true) return true;
  try {
    return win.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch {
    return false;
  }
}

/**
 * Best-effort private-browsing signal. iOS Safari Private Browsing has no API,
 * but it does not run service workers at all, so an absent service-worker API
 * on a WebKit engine is a strong hint. Reported as a hint, never as fact.
 */
export function privateBrowsingHint(input: {
  engine: BrowserEngine;
  hasServiceWorker: boolean;
}): "likely" | "unlikely" | "unknown" {
  if (input.engine !== "webkit-ios" && input.engine !== "webkit-mac") return "unknown";
  return input.hasServiceWorker ? "unlikely" : "likely";
}

/** Tag bag for a failed sign-in request. Contains no email, password or token. */
export function buildSignInFailureTags(input: {
  error: unknown;
  elapsedMs: number;
  onLine: boolean;
  ua: string;
  hasServiceWorker: boolean;
  standalone: boolean;
}): Record<string, string> {
  const engine = detectEngine(input.ua);
  const err = input.error as { name?: unknown; message?: unknown } | null;
  return {
    engine,
    display_mode: input.standalone ? "standalone" : "browser",
    private_browsing: privateBrowsingHint({ engine, hasServiceWorker: input.hasServiceWorker }),
    navigator_online: String(input.onLine),
    elapsed_ms: String(Math.max(0, Math.round(input.elapsedMs))),
    error_name: String(err?.name ?? "unknown"),
    error_message: String(err?.message ?? "").slice(0, 120),
    failure: "signin_network",
  };
}

/** Reports a network sign-in failure. Never changes user-facing behaviour. */
export function reportSignInNetworkFailure(error: unknown, startedAtMs: number): void {
  try {
    const tags = buildSignInFailureTags({
      error,
      elapsedMs: startedAtMs ? Date.now() - startedAtMs : 0,
      onLine: navigator.onLine,
      ua: navigator.userAgent,
      hasServiceWorker: "serviceWorker" in navigator,
      standalone: isStandaloneDisplay(),
    });
    Sentry.captureMessage("Sign-in failed with a network error", {
      level: "warning",
      tags,
    });
  } catch {
    // Diagnostics must never break sign-in.
  }
}
