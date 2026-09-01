/**
 * BJ-0131 Phase 2 — commit-customer-import
 *
 * Applies the operator's reviewed import decisions server-side. The browser no
 * longer writes customers: it sends rows plus decisions, and this function
 * re-derives the organisation, re-runs duplicate matching against current
 * database state, and only then writes.
 *
 * Preview tampering is designed out rather than checked for: the customer a row
 * is allowed to touch is the one THIS function found inside the caller's own
 * organisation. A `target_customer_id` supplied by the caller is treated purely
 * as a claim to verify — if it does not resolve inside the caller's organisation
 * the row fails and nothing is written for it, so a cross-tenant customer id
 * cannot be injected by editing the payload.
 *
 * Atomicity: writes are intentionally NOT wrapped in a single transaction. The
 * contract of this screen is per-row outcomes (created / merged / skipped /
 * failed), and a run where 900 of 1000 rows succeed must keep those 900 and
 * report the 100 honestly — a transaction would discard them. Each row is one
 * self-contained statement, so a mid-run failure cannot leave a half-written
 * customer.
 *
 * Audit ordering (BJ-0131 hardening): an `import_runs` shell row is inserted
 * BEFORE any customer write and updated with the observed outcomes afterwards.
 * If the function dies midway, or the final update fails, the shell row remains
 * as evidence that the import happened. An incomplete run is recognisable from
 * the existing schema alone — `row_details` is still `[]` and the counts are
 * still 0 while `total_rows` is non-zero — so no status column was added and no
 * unprocessed row is ever recorded as successful.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders, handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { isDenied, requireAuthenticatedUser, requireBoundOrg } from "../_shared/orgAuth.ts";
import {
  buildMergePayload,
  matchExistingCustomers,
  type ExistingCustomerLite,
} from "../_shared/importDuplicates.ts";
import {
  ambiguousReason,
  buildInsertPayload,
  exclusionReason,
  hasRequiredFields,
  type ImportRowDetail,
  rejectedFields,
  sanitiseImportRow,
  summariseOutcomes,
} from "../_shared/importCustomerRow.ts";

const FN = "commit-customer-import";
const IMPORT_ROLES = ["admin", "office", "superadmin"];
const MAX_ROWS = 20000;
const CHUNK = 200;

type IncomingRow = {
  rowNum: number;
  data?: Record<string, unknown>;
  isValid?: boolean;
  selected?: boolean;
  /** Operator-visible duplicate group, used only for the exclusion wording. */
  groupRowNums?: number[];
  /** Claim to verify, never trusted. */
  target_customer_id?: string | null;
};

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return handlePreflight();
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405, headers: cors });
  }

  const authed = await requireAuthenticatedUser(req, { fnName: FN, cors });
  if ("error" in authed) return authed.error;

  let body: {
    rows?: unknown;
    filename?: unknown;
    excludedRowNums?: unknown;
    decisions?: unknown;
    organisation_id?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, { status: 400, headers: cors });
  }

  const access = await requireBoundOrg(req, {
    fnName: FN,
    cors,
    requestedOrgId: typeof body.organisation_id === "string" ? body.organisation_id : null,
  });
  if (isDenied(access)) return access.error;
  if (access.kind !== "user") {
    return jsonResponse({ error: "Unauthorized" }, { status: 401, headers: cors });
  }
  if (!IMPORT_ROLES.includes(String(access.role ?? ""))) {
    console.warn(`${FN}: role ${access.role ?? "none"} may not commit imports`);
    return jsonResponse({ error: "Forbidden" }, { status: 403, headers: cors });
  }
  const orgId = access.orgId;
  const userId = access.userId!;

  const rawRows = Array.isArray(body.rows) ? (body.rows as IncomingRow[]) : null;
  if (!rawRows) {
    return jsonResponse({ error: "rows must be an array" }, { status: 400, headers: cors });
  }
  if (rawRows.length > MAX_ROWS) {
    return jsonResponse({ error: `too many rows (max ${MAX_ROWS})` }, { status: 400, headers: cors });
  }

  const excluded = new Set<number>(
    (Array.isArray(body.excludedRowNums) ? body.excludedRowNums : [])
      .map((n: unknown) => Number(n))
      .filter((n) => Number.isFinite(n)),
  );
  const decisionsIn = (body.decisions ?? {}) as Record<string, unknown>;
  const decisionFor = (rowNum: number): "skip" | "merge" =>
    decisionsIn[String(rowNum)] === "merge" ? "merge" : "skip";

  const rows = rawRows
    .filter((r) => Number.isFinite(Number(r?.rowNum)))
    .map((r) => ({
      rowNum: Number(r.rowNum),
      cleaned: sanitiseImportRow(r.data),
      dropped: rejectedFields(r.data),
      isValid: r.isValid !== false,
      selected: r.selected !== false,
      groupRowNums: Array.isArray(r.groupRowNums) ? r.groupRowNums.map(Number) : [],
      claimedTarget: typeof r.target_customer_id === "string" ? r.target_customer_id : null,
    }));
  for (const r of rows) {
    if (r.dropped.length > 0) {
      console.warn(`${FN}: row ${r.rowNum} — ignored non-importable fields: ${r.dropped.join(", ")}`);
    }
  }

  const supabase = serviceClient();

  // --- Re-run matching against current state, inside this organisation only ---
  const keys = { phone: new Set<string>(), gprn: new Set<string>(), eircode: new Set<string>() };
  for (const r of rows) {
    for (const col of ["phone", "gprn", "eircode"] as const) {
      const v = String(r.cleaned[col] ?? "").trim();
      if (v) keys[col].add(v);
    }
  }
  const fullById = new Map<string, Record<string, unknown>>();
  try {
    for (const column of ["phone", "gprn", "eircode"] as const) {
      const values = Array.from(keys[column]);
      for (let i = 0; i < values.length; i += CHUNK) {
        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("organisation_id", orgId)
          .in(column, values.slice(i, i + CHUNK));
        if (error) throw error;
        for (const c of data ?? []) fullById.set(c.id as string, c as Record<string, unknown>);
      }
    }
  } catch (_e) {
    console.error(`${FN}: candidate lookup failed:`, _e);
    return jsonResponse({ error: "lookup_failed" }, { status: 500, headers: cors });
  }
  const existing: ExistingCustomerLite[] = Array.from(fullById.values()).map((c) => ({
    id: c.id as string,
    name: (c.name as string) ?? null,
    address: (c.address as string) ?? null,
    eircode: (c.eircode as string) ?? null,
    phone: (c.phone as string) ?? null,
    gprn: (c.gprn as string) ?? null,
  }));

  const details: ImportRowDetail[] = [];
  const failedRows: { name: string; reason: string }[] = [];
  /** Mutations of pre-existing customers — the entries worth their own audit row. */
  const mutations: { rowNum: number; customerId: string; fields: string[] }[] = [];
  const rowLabel = (r: typeof rows[number]) =>
    String(r.cleaned.name ?? "").trim() || `Row ${r.rowNum}`;

  const matchesFor = (r: typeof rows[number]) => matchExistingCustomers(r.cleaned, existing);

  // Partition exactly as the review screen did: ambiguous rows never enter the
  // write loop, excluded rows are logged but never written, and only rows the
  // operator left selected and valid are committed.
  const ambiguous = rows.filter((r) => matchesFor(r).length > 1);
  const ambiguousSet = new Set(ambiguous.map((r) => r.rowNum));
  const selectedReady = rows.filter(
    (r) => r.isValid && r.selected && !ambiguousSet.has(r.rowNum),
  );
  const excludedRows = selectedReady.filter((r) => excluded.has(r.rowNum));
  const committable = selectedReady.filter((r) => !excluded.has(r.rowNum));

  for (const r of ambiguous) {
    const reason = ambiguousReason(matchesFor(r).length);
    failedRows.push({ name: rowLabel(r), reason });
    details.push({ row_number: r.rowNum, outcome: "skipped_ambiguous", customer_id: null, error_message: reason });
  }

  for (const r of excludedRows) {
    details.push({
      row_number: r.rowNum,
      outcome: "excluded_duplicate",
      customer_id: null,
      error_message: exclusionReason(r.rowNum, r.groupRowNums),
    });
  }

  for (const r of committable) {
    try {
      if (!hasRequiredFields(r.cleaned)) {
        throw new Error("Missing required fields (name, phone, address, eircode)");
      }

      const matches = matchesFor(r);

      // Verify the caller's claim, if any. The claim can only ever narrow to a
      // customer this function already found inside the caller's organisation.
      if (r.claimedTarget) {
        const claimIsOurs = fullById.has(r.claimedTarget);
        const claimIsTheMatch = matches.length === 1 && matches[0].customer.id === r.claimedTarget;
        if (!claimIsOurs || !claimIsTheMatch) {
          console.warn(
            `${FN}: row ${r.rowNum} — rejected target_customer_id ${r.claimedTarget} ` +
              `(in-org: ${claimIsOurs}, matches row: ${claimIsTheMatch}) for org ${orgId}`,
          );
          throw new Error("Target customer is not a valid match in this organisation");
        }
      }

      if (matches.length === 1) {
        const targetId = matches[0].customer.id;
        const target = fullById.get(targetId);
        // Belt and braces: the row must still exist and still be ours.
        if (!target || (target.organisation_id as string) !== orgId) {
          throw new Error("Target customer is not a valid match in this organisation");
        }

        if (decisionFor(r.rowNum) === "skip") {
          details.push({
            row_number: r.rowNum,
            outcome: "skipped_existing",
            customer_id: targetId,
            error_message: "Existing customer kept unchanged (Skip)",
          });
          continue;
        }

        const mergePayload = buildMergePayload(r.cleaned, target);
        if (Object.keys(mergePayload).length === 0) {
          details.push({
            row_number: r.rowNum,
            outcome: "skipped_existing",
            customer_id: targetId,
            error_message: "Nothing new to merge — existing record already complete",
          });
          continue;
        }

        const { error } = await supabase
          .from("customers")
          .update(mergePayload)
          .eq("id", targetId)
          .eq("organisation_id", orgId);
        if (error) throw error;
        const fields = Object.keys(mergePayload);
        mutations.push({ rowNum: r.rowNum, customerId: targetId, fields });
        details.push({
          row_number: r.rowNum,
          outcome: "merged",
          customer_id: targetId,
          error_message: `Merged fields: ${fields.join(", ")}`,
        });
        continue;
      }

      // No match — re-check by phone immediately before inserting so a customer
      // created since the preview cannot be duplicated by this run.
      const { data: raceRows, error: raceError } = await supabase
        .from("customers")
        .select("id")
        .eq("organisation_id", orgId)
        .eq("phone", r.cleaned.phone as string);
      if (raceError) throw raceError;
      if ((raceRows?.length ?? 0) > 0) {
        const reason =
          "A customer with this phone was created after the preview — review and re-import";
        failedRows.push({ name: rowLabel(r), reason });
        details.push({
          row_number: r.rowNum,
          outcome: "skipped_existing",
          customer_id: raceRows![0].id as string,
          error_message: reason,
        });
        continue;
      }

      const { data: inserted, error } = await supabase
        .from("customers")
        .insert([buildInsertPayload(r.cleaned, { userId, orgId })])
        .select("id");
      if (error) throw error;
      details.push({
        row_number: r.rowNum,
        outcome: "created",
        customer_id: (inserted?.[0]?.id as string) ?? null,
        error_message: null,
      });
    } catch (_e) {
      const reason = (_e as Error)?.message || "Unknown error";
      failedRows.push({ name: rowLabel(r), reason });
      details.push({ row_number: r.rowNum, outcome: "failed", customer_id: null, error_message: reason });
    }
  }

  const counts = summariseOutcomes(details);
  details.sort((a, b) => a.row_number - b.row_number);

  // --- Audit: import_runs (per-run + per-row) and audit_log (run + mutations) ---
  let runId: string | null = null;
  let auditError: string | null = null;
  try {
    const { data: runRow, error } = await supabase
      .from("import_runs")
      .insert({
        organisation_id: orgId,
        filename: String(body.filename ?? "").trim() || "unknown.xlsx",
        imported_by: userId,
        total_rows: committable.length + ambiguous.length + excludedRows.length,
        created_count: counts.imported,
        updated_count: counts.updated,
        error_count: counts.skipped,
        row_details: details,
      })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    runId = (runRow?.id as string) ?? null;
  } catch (_e) {
    auditError = (_e as Error)?.message || "import_runs insert failed";
    console.error(`${FN}: import_runs insert failed:`, _e);
  }

  if (runId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();
    const actorName = String((profile?.display_name as string) ?? "").trim() || "Office user";
    const auditRows = [
      {
        user_id: userId,
        user_name: actorName,
        user_role: String(access.role ?? "unknown"),
        action_type: "customer_import_committed",
        entity_type: "import_run",
        entity_id: runId,
        detail:
          `Customer import: ${counts.imported} created, ${counts.updated} merged, ` +
          `${counts.skippedExisting} skipped, ${counts.excluded} excluded, ${counts.skipped} failed`,
        metadata: { source: "commit-customer-import", counts, filename: String(body.filename ?? "") },
        organisation_id: orgId,
      },
      // One row per pre-existing customer this run changed — the decisions that
      // altered data that was already in the database.
      ...mutations.map((m) => ({
        user_id: userId,
        user_name: actorName,
        user_role: String(access.role ?? "unknown"),
        action_type: "customer_import_merged",
        entity_type: "customer",
        entity_id: m.customerId,
        detail: `Import row ${m.rowNum} merged into existing customer (${m.fields.join(", ")})`,
        metadata: {
          source: "commit-customer-import",
          import_run_id: runId,
          row_number: m.rowNum,
          decision: "merge",
          fields: m.fields,
        },
        organisation_id: orgId,
      })),
    ];
    const { error: auditErr } = await supabase.from("audit_log").insert(auditRows);
    if (auditErr) {
      auditError = auditError ?? auditErr.message;
      console.error(`${FN}: audit_log insert failed:`, auditErr);
    }

    if (counts.skipped > 0) {
      try {
        await supabase.functions.invoke("notify-import-errors", { body: { runId } });
      } catch (_e) {
        console.error(`${FN}: error-alert email failed:`, _e);
      }
    }
  }

  return jsonResponse(
    {
      orgId,
      runId,
      auditError,
      imported: counts.imported,
      updated: counts.updated,
      skipped: counts.skipped,
      skippedExisting: counts.skippedExisting,
      excluded: counts.excluded,
      failedRows,
      rowDetails: details,
    },
    { headers: cors },
  );
});
