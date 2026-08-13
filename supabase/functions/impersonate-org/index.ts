// Superadmin-only: mint a signed, short-lived HMAC token that authorises
// impersonating a specific organisation. RLS (get_my_org_id) verifies the
// token via vault-stored secret; nothing here is trusted client-side.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://kngasservices.bookedjobs.ie",
  "https://dublin-gas.bookedjobs.ie",
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const hostname = new URL(origin).hostname;
    return hostname.endsWith(".lovableproject.com") || hostname.endsWith(".lovable.app");
  } catch {
    return false;
  }
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin");
  const allowOrigin = isAllowedOrigin(origin) ? origin : ""; // empty string omits the header
  return {
    "Access-Control-Allow-Origin": allowOrigin ?? "",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Credentials": "true",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HMAC_SECRET = Deno.env.get("IMPERSONATION_HMAC_SECRET")!;
const TTL_SECONDS = 15 * 60;

let vaultBootstrapped = false;

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64urlStr(s: string): string {
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function signHmac(payloadB64: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64),
  );
  return b64url(sig);
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing bearer token" }, 401);

    // Verify caller identity + superadmin role using their JWT
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const uid = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("role")
      .eq("user_id", uid)
      .maybeSingle();
    if (profErr) return json({ error: profErr.message }, 500);
    if (!profile || profile.role !== "superadmin") return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const orgId = body?.org_id;
    if (typeof orgId !== "string" || !/^[0-9a-f-]{36}$/i.test(orgId)) {
      return json({ error: "Invalid org_id" }, 400);
    }

    // Ensure vault has the current HMAC secret (idempotent)
    if (!vaultBootstrapped) {
      const { error: bootErr } = await admin.rpc("bootstrap_impersonation_hmac", {
        _secret: HMAC_SECRET,
      });
      if (bootErr) return json({ error: `Vault bootstrap failed: ${bootErr.message}` }, 500);
      vaultBootstrapped = true;
    }

    const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
    const payload = JSON.stringify({ uid, org_id: orgId, exp });
    const payloadB64 = b64urlStr(payload);
    const sigB64 = await signHmac(payloadB64, HMAC_SECRET);
    const token = `${payloadB64}.${sigB64}`;

    return json({ token, exp });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
