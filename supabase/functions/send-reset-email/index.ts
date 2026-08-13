import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const REDIRECT_URL = "https://kngasservices.bookedjobs.ie/reset-password";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      throw new Error("Server configuration error");
    }
    if (!RESEND_API_KEY) {
      console.error("Missing RESEND_API_KEY");
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Password reset requested for: ${email}`);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Generate a recovery link WITHOUT sending an email (bypasses auth-email-hook)
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: REDIRECT_URL },
    });

    if (linkError) {
      console.error("generateLink error:", linkError.message);
      // Don't reveal if user exists — always return success
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actionLink = (linkData as any)?.properties?.action_link;
    if (!actionLink) {
      console.error("No action_link returned from generateLink");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = `<!DOCTYPE html><html><body style="font-family:'DM Sans',Arial,sans-serif;background:#F0F4FF;padding:40px 16px;">
<div style="max-width:560px;margin:0 auto;">
<div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(37,99,235,0.08);">
<div style="height:5px;background:linear-gradient(90deg,#2563EB,#60a5fa);"></div>
<div style="padding:44px 48px 40px;">
<h1 style="font-size:26px;font-weight:700;color:#0f172a;margin-bottom:12px;">Reset your password</h1>
<p style="font-size:15px;color:#4b5563;line-height:1.65;margin-bottom:28px;">Click the button below to reset your password. This link expires in 1 hour.</p>
<div style="background:#F8FAFF;border:1px solid #dbeafe;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;"><span style="color:#6b7280;font-weight:500;">Account</span><span style="color:#0f172a;font-weight:600;">${email}</span></div>
</div>
<a href="${actionLink}" style="display:inline-block;background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:15px 36px;border-radius:12px;box-shadow:0 4px 14px rgba(37,99,235,0.35);">Reset Password</a>
<p style="font-size:13px;color:#9ca3af;line-height:1.6;margin-top:28px;">If you didn't request this, you can safely ignore this email — your password will remain unchanged.</p>
</div></div>
<div style="text-align:center;margin-top:28px;padding-bottom:8px;"><p style="font-size:12.5px;color:#9ca3af;">© 2026 BookedJobs · Karl's Gas</p></div>
</div></body></html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "BookedJobs <noreply@bookedjobs.ie>",
        to: [email],
        subject: "Reset your BookedJobs password",
        html,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text().catch(() => "");
      console.error("Resend send failed:", resendRes.status, detail);
      return new Response(JSON.stringify({ error: `Email send failed (${resendRes.status})` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Password reset email sent successfully for: ${email}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("send-reset-email error:", msg);
    return new Response(JSON.stringify({ error: "An unexpected error occurred." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
