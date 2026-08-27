import { createClient } from "npm:@supabase/supabase-js@2";
import { getTenantPublicUrl } from "../_shared/tenantDomain.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isDenied, requireBoundOrg } from "../_shared/orgAuth.ts";

/**
 * Mints short links on tenants' own public domains.
 *
 * Callers:
 *  - Make.com / internal server-side callers (renewal-reminder-14 / -30) with an
 *    approved machine credential. Machine callers MUST name organisation_id and,
 *    where the tenant has its own webhook secret configured, present it.
 *  - Signed-in app users, scoped to their own organisation.
 *
 * Fails closed: no credential, or an organisation the caller may not act for,
 * is rejected before anything is written.
 */

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
    return new URL(url).protocol === "https:";
  } catch (_e) {
    return false;
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const { customer_id, full_url } = body as {
      customer_id?: string | null;
      full_url?: string;
    };

    const access = await requireBoundOrg(req, {
      fnName: "create-booking-link",
      cors: corsHeaders,
      requestedOrgId: (body as { organisation_id?: string }).organisation_id ?? null,
    });
    if (isDenied(access)) return access.error;
    const organisation_id = access.orgId;

    if (!full_url) return json({ error: "full_url is required" }, 400);
    if (!isValidAbsoluteHttpsUrl(full_url)) {
      return json({ error: "full_url must be a well-formed absolute https:// URL" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Target validation: the link must point at THIS tenant's configured booking form.
    const { data: tallyIntegration } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", organisation_id)
      .eq("integration_type", "tally")
      .maybeSingle();

    const tallyBase = (tallyIntegration?.config as Record<string, string> | null)?.new_booking_url;
    if (!tallyBase) {
      console.warn(`create-booking-link: missing tally new_booking_url for org ${organisation_id}`);
      return json({ error: "Tally new_booking_url not configured for this organisation" }, 400);
    }
    if (!full_url.startsWith(tallyBase)) {
      return json({ error: "full_url does not match this organisation's booking form" }, 400);
    }

    // Resolve the tenant's public domain BEFORE any insert, so we never write a
    // booking_links row we cannot mint a URL for.
    const shortUrlTemplate = await getTenantPublicUrl(
      SUPABASE_URL,
      organisation_id,
      "/b/__TOKEN__",
    );
    if (!shortUrlTemplate) {
      return json({ error: "Tenant public_domain not configured — cannot mint short link" }, 500);
    }

    // Customer, when supplied, must belong to the same organisation.
    if (customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("id, organisation_id")
        .eq("id", customer_id)
        .maybeSingle();
      if (!customer || customer.organisation_id !== organisation_id) {
        return json({ error: "not_found" }, 404);
      }
    }

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

    if (!inserted) throw lastError ?? new Error("Failed to generate unique token");

    return json({ short_url: shortUrlTemplate.replace("__TOKEN__", token), token });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("create-booking-link error:", msg);
    return json({ error: msg }, 500);
  }
});
