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
