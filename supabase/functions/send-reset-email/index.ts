import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://plumb-on-call.lovable.app";

function resetEmailHtml(resetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Reset Your Password – BookedJobs</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: #F0F4FF; font-family: 'DM Sans', sans-serif; color: #1a1f36; padding: 40px 16px; }
    .wrapper { max-width: 560px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
    .logo-icon { width: 40px; height: 40px; background: linear-gradient(135deg, #2563EB, #1d4ed8); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
    .logo-icon svg { width: 22px; height: 22px; fill: white; }
    .logo-text { font-size: 22px; font-weight: 700; color: #1a1f36; letter-spacing: -0.5px; }
    .logo-text span { color: #2563EB; }
    .card { background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(37, 99, 235, 0.08), 0 1px 4px rgba(0,0,0,0.04); }
    .card-top-bar { height: 5px; background: linear-gradient(90deg, #2563EB 0%, #60a5fa 100%); }
    .card-body { padding: 44px 48px 40px; }
    .icon-circle { width: 64px; height: 64px; background: #EFF6FF; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; }
    .icon-circle svg { width: 30px; height: 30px; stroke: #2563EB; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    h1 { font-size: 26px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px; margin-bottom: 12px; }
    .intro { font-size: 15px; color: #4b5563; line-height: 1.65; margin-bottom: 32px; }
    .btn-wrapper { margin-bottom: 32px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #2563EB, #1d4ed8); color: #ffffff !important; text-decoration: none; font-size: 15px; font-weight: 600; padding: 15px 36px; border-radius: 12px; letter-spacing: 0.1px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35); }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 28px 0; }
    .link-fallback { font-size: 13px; color: #6b7280; line-height: 1.6; }
    .link-fallback a { color: #2563EB; text-decoration: none; font-family: 'DM Mono', monospace; font-size: 12px; word-break: break-all; }
    .expiry-notice { display: flex; align-items: flex-start; gap: 10px; background: #FFF7ED; border: 1px solid #fed7aa; border-radius: 10px; padding: 14px 16px; margin-top: 24px; }
    .expiry-notice svg { width: 18px; height: 18px; stroke: #ea580c; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; margin-top: 1px; }
    .expiry-notice p { font-size: 13px; color: #9a3412; line-height: 1.5; }
    .footer { text-align: center; margin-top: 28px; padding-bottom: 8px; }
    .footer p { font-size: 12.5px; color: #9ca3af; line-height: 1.7; }
    .footer a { color: #6b7280; text-decoration: none; }
    .footer .tagline { font-size: 12px; color: #c4c9d4; margin-top: 10px; letter-spacing: 0.3px; }
    @media (max-width: 480px) { .card-body { padding: 32px 24px 28px; } h1 { font-size: 22px; } }
  </style>
</head>
<body>
  <div class="wrapper">

    <div class="header">
      <div class="logo">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18"/>
          </svg>
        </div>
        <span class="logo-text">Booked<span>Jobs</span></span>
      </div>
    </div>

    <div class="card">
      <div class="card-top-bar"></div>
      <div class="card-body">

        <div class="icon-circle">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>

        <h1>Reset your password 🔑</h1>

        <p class="intro">
          Hey there! We got a request to reset the password for your BookedJobs account. No worries — it happens to the best of us! Just click the button below and you'll be back in action in no time.
        </p>

        <div class="btn-wrapper">
          <a href="${resetUrl}" class="btn">Reset My Password</a>
        </div>

        <hr class="divider" />

        <div class="link-fallback">
          <p>Button not working? Copy and paste this link into your browser:</p>
          <a href="${resetUrl}">${resetUrl}</a>
        </div>

        <div class="expiry-notice">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your account is secure.</p>
        </div>

      </div>
    </div>

    <div class="footer">
      <p>
        Need help? Contact us at <a href="mailto:support@karlsgas.ie">support@karlsgas.ie</a>
      </p>
      <p class="tagline">© 2026 BookedJobs · Karl's Gas · All rights reserved</p>
    </div>

  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use Supabase Admin API to generate a recovery link
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${APP_URL}/reset-password`,
      },
    });

    if (linkError) {
      console.error("Generate link error:", linkError);
      // Don't reveal if user exists or not — always return success
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build the confirmation URL from the token
    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      console.error("No action_link returned from generateLink");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = resetEmailHtml(actionLink);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "BookedJobs <onboarding@resend.dev>",
        to: [email],
        subject: "Reset Your Password — BookedJobs",
        html,
      }),
    });

    const resData = await res.json();

    if (!res.ok) {
      console.error("Resend API error:", resData);
      return new Response(JSON.stringify({ error: "Failed to send email", details: resData }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-reset-email error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
