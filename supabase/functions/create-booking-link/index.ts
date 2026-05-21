import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SHORT_BASE = "https://rebook.kngasservices.ie/b";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function genToken(len = 6): string {
  let s = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
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

    // Always store with the canonical Tally form as the base, preserving query params.
    const TALLY_BASE = "https://tally.so/r/RGJDy4";
    const qIdx = String(full_url).indexOf("?");
    const queryString = qIdx >= 0 ? String(full_url).slice(qIdx) : "";
    const normalised_url = `${TALLY_BASE}${queryString}`;

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

    return new Response(
      JSON.stringify({ short_url: `${SHORT_BASE}/${token}`, token }),
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
