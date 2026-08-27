// Shared helper for sending admin-facing alert emails via Resend.
//
// Recipients are always resolved server-side from the database, never taken
// from a request body, so a tampered client payload can't redirect mail.

// Platform owner alert recipients come from the same central config used for
// authorisation (PLATFORM_OWNER_EMAILS env var) — no hardcoded addresses here.
export const platformOwnerAlertEmails = (): string[] =>
  (Deno.env.get("PLATFORM_OWNER_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);


export const escapeHtml = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Every address that should receive an admin alert for `organisationId`:
 *   - all superadmins (any org)
 *   - admin / office / owner staff inside that organisation
 *   - the platform owner
 *
 * profiles has no email column, so profile rows are resolved through the auth
 * admin API. engineers carries its own email column and is where office-role
 * staff actually live, so both sources are merged. De-duplicated, lowercased.
 */
export async function resolveOrgAdminEmails(
  supabaseAdmin: any,
  organisationId: string | null,
): Promise<string[]> {
  const emails = new Set<string>();
  const userIds = new Set<string>();

  for (const e of platformOwnerAlertEmails()) emails.add(e);

  // --- profiles: superadmins anywhere ---
  const { data: superadmins, error: sadErr } = await supabaseAdmin
    .from("profiles")
    .select("user_id, is_active")
    .eq("role", "superadmin");
  if (sadErr) console.error("[notifyOrgAdmins] superadmin lookup failed:", sadErr);
  for (const p of superadmins ?? []) {
    if (p?.user_id && p.is_active !== false) userIds.add(p.user_id);
  }

  // --- profiles: admin/office inside the org ---
  if (organisationId) {
    const { data: orgProfiles, error: opErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, is_active")
      .eq("organisation_id", organisationId)
      .in("role", ["admin", "office", "owner", "manager"]);
    if (opErr) console.error("[notifyOrgAdmins] org profile lookup failed:", opErr);
    for (const p of orgProfiles ?? []) {
      if (p?.user_id && p.is_active !== false) userIds.add(p.user_id);
    }
  }

  // Resolve profile user_ids -> auth emails.
  for (const uid of userIds) {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(uid);
      if (error) {
        console.error(`[notifyOrgAdmins] getUserById(${uid}) failed:`, error.message);
        continue;
      }
      const email = data?.user?.email?.trim()?.toLowerCase();
      if (email && EMAIL_RE.test(email)) emails.add(email);
    } catch (_e) {
      const msg = _e instanceof Error ? _e.message : String(_e);
      console.error(`[notifyOrgAdmins] getUserById(${uid}) threw:`, msg);
    }
  }

  // --- engineers: admin/office/owner staff inside the org ---
  if (organisationId) {
    const { data: staff, error: stErr } = await supabaseAdmin
      .from("engineers")
      .select("email, role, status")
      .eq("organisation_id", organisationId)
      .in("role", ["admin", "office", "owner", "manager"])
      .eq("status", "active");
    if (stErr) console.error("[notifyOrgAdmins] engineer lookup failed:", stErr);
    for (const s of staff ?? []) {
      const email = s?.email?.trim()?.toLowerCase();
      if (email && EMAIL_RE.test(email)) emails.add(email);
    }
  }

  return [...emails];
}

/** Card-style shell matching the existing BookedJobs transactional emails. */
export function buildAdminEmailHtml(params: {
  title: string;
  heading: string;
  intro: string;
  rows: Array<[string, string]>;
  extraHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const detailRows = params.rows
    .map(
      ([label, value]) => `
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#64748B;width:150px;vertical-align:top;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">${escapeHtml(label)}</td>
              <td style="padding:6px 0;font-size:14px;color:#0F172A;font-weight:600;vertical-align:top;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">${escapeHtml(value)}</td>
            </tr>`,
    )
    .join("");

  const cta =
    params.ctaUrl && params.ctaLabel
      ? `
              <p style="margin:24px 0 0;">
                <a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;background:#4A86E8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">${escapeHtml(params.ctaLabel)}</a>
              </p>`
      : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(params.title)}</title></head>
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
              <h2 style="margin:0 0 12px;font-size:20px;color:#0F172A;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">${escapeHtml(params.heading)}</h2>
              <p style="margin:0 0 20px;font-size:15px;line-height:22px;color:#334155;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">${escapeHtml(params.intro)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;padding:8px 0;">
                ${detailRows}
              </table>
              ${params.extraHtml ?? ""}
              ${cta}
              <p style="margin:26px 0 0;font-size:12px;line-height:18px;color:#94A3B8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
                Automated notification from BookedJobs. You are receiving this because you hold an admin role.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>`;
}

/** One Resend POST to all recipients. Never throws. */
export async function sendAdminEmail(params: {
  subject: string;
  html: string;
  recipients: string[];
}): Promise<{ ok: boolean; skipped?: string; status?: number; recipients: string[] }> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.warn("[notifyOrgAdmins] RESEND_API_KEY not set — skipping email");
    return { ok: false, skipped: "no_api_key", recipients: params.recipients };
  }
  if (params.recipients.length === 0) {
    console.warn("[notifyOrgAdmins] no recipients resolved — skipping email");
    return { ok: false, skipped: "no_recipients", recipients: [] };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "BookedJobs <noreply@bookedjobs.ie>",
        to: params.recipients,
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[notifyOrgAdmins] Resend failed (${res.status}): ${detail}`);
      return { ok: false, status: res.status, recipients: params.recipients };
    }
    console.log(
      `[notifyOrgAdmins] sent "${params.subject}" to ${params.recipients.length} recipient(s)`,
    );
    return { ok: true, status: res.status, recipients: params.recipients };
  } catch (_e) {
    const msg = _e instanceof Error ? _e.message : String(_e);
    console.error("[notifyOrgAdmins] Resend threw:", msg);
    return { ok: false, recipients: params.recipients };
  }
}
