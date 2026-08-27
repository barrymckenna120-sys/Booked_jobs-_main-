import { createClient } from "npm:@supabase/supabase-js@2";
import { isDenied, requireCallerOrg } from "../_shared/orgAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "null",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function buildHtml(orgName: string, actionLink: string): string {
  const safeOrg = orgName || "your team";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Your login link</title></head>
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
              <h2 style="margin:0 0 16px;font-size:20px;color:#0F172A;font-weight:700;">Welcome to BookedJobs</h2>
              <p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.6;">Hi there,</p>
              <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">
                You've been invited to join <strong>${safeOrg}</strong> on BookedJobs. Click the button below to log in — no password needed.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:8px 0 16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="#4A86E8" style="background:#4A86E8;border:1px solid #4A86E8;border-radius:6px;">
                          <a href="${actionLink}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">Log in to BookedJobs</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#64748b;line-height:1.5;">
                This link will expire shortly. If you didn't request it, you can safely ignore this email.
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Server misconfigured: missing Supabase env" }, 500);
    }
    if (!RESEND_API_KEY) {
      return json({ error: "Server misconfigured: missing RESEND_API_KEY" }, 500);
    }

    let body: { email?: string; org_name?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const email = (body.email || "").trim();
    const orgName = (body.org_name || "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Valid email is required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authorised workflow only: an admin/office user of a tenant, sending a
    // login link to a member of THEIR OWN tenant. Previously anyone could
    // trigger a magic link for any email address.
    const access = await requireCallerOrg(req, {
      fnName: "send-magic-link",
      cors: corsHeaders,
      roles: ["admin", "office", "superadmin"],
    });
    if (isDenied(access)) return access.error;

    const { data: targetProfile } = await admin
      .from("profiles")
      .select("user_id, organisation_id")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    const { data: targetEngineer } = await admin
      .from("engineers")
      .select("id, organisation_id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    const targetOrgId = (targetProfile as { organisation_id?: string } | null)?.organisation_id ??
      (targetEngineer as { organisation_id?: string } | null)?.organisation_id ?? null;

    if (!targetOrgId) {
      console.warn("send-magic-link: no team member found for the requested email");
      return json({ error: "No team member found for that email" }, 404);
    }
    if (access.role !== "superadmin" && targetOrgId !== access.orgId) {
      console.warn(
        `send-magic-link: caller org ${access.orgId} attempted a link for org ${targetOrgId}`,
      );
      return json({ error: "Forbidden" }, 403);
    }

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (error) {
      console.error("generateLink error:", error.message);
      return json({ error: error.message }, 500);
    }

    const actionLink = (data as any)?.properties?.action_link;
    if (!actionLink) {
      console.error("No action_link returned from generateLink");
      return json({ error: "Failed to generate magic link" }, 500);
    }

    const html = buildHtml(orgName, actionLink);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "BookedJobs <noreply@bookedjobs.ie>",
        to: [email],
        subject: "Your BookedJobs login link",
        html,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text().catch(() => "");
      console.error("Resend send failed:", resendRes.status, detail);
      return json({ error: `Email send failed (${resendRes.status})` }, 502);
    }

    console.log(`Magic link sent to ${email}`);
    return json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    console.error("send-magic-link error:", msg);
    return json({ error: msg }, 500);
  }
});
