import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const makeSecret = Deno.env.get("MAKE_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("x-make-secret");

    if (!makeSecret || providedSecret !== makeSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve organisation_id: prefer explicit body value; otherwise
    // derive from customer_id → customers.organisation_id. This keeps
    // legacy Make.com scenarios working while message_log now enforces
    // NOT NULL on organisation_id at the DB level.
    let organisationId: string | null = body.organisation_id ?? null;
    const customerId =
      body.customer_id === "" || body.customer_id == null ? null : body.customer_id;

    if (!organisationId && customerId) {
      const { data: cust } = await supabase
        .from("customers")
        .select("organisation_id")
        .eq("id", customerId)
        .maybeSingle();
      organisationId = cust?.organisation_id ?? null;
    }

    if (!organisationId) {
      return new Response(
        JSON.stringify({
          error:
            "organisation_id required — pass it explicitly, or supply a customer_id that resolves to one.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Normalize empty strings to null so callers can send "" for optional fields.
    const emptyToNull = (v: unknown) =>
      v === "" || v === undefined || v === null ? null : v;

    // Support both canonical field names and the aliases used by WhatsApp senders.
    const serviceCallId = emptyToNull(body.service_call_id) as string | null;
    const relatedId = emptyToNull(body.related_id) as string | null;
    const messageBody = emptyToNull(body.message_body) as string | null;
    const content = emptyToNull(body.content) as string | null;

    const { error } = await supabase.from("message_log").insert({
      customer_id: customerId,
      message_type: body.message_type,
      channel: body.channel,
      direction: body.direction,
      content: messageBody ?? content,
      status: emptyToNull(body.status) as string | null,
      recipient_phone: emptyToNull(body.recipient_phone) as string | null,
      related_id: serviceCallId ?? relatedId,
      related_type: serviceCallId ? "service_call" : (emptyToNull(body.related_type) as string | null),
      sent_by: body.sent_by,
      sent_at: body.sent_at,
      organisation_id: organisationId,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});