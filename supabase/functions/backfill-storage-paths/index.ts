// One-shot admin function used to migrate legacy flat storage paths into
// org-scoped folders after the Stage-2 generator rework.
//
// Modes:
//   { dry_run: true }  -> report only, no writes, no storage.move()
//   { dry_run: false } -> actually move objects and rewrite pdf_url columns
//
// Auth: caller must present a service-role Authorization header. Do NOT
// expose this function to end users.
//
// Scope tables & buckets:
//   certificates            -> certificates bucket (pdf_url)
//   hazard_notifications    -> certificates bucket (pdf_url)
//   service_calls           -> certificates bucket (receipt_pdf_url)
//   quotes                  -> quote-pdfs bucket   (pdf_url)
//   invoices                -> quote-pdfs bucket   (pdf_url)

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface TableSpec {
  table: string;
  urlColumn: string;
  bucket: "certificates" | "quote-pdfs";
}

const SPECS: TableSpec[] = [
  { table: "certificates",         urlColumn: "pdf_url",         bucket: "certificates" },
  { table: "hazard_notifications", urlColumn: "pdf_url",         bucket: "certificates" },
  { table: "service_calls",        urlColumn: "receipt_pdf_url", bucket: "certificates" },
  { table: "quotes",               urlColumn: "pdf_url",         bucket: "quote-pdfs" },
  { table: "invoices",             urlColumn: "pdf_url",         bucket: "quote-pdfs" },
];

function extractPath(bucket: string, stored: string): string | null {
  if (!stored) return null;
  const publicMarker = `/storage/v1/object/public/${bucket}/`;
  const signMarker = `/storage/v1/object/sign/${bucket}/`;
  const idxPublic = stored.indexOf(publicMarker);
  if (idxPublic !== -1) return stored.slice(idxPublic + publicMarker.length).split("?")[0];
  const idxSign = stored.indexOf(signMarker);
  if (idxSign !== -1) return stored.slice(idxSign + signMarker.length).split("?")[0];
  return stored.replace(/^\/+/, "");
}

interface RowPlan {
  table: string;
  id: string;
  organisation_id: string | null;
  currentValue: string;
  currentPath: string;
  targetPath: string;
  bucket: string;
  action: "move" | "skip_already_scoped" | "skip_no_org" | "skip_empty";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Auth guard: caller must be service role OR an authenticated superadmin.
    const auth = req.headers.get("authorization") || "";
    let authorized = auth.includes(serviceKey);
    if (!authorized && auth.startsWith("Bearer ")) {
      const token = auth.slice(7);
      const { data: claimsData } = await sb.auth.getClaims(token);
      const uid = claimsData?.claims?.sub;
      if (uid) {
        const { data: prof } = await sb.from("profiles").select("role").eq("user_id", uid).maybeSingle();
        if (prof?.role === "superadmin") authorized = true;
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run !== false; // default = dry run
    const onlyTable: string | null = body?.only_table || null;

    const plans: RowPlan[] = [];
    const summary: Record<string, {
      total: number;
      to_move: number;
      already_scoped: number;
      skipped_no_org: number;
      skipped_empty: number;
      moved: number;
      move_errors: number;
    }> = {};

    for (const spec of SPECS) {
      if (onlyTable && spec.table !== onlyTable) continue;

      summary[spec.table] = {
        total: 0, to_move: 0, already_scoped: 0,
        skipped_no_org: 0, skipped_empty: 0, moved: 0, move_errors: 0,
      };

      // Page through all rows with a non-null url column
      const pageSize = 1000;
      let from = 0;
      // deno-lint-ignore no-constant-condition
      while (true) {
        const { data: rows, error } = await sb
          .from(spec.table)
          .select(`id, organisation_id, ${spec.urlColumn}`)
          .not(spec.urlColumn, "is", null)
          .range(from, from + pageSize - 1);

        if (error) {
          return new Response(JSON.stringify({ error: `read ${spec.table} failed: ${error.message}` }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!rows || rows.length === 0) break;

        for (const r of rows as any[]) {
          summary[spec.table].total++;
          const currentValue = String(r[spec.urlColumn] || "").trim();
          if (!currentValue) {
            summary[spec.table].skipped_empty++;
            continue;
          }
          const currentPath = extractPath(spec.bucket, currentValue);
          if (!currentPath) {
            summary[spec.table].skipped_empty++;
            continue;
          }

          const orgId = r.organisation_id as string | null;
          if (!orgId) {
            summary[spec.table].skipped_no_org++;
            plans.push({
              table: spec.table, id: r.id, organisation_id: null,
              currentValue, currentPath, targetPath: currentPath,
              bucket: spec.bucket, action: "skip_no_org",
            });
            continue;
          }

          const orgPrefix = `${orgId}/`;
          if (currentPath.startsWith(orgPrefix)) {
            summary[spec.table].already_scoped++;
            continue;
          }

          // Take the basename (last segment) and re-scope under org folder.
          // If the object already lived under some other folder (e.g. a
          // user_id prefix for quotes/invoices), we still normalise to
          // <org_id>/<basename>.
          const basename = currentPath.split("/").pop() || currentPath;
          const targetPath = `${orgId}/${basename}`;

          summary[spec.table].to_move++;
          plans.push({
            table: spec.table, id: r.id, organisation_id: orgId,
            currentValue, currentPath, targetPath,
            bucket: spec.bucket, action: "move",
          });
        }

        if (rows.length < pageSize) break;
        from += pageSize;
      }
    }

    if (dryRun) {
      const movePlans = plans.filter(p => p.action === "move");
      return new Response(JSON.stringify({
        dry_run: true,
        summary,
        total_rows_to_move: movePlans.length,
        total_rows_skipped_no_org: plans.filter(p => p.action === "skip_no_org").length,
        sample: movePlans.slice(0, 10),
      }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Actual move phase
    const errors: Array<{ table: string; id: string; error: string }> = [];
    for (const p of plans) {
      if (p.action !== "move") continue;
      try {
        const { error: mvErr } = await sb.storage
          .from(p.bucket)
          .move(p.currentPath, p.targetPath);
        if (mvErr) {
          // If target already exists we treat it as OK and just rewrite pdf_url
          const msg = String(mvErr.message || "");
          if (!/exists|duplicate/i.test(msg)) {
            summary[p.table].move_errors++;
            errors.push({ table: p.table, id: p.id, error: msg });
            continue;
          }
        }

        const spec = SPECS.find(s => s.table === p.table)!;
        const { error: updErr } = await sb
          .from(p.table)
          .update({ [spec.urlColumn]: p.targetPath })
          .eq("id", p.id);
        if (updErr) {
          summary[p.table].move_errors++;
          errors.push({ table: p.table, id: p.id, error: `update failed: ${updErr.message}` });
          continue;
        }
        summary[p.table].moved++;
      } catch (e) {
        summary[p.table].move_errors++;
        errors.push({ table: p.table, id: p.id, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({
      dry_run: false,
      summary,
      errors_sample: errors.slice(0, 20),
      total_errors: errors.length,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[backfill-storage-paths] fatal:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
