import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { email, attempt, timestamp, companyName } = await req.json().catch(() => ({}));

    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let resolvedCompany = (companyName && String(companyName).trim()) || "";

    // Fallback: resolve business name server-side via service role if frontend couldn't.
    if (!resolvedCompany) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          { auth: { persistSession: false } },
        );
        const { data: eng } = await supabase
          .from("engineers")
          .select("organisation_id")
          .eq("email", email)
          .maybeSingle();
        const orgId = (eng as any)?.organisation_id;
        if (orgId) {
          const { data: s } = await supabase
            .from("settings")
            .select("business_name")
            .eq("organisation_id", orgId)
            .maybeSingle();
          resolvedCompany = (s as any)?.business_name || "";
        }
      } catch (_e) {
        // ignore
      }
    }
    if (!resolvedCompany) resolvedCompany = "Unknown";

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY missing");
      return new Response(JSON.stringify({ ok: false, reason: "no_api_key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = `A failed login attempt was recorded on BookedJobs.

Company: ${resolvedCompany}
Account: ${email}
Attempt number: ${attempt} of 3
Time: ${timestamp}

If this was not you, please investigate immediately.`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "noreply@bookedjobs.ie",
        to: ["barrymckenna120@gmail.com"],
        subject: "⚠️ Failed Login Attempt – BookedJobs",
        text: body,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("resend failed", res.status, errText);
      return new Response(JSON.stringify({ ok: false, status: res.status }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-failed-login error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
