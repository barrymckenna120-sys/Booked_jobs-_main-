// Shared CORS headers for Edge Functions.
//
// Usage:
//   import { corsHeaders, handlePreflight, jsonResponse } from "../_shared/cors.ts";
//
//   if (req.method === "OPTIONS") return handlePreflight();
//   ...
//   return jsonResponse({ ok: true });
//
// Notes:
// - Origin is "*" today to match existing behaviour. To restrict later,
//   replace ALLOW_ORIGIN with an allowlist check based on req.headers.get("origin").
// - Header list is the superset used across the project so any function
//   importing this will accept Supabase JS client + Make.com (x-make-secret) calls.

export const ALLOW_ORIGIN = "*";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Headers": [
    "authorization",
    "x-client-info",
    "apikey",
    "content-type",
    "x-org-id",
    // Superadmin tenant impersonation: injected by the app's fetch interceptor.
    // Omitting it makes the browser block the POST after a 200 preflight.
    "x-org-impersonation-token",
    "x-make-secret",
    // Alias accepted by the guarded functions' isMachineCaller() check.
    "x-webhook-secret",
    "x-supabase-client-platform",
    "x-supabase-client-platform-version",
    "x-supabase-client-runtime",
    "x-supabase-client-runtime-version",
  ].join(", "),
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function handlePreflight(): Response {
  return new Response("ok", { headers: corsHeaders });
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, { status });
}

// --- Dynamic-origin CORS ----------------------------------------------------
// Same allow-list logic as list-users / impersonate-org / reset-org-data.
// Browser callers from a known app origin get that exact origin echoed back;
// unknown origins get no CORS grant. Server-to-server callers (cron, Make.com)
// send no Origin header and are unaffected.

const ALLOWED_ORIGINS = [
  "https://kngasservices.bookedjobs.ie",
  "https://dublin-gas.bookedjobs.ie",
];

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const hostname = new URL(origin).hostname;
    return (
      hostname === "localhost" ||
      hostname.endsWith(".lovableproject.com") ||
      hostname.endsWith(".lovable.app")
    );
  } catch {
    return false;
  }
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? (origin as string) : "",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": corsHeaders["Access-Control-Allow-Headers"],
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

