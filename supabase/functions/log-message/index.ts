import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-make-secret, x-org-id",
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

    const { error } = await supabase.from("message_log").insert({
      customer_id: body.customer_id === "" || body.customer_id == null ? null : body.customer_id,
      message_type: body.message_type,
      channel: body.channel,
      direction: body.direction,
      content: body.content,
      related_id: body.related_id,
      related_type: body.related_type,
      sent_by: body.sent_by,
      sent_at: body.sent_at,
      organisation_id: body.organisation_id,
      organisation_id_ref: body.organisation_id_ref,
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