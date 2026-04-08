import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, message, customer_id, customer_name } = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: "Missing phone or message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalise phone to E.164 — strip leading + for 360Messenger
    let normalised = phone.trim().replace(/\s+/g, "");
    if (normalised.startsWith("+")) {
      normalised = normalised.slice(1);
    } else if (normalised.startsWith("0")) {
      normalised = "353" + normalised.slice(1);
    }

    const MESSENGER_API_KEY = Deno.env.get("MESSENGER_API_KEY");
    if (!MESSENGER_API_KEY) {
      throw new Error("MESSENGER_API_KEY not set");
    }

    const formData = new FormData();
    formData.append("phonenumber", normalised);
    formData.append("text", message);

    const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MESSENGER_API_KEY}`,
      },
      body: formData,
    });

    const result = await response.text();

    // Log to edge_function_logs for diagnostics
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/edge_function_logs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            function_name: "send-warranty-whatsapp",
            error_message: response.ok ? "OK" : `HTTP ${response.status}: ${result}`,
            payload: { phone: normalised, customer_id, customer_name, status: response.status },
          }),
        });
      } catch (_logErr) {
        // Non-critical logging failure
      }
    }

    if (!response.ok) {
      throw new Error(`360Messenger error (${response.status}): ${result}`);
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (_e) {
    return new Response(
      JSON.stringify({ error: (_e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
