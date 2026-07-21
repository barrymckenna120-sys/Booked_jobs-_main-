# Fix create-booking-link Edge Function

## Scope
Only `supabase/functions/create-booking-link/index.ts` will be modified.

## Changes
1. Remove the hardcoded `TALLY_BASE` constant and the logic that rewrites `full_url` to it. Validate that `full_url` is a well-formed absolute `https://` URL and store it exactly as received.
2. Remove the hardcoded `SHORT_BASE` constant. Import `getTenantPublicUrl` from `../_shared/tenantDomain.ts` and use the tenant's `public_domain` to build the short link. If `getTenantPublicUrl` returns null, return HTTP 500 with the message "Tenant public_domain not configured — cannot mint short link".
3. Leave token generation, the 5-attempt retry loop, and the response shape unchanged.

## Proposed file content

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { getTenantPublicUrl } from "../_shared/tenantDomain.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id",
};

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

  try {
    const { customer_id, full_url, organisation_id } = await req.json();

    if (!full_url || !organisation_id) {
      return new Response(
        JSON.stringify({ error: "full_url and organisation_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidAbsoluteHttpsUrl(full_url)) {
      return new Response(
        JSON.stringify({ error: "full_url must be a well-formed absolute https:// URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const short_url = await getTenantPublicUrl(SUPABASE_URL, organisation_id, `/b/${token}`);
    if (!short_url) {
      return new Response(
        JSON.stringify({ error: "Tenant public_domain not configured — cannot mint short link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ short_url, token }),
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
```

## Deployment
After the file is written in build mode, deploy the Edge Function.
