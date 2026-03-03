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

    body {
      background-color: #F0F4FF;
      font-family: 'DM Sans', sans-serif;
      color: #1a1f36;
      padding: 40px 16px;
    }

    .wrapper {
      max-width: 560px;
      margin: 0 auto;
    }

    /* Header */
    .header {
      text-align: center;
      margin-bottom: 24px;
    }

    .logo {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }

    .logo-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #2563EB, #1d4ed8);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo-icon svg {
      width: 22px;
      height: 22px;
      fill: white;
    }

    .logo-text {
      font-size: 22px;
      font-weight: 700;
      color: #1a1f36;
      letter-spacing: -0.5px;
    }

    .logo-text span {
      color: #2563EB;
    }

    /* Card */
    .card {
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(37, 99, 235, 0.08), 0 1px 4px rgba(0,0,0,0.04);
    }

    .card-top-bar {
      height: 5px;
      background: linear-gradient(90deg, #2563EB 0%, #60a5fa 100%);
    }

    .card-body {
      padding: 44px 48px 40px;
    }

    /* Icon circle */
    .icon-circle {
      width: 64px;
      height: 64px;
      background: #EFF6FF;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
    }

    .icon-circle svg {
      width: 30px;
      height: 30px;
      stroke: #2563EB;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    h1 {
      font-size: 26px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.5px;
      margin-bottom: 12px;
    }

    .intro {
      font-size: 15px;
      color: #4b5563;
      line-height: 1.65;
      margin-bottom: 32px;
    }

    /* Button */
    .btn-wrapper {
      margin-bottom: 32px;
    }

    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #2563EB, #1d4ed8);
      color: #ffffff !important;
      text-decoration: none;
      font-size: 15px;
      font-weight: 600;
      padding: 15px 36px;
      border-radius: 12px;
      letter-spacing: 0.1px;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
      transition: all 0.2s;
    }

    /* Divider */
    .divider {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 28px 0;
    }

    /* Link fallback */
    .link-fallback {
      font-size: 13px;
      color: #6b7280;
      line-height: 1.6;
    }

    .link-fallback a {
      color: #2563EB;
      text-decoration: none;
      font-family: 'DM Mono', monospace;
      font-size: 12px;
      word-break: break-all;
    }

    /* Expiry notice */
    .expiry-notice {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      background: #FFF7ED;
      border: 1px solid #fed7aa;
      border-radius: 10px;
      padding: 14px 16px;
      margin-top: 24px;
    }

    .expiry-notice svg {
      width: 18px;
      height: 18px;
      stroke: #ea580c;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .expiry-notice p {
      font-size: 13px;
      color: #9a3412;
      line-height: 1.5;
    }

    /* Footer */
    .footer {
      text-align: center;
      margin-top: 28px;
      padding-bottom: 8px;
    }

    .footer p {
      font-size: 12.5px;
      color: #9ca3af;
      line-height: 1.7;
    }

    .footer a {
      color: #6b7280;
      text-decoration: none;
    }

    .footer .tagline {
      font-size: 12px;
      color: #c4c9d4;
      margin-top: 10px;
      letter-spacing: 0.3px;
    }

    @media (max-width: 480px) {
      .card-body { padding: 32px 24px 28px; }
      h1 { font-size: 22px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">

    <!-- Logo Header -->
    <div class="header">
      <img src="data:image/jpeg;base64,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" alt="BookedJobs" style="height:40px; width:auto; display:block;" />
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
          <a href="\${resetUrl}" class="btn">Reset My Password</a>
        </div>

        <hr class="divider" />

        <div class="link-fallback">
          <p>Button not working? Copy and paste this link into your browser:</p>
          <a href="\${resetUrl}">\${resetUrl}</a>
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
    });

    if (linkError) {
      console.error("Generate link error:", linkError);
      // Don't reveal if user exists or not — always return success
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the OTP token directly — bypass Supabase redirect to avoid 404s
    const otp = linkData?.properties?.email_otp;
    if (!otp) {
      console.error("No email_otp returned from generateLink");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build a direct link to the app with token and email as query params
    const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(otp)}&email=${encodeURIComponent(email)}`;

    const html = resetEmailHtml(resetUrl);

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
