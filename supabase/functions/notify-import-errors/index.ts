import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildAdminEmailHtml,
  escapeHtml,
  resolveOrgAdminEmails,
  sendAdminEmail,
} from "../_shared/notifyOrgAdmins.ts";
import { crossTenantDenied, isAdminDenied, requireAdminCaller } from "../_shared/adminAuth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";


const MAX_LISTED_ROWS = 20;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // Verified JWT -> trusted role/org loaded server-side. Tenant admins stay
    // inside their own organisation; only platform admins cross tenants.
    const caller = await requireAdminCaller(req, {
      fnName: "notify-import-errors",
      cors: corsHeaders,
    });
    if (isAdminDenied(caller)) return caller.error;

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

    // Target org comes from the stored import run, never the request body.
    const runOrgId = (run as any).organisation_id ?? null;
    const blocked = crossTenantDenied(
      caller,
      runOrgId,
      corsHeaders,
      "notify-import-errors",
    );
    if (blocked) return blocked;


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
