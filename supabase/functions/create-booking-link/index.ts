import { createClient } from "npm:@supabase/supabase-js@2";
import { getTenantPublicUrl } from "../_shared/tenantDomain.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

<<<<<<< HEAD
/**
 * This function mints short links on tenants' own public domains, so it must
 * not be callable by anonymous third parties. Two accepted callers:
 *  1. External (Make.com): `x-webhook-secret` header === MAKE_WEBHOOK_SECRET,
 *     matching the pattern used by tally-boiler-rebook / tally-incoming-job.
 *  2. Internal server-side callers (renewal-reminder-14 / -30), which already
 *     send `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.
 * Fails closed: if neither credential is configured/valid, the request is 401.
 */
function isAuthorised(req: Request): boolean {
  const expectedSecret = Deno.env.get("MAKE_WEBHOOK_SECRET");
  const providedSecret = req.headers.get("x-webhook-secret");
  if (expectedSecret && providedSecret === expectedSecret) return true;

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (serviceRoleKey && bearer === serviceRoleKey) return true;

  return false;
}


=======
// SHORT_BASE is resolved per-request from tenant_integrations (whatsapp.config.domain).
>>>>>>> origin/main
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function genToken(len = 6): string {
  let s = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

function isValidAbsoluteHttpsUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch (_e) {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!isAuthorised(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {

    const { customer_id, full_url, organisation_id } = await req.json();

    if (!full_url || !organisation_id) {
      return new Response(
        JSON.stringify({ error: "full_url and organisation_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

<<<<<<< HEAD
    if (!isValidAbsoluteHttpsUrl(full_url)) {
      return new Response(
        JSON.stringify({ error: "full_url must be a well-formed absolute https:// URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

    // Resolve the tenant's public domain BEFORE any insert. If unavailable,
    // return 500 immediately without writing a row to booking_links.
    const shortUrlTemplate = await getTenantPublicUrl(
      SUPABASE_URL,
      organisation_id,
      "/b/__TOKEN__",
    );
    if (!shortUrlTemplate) {
      return new Response(
        JSON.stringify({
          error: "Tenant public_domain not configured — cannot mint short link",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

=======
>>>>>>> origin/main
    const supabase = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tallyIntegration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", organisation_id)
      .eq("integration_type", "tally")
      .maybeSingle();

    const tallyBase = (tallyIntegration as any)?.config?.new_booking_url;
    if (!tallyBase) {
      console.warn(`Missing Tally new_booking_url for org ${organisation_id}`);
      return new Response(
        JSON.stringify({ error: "Tally new_booking_url not configured for this organisation" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve tenant domain for short link base
    const { data: waIntegration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", organisation_id)
      .eq("integration_type", "whatsapp")
      .maybeSingle();

    const tenantDomain = (waIntegration as any)?.config?.domain;
    if (!tenantDomain) {
      console.warn(`Missing whatsapp.config.domain for org ${organisation_id}`);
      return new Response(
        JSON.stringify({ error: "Tenant domain not configured for this organisation" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const shortBase = `https://${tenantDomain}/b`;

    const qIdx = String(full_url).indexOf("?");
    const queryString = qIdx >= 0 ? String(full_url).slice(qIdx) : "";
    const normalised_url = `${tallyBase}${queryString}`;


    let token = "";
    let inserted = false;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      token = genToken(6);
      const { error } = await supabase.from("booking_links").insert({
        token,
        full_url,
        customer_id: customer_id ?? null,
        organisation_id,
      });
      if (!error) {
        inserted = true;
      } else if (!String(error.message || "").toLowerCase().includes("duplicate")) {
        lastError = error;
        break;
      }
    }

    if (!inserted) {
      throw lastError ?? new Error("Failed to generate unique token");
    }

    const short_url = shortUrlTemplate.replace("__TOKEN__", token);

    return new Response(
<<<<<<< HEAD
      JSON.stringify({ short_url, token }),
=======
      JSON.stringify({ short_url: `${shortBase}/${token}`, token }),
>>>>>>> origin/main
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
