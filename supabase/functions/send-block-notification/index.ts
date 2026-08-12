import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-org-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function buildHtml(orgName: string, reason: string): string {
  const safeOrg = escapeHtml(orgName || "your organisation");
  const safeReason = escapeHtml(reason || "").replace(/\n/g, "<br/>");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Access suspended</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f4" style="background:#f4f4f4;width:100%;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td align="center" bgcolor="#4A86E8" style="background:#4A86E8;padding:28px 24px;">
              <span style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:0.3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">BookedJobs</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;font-size:20px;color:#0F172A;font-weight:700;">Access suspended</h2>
              <p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.6;">Hi there,</p>
              <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
                Your access to <strong>${safeOrg}</strong> on BookedJobs has been temporarily suspended.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
                <tr>
                  <td bgcolor="#f1f5f9" style="background:#f1f5f9;border-radius:6px;padding:16px 18px;">
                    <p style="margin:0 0 6px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;font-weight:600;">Reason</p>
                    <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;font-style:italic;">${safeReason}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">
                Please contact us at <a href="mailto:support@bookedjobs.ie" style="color:#4A86E8;text-decoration:none;">support@bookedjobs.ie</a> to resolve this.
              </p>
              <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">BookedJobs · Manage jobs, quotes, and customers in one place.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return json({ error: "Server misconfigured: missing RESEND_API_KEY" }, 500);
    }

    let body: { email?: string; org_name?: string; reason?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const email = (body.email || "").trim();
    const orgName = (body.org_name || "").trim();
    const reason = (body.reason || "").trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Valid email is required" }, 400);
    }
    if (!reason || reason.length < 10) {
      return json({ error: "Reason is required (min 10 chars)" }, 400);
    }

    const html = buildHtml(orgName, reason);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "BookedJobs <noreply@bookedjobs.ie>",
        to: [email],
        subject: "Your BookedJobs access has been suspended",
        html,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text().catch(() => "");
      console.error("Resend send failed:", resendRes.status, detail);
      return json({ error: `Email send failed (${resendRes.status})` }, 502);
    }

    console.log(`Block notification sent to ${email}`);
    return json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    console.error("send-block-notification error:", msg);
    return json({ error: msg }, 500);
  }
});
