// Support report notification email (BJ-NEW-10).
//
// The support_reports row is the source of truth: it is written by the client
// under RLS *before* this function is called. This function only reads the
// stored row back server-side (never client-supplied identity or diagnostics)
// and emails it to the platform support address via Resend.
//
// Failure here must never affect the stored report — callers ignore the result.

import { createClient } from "npm:@supabase/supabase-js@2";
import { parseOwnerAllowlist } from "../_shared/platformAdminDecision.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DD/MM/YY HH:mm — project date convention. */
function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

type Row = Record<string, unknown>;

function row(label: string, value: unknown): string {
  const v = value === null || value === undefined || value === "" ? "—" : String(value);
  return `<tr>
    <td style="padding:6px 12px 6px 0;font-size:13px;color:#64748b;white-space:nowrap;vertical-align:top;">${esc(label)}</td>
    <td style="padding:6px 0;font-size:13px;color:#0F172A;vertical-align:top;">${esc(v)}</td>
  </tr>`;
}

function buildHtml(r: Row, orgName: string): string {
  const id = String(r.id ?? "");
  const type = String(r.report_type ?? "bug");
  const message = esc(String(r.message ?? "")).replace(/\n/g, "<br/>");
  const ua = r.user_agent ? String(r.user_agent) : "";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Support report</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f4" style="background:#f4f4f4;width:100%;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td align="center" bgcolor="#4A86E8" style="background:#4A86E8;padding:24px;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;">BookedJobs support report</span>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
            <tr><td bgcolor="#f1f5f9" style="background:#f1f5f9;border-radius:6px;padding:14px 18px;">
              <p style="margin:0 0 4px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">Report ID</p>
              <p style="margin:0;font-size:15px;color:#0F172A;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-weight:700;word-break:break-all;">${esc(id)}</p>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
            ${row("Organisation", orgName)}
            ${row("Type", type.charAt(0).toUpperCase() + type.slice(1))}
            ${row("Submitted by", r.submitted_by_name)}
            ${row("Role", r.submitted_by_role)}
            ${row("App", r.app === "engineer" ? "Engineer" : "Office")}
            ${row("Screen", r.screen)}
            ${row("Route", r.route)}
            ${row("Submitted", fmt(r.created_at as string | null))}
          </table>

          <p style="margin:0 0 6px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">Message</p>
          <p style="margin:0 0 24px;font-size:15px;color:#0F172A;line-height:1.6;">${message}</p>

          <p style="margin:0 0 6px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">Environment</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${row("Device", r.device_type)}
            ${row("OS", r.os)}
            ${row("Browser", [r.browser, r.browser_version].filter(Boolean).join(" ") || null)}
            ${row("Viewport", r.viewport)}
            ${row("App version", r.app_version)}
            ${row("Connection", r.is_online === false ? "Offline" : "Online")}
          </table>

          ${
            ua
              ? `<p style="margin:20px 0 0;font-size:11px;color:#94a3b8;line-height:1.5;word-break:break-all;">${esc(ua)}</p>`
              : ""
          }
          <p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">Open the Support Reports tab in the admin panel and search this Report ID to view the stored record.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace(/^Bearer\s+/i, "");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: { user: caller }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !caller) return json({ error: "Unauthorized" }, 401);

    let body: { report_id?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const reportId = (body.report_id || "").trim();
    if (!UUID_RE.test(reportId)) return json({ error: "Valid report_id is required" }, 400);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Trust only what is stored. The caller must be the submitter of this row.
    const { data: report, error: readError } = await supabaseAdmin
      .from("support_reports")
      .select("*")
      .eq("id", reportId)
      .maybeSingle();

    if (readError) {
      console.error("notify-support-report: read failed", readError.message);
      return json({ error: "Report lookup failed" }, 500);
    }
    if (!report) return json({ error: "Report not found" }, 404);
    if ((report as Row).submitted_by !== caller.id) {
      console.warn(`notify-support-report: caller ${caller.id} is not the submitter of ${reportId}`);
      return json({ error: "Forbidden" }, 403);
    }

    let orgName = "Unknown organisation";
    const orgId = (report as Row).organisation_id as string | null;
    if (orgId) {
      const { data: org } = await supabaseAdmin
        .from("organisations")
        .select("name")
        .eq("id", orgId)
        .maybeSingle();
      orgName = (org as { name?: string } | null)?.name || orgId;
    }

    const recipients = parseOwnerAllowlist(
      Deno.env.get("SUPPORT_NOTIFICATION_EMAIL") ?? Deno.env.get("PLATFORM_OWNER_EMAILS"),
    );
    if (recipients.length === 0) {
      console.warn("notify-support-report: no support recipient configured — skipping email");
      return json({ success: false, skipped: "no_recipient" });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.warn("notify-support-report: RESEND_API_KEY not set — skipping email");
      return json({ success: false, skipped: "no_api_key" });
    }

    const type = String((report as Row).report_type ?? "bug");
    const subject = `[BookedJobs ${type}] ${orgName} — ${String((report as Row).message ?? "").slice(0, 60)}`;

    const resendRes = await fetch("https://api.resend.com/emails-forced-failure-test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "BookedJobs <noreply@bookedjobs.ie>",
        to: recipients,
        subject,
        html: buildHtml(report as Row, orgName),
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text().catch(() => "");
      console.error(
        `notify-support-report: Resend send failed for report ${reportId} — ${resendRes.status} ${detail}`,
      );
      // The stored report stays untouched; the submitter still succeeded.
      return json({ success: false, error: `Email send failed (${resendRes.status})` }, 200);
    }

    console.log(`notify-support-report: emailed report ${reportId} to ${recipients.length} recipient(s)`);
    return json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    console.error("notify-support-report error:", msg);
    return json({ error: msg }, 500);
  }
});
