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

    const body = await req.json().catch(() => ({}));
    const rawPhone: string = body?.phone || "";

    if (!rawPhone || typeof rawPhone !== "string") {
      return new Response(
        JSON.stringify({ error: "phone is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalise to 353XXXXXXXXX
    let digits = rawPhone.replace(/^\+/, "").replace(/\D/g, "");
    if (digits.startsWith("0")) digits = "353" + digits.slice(1);
    if (!digits.startsWith("353") && digits.length === 9) digits = "353" + digits;
    const international = digits;
    const local = international.startsWith("353") ? "0" + international.slice(3) : international;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: customer, error: findErr } = await supabase
      .from("customers")
      .select("id, phone, whatsapp_phone, organisation_id")
      .or(
        `phone.eq.${international},phone.eq.+${international},phone.eq.${local},whatsapp_phone.eq.${international},whatsapp_phone.eq.+${international},whatsapp_phone.eq.${local}`
      )
      .limit(1)
      .maybeSingle();

    if (findErr) throw findErr;

    if (!customer) {
      return new Response(
        JSON.stringify({ success: false, message: "customer not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: updErr } = await supabase
      .from("customers")
      .update({ opted_out: true, opted_out_date: new Date().toISOString() })
      .eq("id", customer.id);

    if (updErr) throw updErr;

    await supabase.from("message_log").insert({
      customer_id: customer.id,
      organisation_id: customer.organisation_id,
      channel: "whatsapp",
      direction: "inbound",
      message_type: "opt_out",
      content: "Customer replied STOP — opted out of WhatsApp messages",
      status: "received",
      sent_at: new Date().toISOString(),
      sent_by: "customer",
    });

    return new Response(
      JSON.stringify({
        success: true,
        customer_id: customer.id,
        phone: customer.phone || customer.whatsapp_phone || international,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
