// Tour feedback alert email. The onboarding_feedback row (written by the client
// under RLS) is the source of truth; this function reads it back with the
// service role and emails the platform owner once. Never affects the save.
import { createClient } from "npm:@supabase/supabase-js@2";
import { escapeHtml, platformOwnerAlertEmails, sendAdminEmail } from "../_shared/notifyOrgAdmins.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    let body: { feedback_id?: unknown } = {};
    try { body = await req.json(); } catch (_e) { return json({ error: "Invalid JSON" }, 400); }
    const id = typeof body.feedback_id === "string" ? body.feedback_id : "";
    if (!UUID_RE.test(id)) return json({ error: "feedback_id must be a UUID" }, 400);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: row, error: rowErr } = await admin
      .from("onboarding_feedback")
      .select("id, user_id, organisation_id, role, tour_type, device, rating, clarity, comment, is_replay, notified_at")
      .eq("id", id)
      .maybeSingle();
    if (rowErr) return json({ error: "Lookup failed" }, 500);
    if (!row || row.user_id !== user.id) return json({ error: "Not found" }, 404);

    const hasComment = typeof row.comment === "string" && row.comment.trim().length > 0;
    if (!((row.rating ?? 5) <= 3 || hasComment)) return json({ sent: false, reason: "not_notifiable" });
    if (row.notified_at) return json({ sent: false, reason: "already_notified" });

    // Claim first so concurrent/repeat calls can't both send.
    const { data: claimed, error: claimErr } = await admin
      .from("onboarding_feedback")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", id)
      .is("notified_at", null)
      .select("id");
    if (claimErr) return json({ error: "Claim failed" }, 500);
    if (!claimed || claimed.length === 0) return json({ sent: false, reason: "already_notified" });

    const { data: org } = await admin.from("organisations").select("name").eq("id", row.organisation_id).maybeSingle();
    const tenant = org?.name ?? "Unknown tenant";
    const clarity = row.clarity === true ? "Yes" : row.clarity === false ? "No" : "—";
    const line = (k: string, v: string) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px">${escapeHtml(k)}</td><td style="padding:4px 0;font-size:13px;color:#0F172A">${escapeHtml(v)}</td></tr>`;
    const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif">
<h2 style="font-size:16px">Tour feedback: ${row.rating}★</h2>
<table>${line("Tenant", tenant)}${line("Role", row.role ?? "—")}${line("Tour", row.tour_type)}${line("Device", row.device ?? "—")}${line("Rating", `${row.rating} / 5`)}${line("Easy to follow", clarity)}${line("Replay", row.is_replay ? "Yes" : "No")}</table>
<p style="font-size:13px;color:#0F172A;white-space:pre-wrap">${hasComment ? escapeHtml(row.comment) : "<em>No comment</em>"}</p>
</body></html>`;

    const result = await sendAdminEmail({
      subject: `Tour feedback: ${row.rating}★ from ${tenant}`,
      html,
      recipients: platformOwnerAlertEmails(),
    });
    if (!result.ok) {
      await admin.from("onboarding_feedback").update({ notified_at: null }).eq("id", id);
      return json({ sent: false, reason: result.skipped ?? `send_failed_${result.status ?? ""}` }, 502);
    }
    return json({ sent: true });
  } catch (e) {
    console.error("[notify-tour-feedback] error", e instanceof Error ? e.message : e);
    return json({ error: "Internal error" }, 500);
  }
});
