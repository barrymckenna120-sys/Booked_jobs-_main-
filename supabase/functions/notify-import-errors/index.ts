import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildAdminEmailHtml,
  escapeHtml,
  PLATFORM_OWNER_EMAILS,
  resolveOrgAdminEmails,
  sendAdminEmail,
} from "../_shared/notifyOrgAdmins.ts";

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

const MAX_LISTED_ROWS = 20;

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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const runId: string | undefined = body?.runId;
    if (!runId) return json({ error: "runId is required" }, 400);

    // The stored row is the source of truth — counts and org come from the DB,
    // never from the request body.
    const { data: run, error: runErr } = await supabaseAdmin
      .from("import_runs")
      .select(
        "id, organisation_id, filename, imported_by, created_at, total_rows, created_count, updated_count, error_count, row_details",
      )
      .eq("id", runId)
      .maybeSingle();

    if (runErr) {
      console.error("[notify-import-errors] run lookup failed:", runErr);
      return json({ error: "Failed to load import run" }, 500);
    }
    if (!run) return json({ error: "Import run not found" }, 404);

    // Caller must belong to the run's org (superadmin / platform owner bypass).
    const callerEmail = caller.email?.toLowerCase() ?? "";
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role, organisation_id")
      .eq("user_id", caller.id)
      .maybeSingle();

    const bypassOrgCheck =
      PLATFORM_OWNER_EMAILS.includes(callerEmail) ||
      (callerProfile as any)?.role === "superadmin";
    const callerOrgId = (callerProfile as any)?.organisation_id ?? null;
    const runOrgId = (run as any).organisation_id ?? null;

    if (!bypassOrgCheck && (!callerOrgId || !runOrgId || callerOrgId !== runOrgId)) {
      return json({ error: "Cross-tenant action not permitted" }, 403);
    }

    const errorCount = Number((run as any).error_count ?? 0);
    if (errorCount <= 0) {
      return json({ success: true, skipped: "no_errors" });
    }

    // Organisation name + importer name.
    const { data: org } = await supabaseAdmin
      .from("organisations")
      .select("name")
      .eq("id", runOrgId)
      .maybeSingle();
    const orgName = (org as any)?.name ?? "Unknown organisation";

    const { data: importer } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("user_id", (run as any).imported_by)
      .maybeSingle();
    const importerName = (importer as any)?.display_name ?? "—";

    const details = Array.isArray((run as any).row_details) ? (run as any).row_details : [];
    const failed = details.filter((d: any) => d?.outcome === "failed");
    const listed = failed.slice(0, MAX_LISTED_ROWS);
    const remaining = failed.length - listed.length;

    const failedList = listed
      .map(
        (d: any) =>
          `<li style="margin:0 0 6px;font-size:13px;line-height:19px;color:#334155;">Row ${escapeHtml(String(d?.row_number ?? "?"))} — ${escapeHtml(d?.error_message ?? "Unknown error")}</li>`,
      )
      .join("");

    const extraHtml = `
              <h3 style="margin:22px 0 8px;font-size:15px;color:#0F172A;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">Failed rows</h3>
              <ul style="margin:0;padding:0 0 0 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
                ${failedList || '<li style="font-size:13px;color:#334155;">No per-row detail recorded.</li>'}
              </ul>
              ${remaining > 0 ? `<p style="margin:8px 0 0;font-size:13px;color:#64748B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">+${remaining} more not listed.</p>` : ""}`;

    const appOrigin = Deno.env.get("APP_ORIGIN") ?? "https://karlsgas.lovable.app";
    const html = buildAdminEmailHtml({
      title: "Customer import completed with errors",
      heading: "Customer import completed with errors",
      intro: `${errorCount} of ${(run as any).total_rows} row(s) could not be imported. The rest of the file was imported normally.`,
      rows: [
        ["File", (run as any).filename ?? "unknown"],
        ["Organisation", orgName],
        ["Imported by", importerName],
        ["Total rows", String((run as any).total_rows ?? 0)],
        ["Created", String((run as any).created_count ?? 0)],
        ["Updated", String((run as any).updated_count ?? 0)],
        ["Errors", String(errorCount)],
        [
          "When",
          new Date((run as any).created_at ?? Date.now()).toLocaleString("en-IE", {
            timeZone: "Europe/Dublin",
          }),
        ],
      ],
      extraHtml,
      ctaLabel: "View recent imports",
      ctaUrl: `${appOrigin}/import-customers`,
    });

    const recipients = await resolveOrgAdminEmails(supabaseAdmin, runOrgId);
    const result = await sendAdminEmail({
      subject: `Import errors — ${(run as any).filename ?? "customer import"} (${errorCount})`,
      html,
      recipients,
    });

    return json({
      success: true,
      emailed: result.ok,
      skipped: result.skipped,
      recipient_count: recipients.length,
      error_count: errorCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    console.error("notify-import-errors error:", msg);
    return json({ error: msg }, 500);
  }
});
