import { createClient } from "npm:@supabase/supabase-js@2";
import { last9Digits } from "../_shared/phone.ts";
import { buildRebookTallyUrl, mintShortLink } from "../_shared/rebookLink.ts";
import { logMessage } from "../_shared/logMessage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-webhook-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Missed-call handler support function for the Telnyx → Make scenario.
 *
 * All reads/writes happen server-side with the service-role key because anon
 * SELECT on customers / tenant_integrations / message_log is filtered by RLS
 * (returns 200 + empty array — a silent failure).
 *
 * Auth: `x-webhook-secret` === MAKE_WEBHOOK_SECRET, or service-role bearer for
 * internal callers. Fails closed.
 */
function isAuthorised(req: Request): boolean {
  const expectedSecret = Deno.env.get("MAKE_WEBHOOK_SECRET");
  const providedSecret = req.headers.get("x-webhook-secret");
  if (expectedSecret && providedSecret === expectedSecret) return true;

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return !!serviceRoleKey && bearer === serviceRoleKey;
}

/** Start of today in Europe/Dublin, as an ISO timestamp. */
function dublinDayStartISO(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Dublin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  // Dublin is UTC+0/+1; using the local date at 00:00 UTC is safe as a lower
  // bound for "already contacted today" and never suppresses a later day.
  return `${parts}T00:00:00.000Z`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isAuthorised(req)) return json({ error: "Unauthorized" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const body = await req.json().catch(() => ({}));
    const organisation_id: string | undefined = body?.organisation_id;
    const phone: string | undefined = body?.phone;
    const mode: string = body?.mode ?? "lookup";

    if (!organisation_id) return json({ error: "organisation_id is required" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ---- mode: log_followup -------------------------------------------------
    // Records the send after Make's WhatsApp step, so dedup works on the next
    // call. anon cannot write message_log / customer_activity directly.
    if (mode === "log_followup") {
      const customer_id: string | undefined = body?.customer_id;
      if (!customer_id) return json({ error: "customer_id is required for log_followup" }, 400);
      const status = body?.status === "failed" ? "failed" : "sent";
      const content = typeof body?.content === "string" && body.content
        ? body.content
        : "Missed call follow-up WhatsApp sent";

      await logMessage(supabase, {
        organisation_id,
        customer_id,
        message_type: "missed_call_followup",
        content,
        status,
        channel: "whatsapp",
        sent_by: "telnyx_missed_call",
      });

      if (status === "sent") {
        await supabase.from("customer_activity").insert({
          organisation_id,
          customer_id,
          event_type: "whatsapp_sent",
          event_label: "Missed call follow-up sent",
          event_data: { source: "telnyx_missed_call", phone: phone ?? null },
        });
      }

      return json({ logged: true });
    }

    // ---- mode: lookup -------------------------------------------------------
    if (!phone) return json({ error: "phone is required" }, 400);

    const key = last9Digits(phone);
    if (!key) {
      return json({
        ignored: false,
        matchable: false,
        customer: null,
        already_contacted_today: false,
        booking_url: null,
        booking_url_type: null,
        org: null,
      });
    }

    // 1. Whitelist (staff / do-not-automate numbers) via the existing RPC.
    const { data: ignoredData } = await supabase.rpc("is_ignored_number", {
      _organisation_id: organisation_id,
      _phone: phone,
    });
    const ignored = ignoredData === true;

    // 2. Org branding + Tally URLs.
    const [{ data: settings }, { data: tally }] = await Promise.all([
      supabase
        .from("settings")
        .select("business_name, business_phone")
        .eq("organisation_id", organisation_id)
        .maybeSingle(),
      supabase
        .from("tenant_integrations")
        .select("config")
        .eq("organisation_id", organisation_id)
        .eq("integration_type", "tally")
        .maybeSingle(),
    ]);

    const tallyCfg = (tally as any)?.config ?? {};
    const renewalFormUrl: string = tallyCfg.renewal_form_url ?? "";
    const newBookingUrl: string = tallyCfg.new_booking_url ?? "";

    const org = {
      business_name: (settings as any)?.business_name ?? null,
      business_phone: (settings as any)?.business_phone ?? null,
    };

    if (ignored) {
      return json({
        ignored: true,
        matchable: true,
        customer: null,
        already_contacted_today: false,
        booking_url: null,
        booking_url_type: null,
        org,
      });
    }

    // 3. Match the caller against this org's customers via last9Digits.
    const { data: candidates, error: custErr } = await supabase
      .from("customers")
      .select(
        "id, name, phone, address, eircode, area_code, boiler_brand, boiler_model, opted_out, is_archived",
      )
      .eq("organisation_id", organisation_id)
      .eq("is_archived", false);
    if (custErr) throw custErr;

    const customer = (candidates ?? []).find((c) => last9Digits(c.phone) === key) ?? null;

    // 4. Same-day dedup (matched customers only, by design).
    let already_contacted_today = false;
    if (customer) {
      const { data: recent } = await supabase
        .from("message_log")
        .select("id")
        .eq("organisation_id", organisation_id)
        .eq("customer_id", customer.id)
        .eq("message_type", "missed_call_followup")
        .gte("sent_at", dublinDayStartISO())
        .limit(1);
      already_contacted_today = (recent ?? []).length > 0;
    }

    // 5. Booking URL — always the final short link, minted here so Make never
    //    needs a second call. Falls back to the raw pre-filled URL if minting
    //    fails, and to null when the org has no Tally form configured.
    let booking_url: string | null = null;
    let booking_url_type: "rebook" | "new" | null = null;

    const shouldMint = !already_contacted_today && !(customer as any)?.opted_out;
    if (shouldMint) {
      if (customer && renewalFormUrl) {
        const full = buildRebookTallyUrl(renewalFormUrl, customer as any);
        booking_url = await mintShortLink({
          supabaseUrl: SUPABASE_URL,
          serviceRoleKey: SERVICE_ROLE_KEY,
          organisation_id,
          customer_id: customer.id,
          full_url: full,
        });
        booking_url_type = "rebook";
      } else if (!customer && newBookingUrl) {
        booking_url = await mintShortLink({
          supabaseUrl: SUPABASE_URL,
          serviceRoleKey: SERVICE_ROLE_KEY,
          organisation_id,
          customer_id: null,
          full_url: newBookingUrl,
        });
        booking_url_type = "new";
      }
    }

    return json({
      ignored: false,
      matchable: true,
      customer: customer
        ? {
            id: customer.id,
            name: customer.name,
            first_name: (customer.name || "there").split(" ")[0],
            phone: customer.phone,
            opted_out: !!(customer as any).opted_out,
          }
        : null,
      already_contacted_today,
      booking_url,
      booking_url_type,
      org,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      await sb.from("edge_function_logs").insert({
        function_name: "missed-call-lookup",
        error_message: msg,
        payload: null,
      });
    } catch (_e) { /* best-effort */ }
    return json({ error: msg }, 500);
  }
});
